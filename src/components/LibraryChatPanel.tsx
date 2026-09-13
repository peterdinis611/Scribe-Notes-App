import { Eraser, FileText, Library, MessageCircle, Send, Settings2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { MarkdownView } from '@/components/MarkdownView'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import {
  appendDocumentChatMessage,
  clearDocumentChatMessages,
  listDocumentChatMessages,
} from '@/lib/db/api'
import { nlpStatus } from '@/lib/db/nlp-api'
import {
  askChat,
  runDocumentChatAction,
  type ChatScope,
  type DocumentChatAction,
  type LibraryChatCitation,
} from '@/lib/library/library-chat'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocument, setActiveDocumentId } from '@/store/documentsSlice'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  citations?: LibraryChatCitation[]
  action?: string | null
}

type LibraryChatPanelProps = {
  onNavigate?: () => void
}

const LIBRARY_PROMPTS = [
  'libraryChat.prompts.recent',
  'libraryChat.prompts.deadlines',
  'libraryChat.prompts.themes',
] as const

const DOCUMENT_ACTIONS: Array<{ id: DocumentChatAction; labelKey: string }> = [
  { id: 'summarize', labelKey: 'libraryChat.actions.summarize' },
  { id: 'outline', labelKey: 'libraryChat.actions.outline' },
  { id: 'keywords', labelKey: 'libraryChat.actions.keywords' },
  { id: 'tasks', labelKey: 'libraryChat.actions.tasks' },
  { id: 'title', labelKey: 'libraryChat.actions.title' },
  { id: 'wiki', labelKey: 'libraryChat.actions.wiki' },
  { id: 'dates', labelKey: 'libraryChat.actions.dates' },
  { id: 'tone', labelKey: 'libraryChat.actions.tone' },
  { id: 'spellcheck', labelKey: 'libraryChat.actions.spellcheck' },
]

function translateError(message: string, t: (key: string) => string): string {
  if (message.startsWith('libraryChat.') || message.startsWith('nlp.') || message.startsWith('documentChat.')) {
    return t(message)
  }
  return message
}

function toChatMessage(row: {
  id: string
  role: string
  text: string
  action?: string | null
  citations: LibraryChatCitation[]
}): ChatMessage {
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    text: row.text,
    action: row.action,
    citations: row.citations,
  }
}

