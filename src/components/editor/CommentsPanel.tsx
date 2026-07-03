import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Check, MessageSquare, PanelRightClose, RotateCcw, Send, Trash2 } from 'lucide-react'
import {
  addCommentReply,
  deleteCommentThread,
  listCommentThreads,
  resolveCommentThread,
  type CommentThread,
} from '@/lib/db/api'
import { focusComment } from '@/lib/editor/comments'
import { cn, formatRelativeTime } from '@/lib/utils'
import { toast } from '@/lib/toast'
import {
  activeDocumentIdAtom,
  commentAuthorAtom,
  commentsVersionAtom,
  setCommentAuthorAtom,
} from '@/store/documents'

type CommentsPanelProps = {
  editor: Editor | null
  onClose: () => void
}

export function CommentsPanel({ editor, onClose }: CommentsPanelProps) {
  const activeId = useAtomValue(activeDocumentIdAtom)
  const author = useAtomValue(commentAuthorAtom)
  const setAuthor = useSetAtom(setCommentAuthorAtom)
  const version = useAtomValue(commentsVersionAtom)
  const setVersionValue = useSetAtom(commentsVersionAtom)
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

  const refresh = useCallback(() => setVersionValue((value) => value + 1), [setVersionValue])

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
      try {
        await resolveCommentThread(thread.id, next)
        editor?.chain().setCommentResolved({ commentId: thread.id, resolved: next }).run()
        setThreads((prev) =>
          prev.map((item) => (item.id === thread.id ? { ...item, resolved: next } : item)),
        )
      } catch (error) {
        toast.error('Nepodarilo sa zmeniť stav', String(error))
      }
    },
    [editor],
  )

  const handleDelete = useCallback(
    async (thread: CommentThread) => {
      try {
        await deleteCommentThread(thread.id)
        editor?.chain().focus().removeCommentById({ commentId: thread.id }).run()
        setThreads((prev) => prev.filter((item) => item.id !== thread.id))
      } catch (error) {
        toast.error('Nepodarilo sa vymazať komentár', String(error))
      }
    },
    [editor],
  )

  const handleReply = useCallback(
    async (thread: CommentThread) => {
      const body = (replyDrafts[thread.id] ?? '').trim()
      if (!body) return
      try {
        const reply = await addCommentReply({ threadId: thread.id, author, body })
        setThreads((prev) =>
          prev.map((item) =>
            item.id === thread.id ? { ...item, comments: [...item.comments, reply] } : item,
          ),
        )
        setReplyDrafts((prev) => ({ ...prev, [thread.id]: '' }))
      } catch (error) {
        toast.error('Nepodarilo sa pridať odpoveď', String(error))
      }
    },
    [author, replyDrafts],
  )

  return (
    <aside className="comments-panel titlebar-no-drag" aria-label="Komentáre">
      <div className="comments-panel-header">
        <div>
          <h2 className="comments-panel-title">Komentáre</h2>
          <p className="comments-panel-subtitle">
            {threads.length === 0
              ? 'Žiadne komentáre'
              : `${threads.length} ${threads.length === 1 ? 'vlákno' : 'vlákien'}`}
          </p>
        </div>
        <div className="comments-panel-header-actions">
          <button
            type="button"
            className="comments-panel-icon-btn"
            title="Obnoviť"
            onClick={refresh}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="comments-panel-icon-btn"
            aria-label="Skryť komentáre"
            onClick={onClose}
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {resolvedCount > 0 && (
        <button
          type="button"
          className="comments-panel-filter"
          onClick={() => setShowResolved((value) => !value)}
        >
          {showResolved ? 'Skryť vyriešené' : `Zobraziť vyriešené (${resolvedCount})`}
        </button>
      )}

      <div className="comments-panel-list">
        {loading && threads.length === 0 ? (
          <p className="comments-panel-empty">Načítavam…</p>
        ) : visibleThreads.length === 0 ? (
          <p className="comments-panel-empty">
            <MessageSquare className="h-5 w-5 opacity-40" />
            Označte text a pridajte komentár cez plávajúcu lištu.
          </p>
        ) : (
          visibleThreads.map((thread) => (
            <div
              key={thread.id}
              className={cn('comment-thread', thread.resolved && 'comment-thread--resolved')}
            >
              {thread.quote && (
                <button
                  type="button"
                  className="comment-thread-quote"
                  onClick={() => handleJump(thread)}
                  title="Prejsť na miesto v texte"
                >
                  “{thread.quote}”
                </button>
              )}

              <div className="comment-thread-messages">
                {thread.comments.map((comment) => (
                  <div key={comment.id} className="comment-message">
                    <div className="comment-message-meta">
                      <span className="comment-message-author">{comment.author}</span>
                      <span className="comment-message-time">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>
                    <p className="comment-message-body">{comment.body}</p>
                  </div>
                ))}
              </div>

              <div className="comment-thread-actions">
                <button
                  type="button"
                  className={cn('comment-thread-action', thread.resolved && 'is-active')}
                  onClick={() => handleResolve(thread)}
                >
                  <Check className="h-3.5 w-3.5" />
                  {thread.resolved ? 'Znovu otvoriť' : 'Vyriešiť'}
                </button>
                <button
                  type="button"
                  className="comment-thread-action comment-thread-action--danger"
                  onClick={() => handleDelete(thread)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Vymazať
                </button>
              </div>

              <form
                className="comment-reply"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleReply(thread)
                }}
              >
                <input
                  className="comment-reply-input"
                  placeholder="Odpovedať…"
                  value={replyDrafts[thread.id] ?? ''}
                  onChange={(event) =>
                    setReplyDrafts((prev) => ({ ...prev, [thread.id]: event.target.value }))
                  }
                />
                <button
                  type="submit"
                  className="comment-reply-send"
                  aria-label="Odoslať odpoveď"
                  disabled={!(replyDrafts[thread.id] ?? '').trim()}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          ))
        )}
      </div>

      <label className="comments-panel-author">
        <span>Podpísané ako</span>
        <input
          className="comments-panel-author-input"
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          placeholder="Vaše meno"
        />
      </label>
    </aside>
  )
}
