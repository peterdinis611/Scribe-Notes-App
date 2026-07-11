import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Check, MessageSquare, PanelRightClose, RotateCcw, Send, Trash2 } from 'lucide-react'
import {
  addCommentReply,
  deleteCommentThread,
  listCommentThreads,
  resolveCommentThread,
  type CommentThread,
} from '@/lib/db/api'
import { findCommentRange, focusComment } from '@/lib/editor/comments'
import { cn, formatRelativeTime } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { bumpCommentsVersion, setCommentAuthor } from '@/store/documentsSlice'
import { Input } from '@/components/ui/input'
import {
  EditorSidePanel,
  EditorSidePanelEmpty,
  EditorSidePanelHeader,
  EditorSidePanelIconButton,
  EditorSidePanelList,
} from '@/components/editor/EditorSidePanelPrimitives'

type CommentsPanelProps = {
  editor: Editor | null
  onClose: () => void
}

export function CommentsPanel({ editor, onClose }: CommentsPanelProps) {
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const author = useAppSelector((state) => state.documents.commentAuthor)
  const version = useAppSelector((state) => state.documents.commentsVersion)
  const dispatch = useAppDispatch()
  const [threads, setThreads] = useState<CommentThread[]>([])
  const [showResolved, setShowResolved] = useState(false)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!activeId) {
      setThreads([])
      return
    }
    setLoading(true)
    listCommentThreads(activeId)
      .then((result) => {
        if (!cancelled) setThreads(result)
      })
      .catch((error) => {
        if (!cancelled) toast.error('Nepodarilo sa načítať komentáre', String(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeId, version])

  const refresh = useCallback(() => dispatch(bumpCommentsVersion()), [dispatch])

  const visibleThreads = useMemo(
    () => threads.filter((thread) => showResolved || !thread.resolved),
    [threads, showResolved],
  )
  const resolvedCount = useMemo(
    () => threads.filter((thread) => thread.resolved).length,
    [threads],
  )

  const handleJump = useCallback(
    (thread: CommentThread) => {
      if (!editor) return
      const found = focusComment(editor, thread.id)
      if (!found) toast.info('Ukotvenie komentára sa v texte nenašlo')
    },
    [editor],
  )

  const handleResolve = useCallback(
    async (thread: CommentThread) => {
      const next = !thread.resolved
      const previous = thread.resolved
      editor?.chain().setCommentResolved({ commentId: thread.id, resolved: next }).run()
      setThreads((prev) =>
        prev.map((item) => (item.id === thread.id ? { ...item, resolved: next } : item)),
      )

      try {
        await resolveCommentThread(thread.id, next)
      } catch (error) {
        editor?.chain().setCommentResolved({ commentId: thread.id, resolved: previous }).run()
        setThreads((prev) =>
          prev.map((item) => (item.id === thread.id ? { ...item, resolved: previous } : item)),
        )
        toast.error('Nepodarilo sa zmeniť stav', String(error))
      }
    },
    [editor],
  )

  const handleDelete = useCallback(
    async (thread: CommentThread) => {
      const range = editor ? findCommentRange(editor, thread.id) : null
      setThreads((prev) => prev.filter((item) => item.id !== thread.id))
      editor?.chain().focus().removeCommentById({ commentId: thread.id }).run()

      try {
        await deleteCommentThread(thread.id)
      } catch (error) {
        setThreads((prev) => [...prev, thread].sort((a, b) => a.createdAt - b.createdAt))
        if (editor && range) {
          editor
            .chain()
            .focus()
            .setTextSelection(range)
            .setComment({ commentId: thread.id })
            .run()
        }
        toast.error('Nepodarilo sa vymazať komentár', String(error))
      }
    },
    [editor],
  )

  const handleReply = useCallback(
    async (thread: CommentThread) => {
      const body = (replyDrafts[thread.id] ?? '').trim()
      if (!body) return

      const optimisticId = `pending-${Date.now()}`
      const optimisticReply = {
        id: optimisticId,
        threadId: thread.id,
        author,
        body,
        createdAt: Date.now(),
      }

      setThreads((prev) =>
        prev.map((item) =>
          item.id === thread.id
            ? { ...item, comments: [...item.comments, optimisticReply] }
            : item,
        ),
      )
      setReplyDrafts((prev) => ({ ...prev, [thread.id]: '' }))

      try {
        const reply = await addCommentReply({ threadId: thread.id, author, body })
        setThreads((prev) =>
          prev.map((item) =>
            item.id === thread.id
              ? {
                  ...item,
                  comments: item.comments.map((comment) =>
                    comment.id === optimisticId ? reply : comment,
                  ),
                }
              : item,
          ),
        )
      } catch (error) {
        setThreads((prev) =>
          prev.map((item) =>
            item.id === thread.id
              ? {
                  ...item,
                  comments: item.comments.filter((comment) => comment.id !== optimisticId),
                }
              : item,
          ),
        )
        setReplyDrafts((prev) => ({ ...prev, [thread.id]: body }))
        toast.error('Nepodarilo sa pridať odpoveď', String(error))
      }
    },
    [author, replyDrafts],
  )

  return (
    <EditorSidePanel className="titlebar-no-drag" aria-label="Komentáre">
      <EditorSidePanelHeader
        title="Komentáre"
        subtitle={
          threads.length === 0
            ? 'Žiadne komentáre'
            : `${threads.length} ${threads.length === 1 ? 'vlákno' : 'vlákien'}`
        }
        actions={
          <div className="inline-flex gap-0.5">
            <EditorSidePanelIconButton title="Obnoviť" onClick={refresh}>
              <RotateCcw className="h-4 w-4" />
            </EditorSidePanelIconButton>
            <EditorSidePanelIconButton aria-label="Skryť komentáre" onClick={onClose}>
              <PanelRightClose className="h-4 w-4" />
            </EditorSidePanelIconButton>
          </div>
        }
      />

      {resolvedCount > 0 && (
        <button
          type="button"
          className="mx-3 mt-2 rounded-lg border border-dashed border-[var(--color-border)] bg-transparent px-2.5 py-1.5 text-[11px] text-[var(--color-muted-foreground)] hover:border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))] hover:text-[var(--color-accent)]"
          onClick={() => setShowResolved((value) => !value)}
        >
          {showResolved ? 'Skryť vyriešené' : `Zobraziť vyriešené (${resolvedCount})`}
        </button>
      )}

      <EditorSidePanelList>
        {loading && threads.length === 0 ? (
          <EditorSidePanelEmpty>Načítavam…</EditorSidePanelEmpty>
        ) : visibleThreads.length === 0 ? (
          <EditorSidePanelEmpty>
            <MessageSquare className="h-5 w-5 opacity-40" />
            Označte text a pridajte komentár cez plávajúcu lištu.
          </EditorSidePanelEmpty>
        ) : (
          visibleThreads.map((thread) => (
            <div
              key={thread.id}
              className={cn(
                'flex flex-col gap-2 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2.5',
                thread.resolved && 'opacity-[0.66]',
              )}
            >
              {thread.quote && (
                <button
                  type="button"
                  className="border-l-[3px] border-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] bg-transparent py-0.5 pl-2 text-left text-[11px] italic text-[var(--color-muted-foreground)] hover:text-[var(--color-accent)]"
                  onClick={() => handleJump(thread)}
                  title="Prejsť na miesto v texte"
                >
                  “{thread.quote}”
                </button>
              )}

              <div className="flex flex-col gap-2">
                {thread.comments.map((comment) => (
                  <div key={comment.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-semibold">{comment.author}</span>
                      <span className="text-[10px] text-[var(--color-muted-foreground)]">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-snug">
                      {comment.body}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex gap-1.5">
                <button
                  type="button"
                  className={cn(
                    'inline-flex items-center gap-1 rounded-[7px] border border-[var(--color-border)] bg-transparent px-2 py-0.5 text-[11px] text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
                    thread.resolved && 'border-[color-mix(in_srgb,#16a34a_40%,var(--color-border))] text-[#16a34a]',
                  )}
                  onClick={() => handleResolve(thread)}
                >
                  <Check className="h-3.5 w-3.5" />
                  {thread.resolved ? 'Znovu otvoriť' : 'Vyriešiť'}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-[7px] border border-[var(--color-border)] bg-transparent px-2 py-0.5 text-[11px] text-[var(--color-muted-foreground)] hover:border-[color-mix(in_srgb,var(--color-destructive)_40%,var(--color-border))] hover:bg-[var(--color-hover)] hover:text-[var(--color-destructive)]"
                  onClick={() => handleDelete(thread)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Vymazať
                </button>
              </div>

              <form
                className="flex gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleReply(thread)
                }}
              >
                <Input
                  className="h-8 min-w-0 flex-1 text-[12px]"
                  placeholder="Odpovedať…"
                  value={replyDrafts[thread.id] ?? ''}
                  onChange={(event) =>
                    setReplyDrafts((prev) => ({ ...prev, [thread.id]: event.target.value }))
                  }
                />
                <button
                  type="submit"
                  className="inline-flex w-[30px] items-center justify-center rounded-[7px] border-none bg-[var(--color-accent)] text-white disabled:opacity-40"
                  aria-label="Odoslať odpoveď"
                  disabled={!(replyDrafts[thread.id] ?? '').trim()}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          ))
        )}
      </EditorSidePanelList>

      <label className="flex items-center gap-2 border-t border-[var(--color-border)] px-3.5 py-2.5 text-[11px] text-[var(--color-muted-foreground)]">
        <span>Podpísané ako</span>
        <Input
          className="h-7 min-w-0 flex-1 text-[12px]"
          value={author}
          onChange={(event) => dispatch(setCommentAuthor(event.target.value))}
          placeholder="Vaše meno"
        />
      </label>
    </EditorSidePanel>
  )
}