export function LibraryChatPanel({ onNavigate }: LibraryChatPanelProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const activeDocumentId = useAppSelector((state) => state.documents.activeDocumentId)
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const [scope, setScope] = useState<ChatScope>(() => (activeDocumentId ? 'document' : 'library'))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [nlpReady, setNlpReady] = useState<boolean | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const libraryMessagesRef = useRef<ChatMessage[]>([])
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    let cancelled = false
    void nlpStatus()
      .then((status) => {
        if (!cancelled) setNlpReady(Boolean(status.enabled && status.sidecarOk))
      })
      .catch(() => {
        if (!cancelled) setNlpReady(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const prevDocIdRef = useRef<string | null>(activeDocumentId)

  useEffect(() => {
    const prev = prevDocIdRef.current
    prevDocIdRef.current = activeDocumentId
    if (!activeDocumentId) {
      if (scope === 'document') setScope('library')
      return
    }
    // Opening a document (or switching docs) → go to document chat with that note's memory.
    if (activeDocumentId !== prev) {
      setScope('document')
    }
  }, [activeDocumentId, scope])

  useEffect(() => {
    let cancelled = false
    if (scope !== 'document' || !activeDocumentId) {
      if (scope === 'library') {
        setMessages(libraryMessagesRef.current)
      }
      return
    }

    setHistoryLoading(true)
    void listDocumentChatMessages(activeDocumentId)
      .then((rows) => {
        if (cancelled) return
        setMessages(rows.map(toChatMessage))
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(t('libraryChat.memoryLoadError'), String(error))
          setMessages([])
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [scope, activeDocumentId, t])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, loading, historyLoading])

  const openDocument = useCallback(
    (documentId: string) => {
      dispatch(setActiveDocumentId(documentId))
      const cached = peekCachedDocument(documentId)
      if (cached) dispatch(setActiveDocument(cached))
      void navigate(ROUTES.document(documentId))
      onNavigate?.()
    },
    [dispatch, navigate, onNavigate],
  )

  const persistPair = useCallback(
    async (
      documentId: string,
      userText: string,
      assistant: { text: string; citations?: LibraryChatCitation[]; action?: string | null },
    ) => {
      const savedUser = await appendDocumentChatMessage({
        documentId,
        role: 'user',
        text: userText,
        action: assistant.action ?? null,
      })
      const savedAssistant = await appendDocumentChatMessage({
        documentId,
        role: 'assistant',
        text: assistant.text,
        citations: assistant.citations,
        action: assistant.action ?? null,
      })
      return { savedUser: toChatMessage(savedUser), savedAssistant: toChatMessage(savedAssistant) }
    },
    [],
  )

  const changeScope = useCallback(
    (next: ChatScope) => {
      if (next === scope) return
      if (scope === 'library') {
        libraryMessagesRef.current = messagesRef.current
      }
      setScope(next)
      if (next === 'library') {
        setMessages(libraryMessagesRef.current)
      }
    },
    [scope],
  )

  const clearMemory = useCallback(async () => {
    if (!activeDocumentId || scope !== 'document') return
    try {
      await clearDocumentChatMessages(activeDocumentId)
      setMessages([])
      toast.success(t('libraryChat.memoryCleared'))
    } catch (error) {
      toast.error(t('libraryChat.memoryClearError'), String(error))
    }
  }, [activeDocumentId, scope, t])

  const sendQuestion = useCallback(
    async (question: string) => {
      const trimmed = question.trim()
      if (!trimmed || loading) return
      if (scope === 'document' && !activeDocumentId) {
        toast.error(t('libraryChat.errorTitle'), t('libraryChat.noActiveDocument'))
        return
      }

      const context =
        scope === 'document'
          ? messagesRef.current.slice(-8).map((item) => ({ role: item.role, text: item.text }))
          : undefined

      setInput('')
      setLoading(true)
      const optimisticUser: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: trimmed,
      }
      setMessages((prev) => [...prev, optimisticUser])

      try {
        const result = await askChat(scope, trimmed, activeDocumentId, context)
        setNlpReady(true)
        if (scope === 'document' && activeDocumentId) {
          const saved = await persistPair(activeDocumentId, trimmed, {
            text: result.answer,
            citations: result.citations,
          })
          setMessages((prev) => {
            const withoutOptimistic = prev.filter((item) => item.id !== optimisticUser.id)
            return [...withoutOptimistic, saved.savedUser, saved.savedAssistant]
          })
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              text: result.answer,
              citations: result.citations,
            },
          ])
        }
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error)
        if (raw === 'libraryChat.nlpDisabled' || raw === 'libraryChat.sidecarUnavailable') {
          setNlpReady(false)
        }
        const description = translateError(raw, t)
        toast.error(t('libraryChat.errorTitle'), description)
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: description,
          },
        ])
      } finally {
        setLoading(false)
        inputRef.current?.focus()
      }
    },
    [activeDocumentId, loading, persistPair, scope, t],
  )

  const runAction = useCallback(
    async (action: DocumentChatAction) => {
      if (!activeDocumentId || loading) return
      const label = t(`libraryChat.actions.${action}`)
      setLoading(true)
      const optimisticUser: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: label,
        action,
      }
      setMessages((prev) => [...prev, optimisticUser])
      try {
        const result = await runDocumentChatAction(activeDocumentId, action)
        setNlpReady(true)
        const saved = await persistPair(activeDocumentId, label, {
          text: result.answer,
          citations: result.citations,
          action,
        })
        setMessages((prev) => {
          const withoutOptimistic = prev.filter((item) => item.id !== optimisticUser.id)
          return [...withoutOptimistic, saved.savedUser, saved.savedAssistant]
        })
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error)
        if (raw === 'libraryChat.nlpDisabled' || raw === 'libraryChat.sidecarUnavailable') {
          setNlpReady(false)
        }
        const description = translateError(raw, t)
        toast.error(t('libraryChat.errorTitle'), description)
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', text: description },
        ])
      } finally {
        setLoading(false)
        inputRef.current?.focus()
      }
    },
    [activeDocumentId, loading, persistPair, t],
  )

  const docTitle =
    activeDocument?.title?.trim() ||
    (activeDocumentId ? t('libraryChat.untitled') : null)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[var(--color-border)] px-2 py-2">
        <div
          className="inline-flex w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
          role="group"
          aria-label={t('libraryChat.scopeLabel')}
        >
          <button
            type="button"
            className={cn(
              'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[5px] border-none text-[11px] font-medium transition-colors',
              scope === 'library'
                ? 'bg-[var(--color-selection)] text-[var(--color-foreground)]'
                : 'bg-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
            )}
            aria-pressed={scope === 'library'}
            onClick={() => changeScope('library')}
          >
            <Library className="h-3 w-3" />
            {t('libraryChat.scopeLibrary')}
          </button>
          <button
            type="button"
            className={cn(
              'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[5px] border-none text-[11px] font-medium transition-colors',
              scope === 'document'
                ? 'bg-[var(--color-selection)] text-[var(--color-foreground)]'
                : 'bg-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
              !activeDocumentId && 'opacity-50',
            )}
            aria-pressed={scope === 'document'}
            disabled={!activeDocumentId}
            title={
              activeDocumentId
                ? t('libraryChat.scopeDocumentHint', { title: docTitle })
                : t('libraryChat.noActiveDocument')
            }
            onClick={() => activeDocumentId && changeScope('document')}
          >
            <FileText className="h-3 w-3" />
            {t('libraryChat.scopeDocument')}
          </button>
        </div>
        {scope === 'document' && docTitle ? (
          <div className="mt-1.5 flex items-center gap-2 px-0.5">
            <p className="m-0 min-w-0 flex-1 truncate text-[10px] text-[var(--color-muted-foreground)]">
              {t('libraryChat.askingAbout', { title: docTitle })}
              <span className="opacity-70"> · {t('libraryChat.memoryHint')}</span>
            </p>
            {messages.length > 0 ? (
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-transparent px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:border-[var(--color-border)] hover:text-[var(--color-foreground)]"
                title={t('libraryChat.clearMemory')}
                onClick={() => void clearMemory()}
              >
                <Eraser className="h-3 w-3" />
                {t('libraryChat.clearMemory')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2.5 px-2 pb-3 pt-1">
          {historyLoading && messages.length === 0 ? (
            <p className="m-0 px-1 text-[11px] text-[var(--color-muted-foreground)]">
              {t('libraryChat.memoryLoading')}
            </p>
          ) : null}

          {messages.length === 0 && !historyLoading && (
            <div className="library-empty-state">
              <div className="library-empty-state-icon">
                <MessageCircle className="h-5 w-5" />
              </div>
              <p className="library-empty-state-title">
                {scope === 'document'
                  ? t('libraryChat.emptyTitleDocument')
                  : t('libraryChat.emptyTitle')}
              </p>
              <p className="library-empty-state-text">
                {scope === 'document'
                  ? t('libraryChat.emptyHintDocument')
                  : t('libraryChat.emptyHint')}
              </p>
              {nlpReady === false && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 h-7 gap-1.5 text-[11px]"
                  onClick={() => {
                    void navigate(ROUTES.settingsSection('nlp'))
                    onNavigate?.()
                  }}
                >
                  <Settings2 className="h-3 w-3" />
                  {t('libraryChat.openSettings')}
                </Button>
              )}
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'rounded-[var(--radius-sm)] border px-2.5 py-2',
                message.role === 'user'
                  ? 'ml-4 border-transparent bg-[var(--color-selection)]'
                  : 'mr-2 border-[var(--color-border)] bg-[var(--color-surface)]',
              )}
            >
              <p className="m-0 mb-1 [font-family:var(--font-mono)] text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-muted-foreground)]">
                {message.role === 'user'
                  ? t('libraryChat.you')
                  : scope === 'document'
                    ? t('libraryChat.assistantDocument')
                    : t('libraryChat.assistant')}
              </p>
              {message.role === 'assistant' ? (
                <MarkdownView source={message.text} className="scribe-markdown--chat" />
              ) : (
                <p className="m-0 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--color-foreground)]">
                  {message.text}
                </p>
              )}
              {message.citations && message.citations.length > 0 && (
                <div className="mt-2 border-t border-[var(--color-border)] pt-1.5">
                  <p className="m-0 mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    {t('libraryChat.citations')}
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {message.citations.map((citation) => (
                      <li key={`${message.id}-${citation.documentId}-${citation.snippet.slice(0, 24)}`}>
                        <button
                          type="button"
                          className="w-full rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1.5 py-1 text-left transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-hover)]"
                          onClick={() => openDocument(citation.documentId)}
                          title={citation.snippet}
                        >
                          <span className="block truncate text-[12px] font-semibold text-[var(--color-accent)]">
                            {citation.title || t('libraryChat.untitled')}
                          </span>
                          {citation.snippet && (
                            <span className="mt-0.5 line-clamp-2 block text-[10px] leading-snug text-[var(--color-muted-foreground)]">
                              {citation.snippet}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <p className="m-0 px-1 text-[11px] text-[var(--color-muted-foreground)]">
              {t('libraryChat.thinking')}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-[var(--color-border)] px-2 py-2">
        <div className="mb-2 flex flex-wrap gap-1">
          {scope === 'library'
            ? LIBRARY_PROMPTS.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={loading}
                  className="rounded-full border border-[var(--color-border)] bg-transparent px-2 py-0.5 text-[10px] text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-foreground)] disabled:opacity-50"
                  onClick={() => void sendQuestion(t(key))}
                >
                  {t(key)}
                </button>
              ))
            : DOCUMENT_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={loading || !activeDocumentId}
                  className="rounded-full border border-[var(--color-border)] bg-transparent px-2 py-0.5 text-[10px] text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-foreground)] disabled:opacity-50"
                  onClick={() => void runAction(action.id)}
                >
                  {t(action.labelKey)}
                </button>
              ))}
        </div>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            void sendQuestion(input)
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className="h-8 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-[12px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-accent)]"
            placeholder={
              scope === 'document'
                ? t('libraryChat.placeholderDocument')
                : t('libraryChat.placeholder')
            }
            value={input}
            disabled={loading}
            onChange={(event) => setInput(event.target.value)}
            aria-label={t('libraryChat.placeholder')}
          />
          <Button
            type="submit"
            variant="default"
            size="icon"
            className="h-8 w-8"
            disabled={loading || !input.trim()}
            aria-label={t('libraryChat.send')}
            title={t('libraryChat.send')}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  )
}
