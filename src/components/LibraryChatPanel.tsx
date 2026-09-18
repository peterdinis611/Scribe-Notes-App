import { Eraser, FileText, Library, Send, Settings2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { MarkdownView } from '@/components/MarkdownView'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
} from '@/components/ui/message'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import {
  appendDocumentChatMessage,
  clearDocumentChatMessages,
  listDocumentChatMessages,
} from '@/lib/db/api'
import { nlpStatus } from '@/lib/db/nlp-api'
import {
  askChat,
  documentChatContext,
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
  followups?: string[]
}

type LibraryChatPanelProps = {
  onNavigate?: () => void
}

const LIBRARY_PROMPTS = [
  'libraryChat.prompts.recent',
  'libraryChat.prompts.deadlines',
  'libraryChat.prompts.themes',
  'libraryChat.prompts.openLoops',
] as const

const DOCUMENT_ACTIONS: Array<{ id: DocumentChatAction; labelKey: string }> = [
  { id: 'summarize', labelKey: 'libraryChat.actions.summarize' },
  { id: 'outline', labelKey: 'libraryChat.actions.outline' },
  { id: 'keywords', labelKey: 'libraryChat.actions.keywords' },
  { id: 'quotes', labelKey: 'libraryChat.actions.quotes' },
  { id: 'tasks', labelKey: 'libraryChat.actions.tasks' },
  { id: 'title', labelKey: 'libraryChat.actions.title' },
  { id: 'wiki', labelKey: 'libraryChat.actions.wiki' },
  { id: 'mentions', labelKey: 'libraryChat.actions.mentions' },
  { id: 'dates', labelKey: 'libraryChat.actions.dates' },
  { id: 'similar', labelKey: 'libraryChat.actions.similar' },
  { id: 'questions', labelKey: 'libraryChat.actions.questions' },
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
  const commentAuthor = useAppSelector((state) => state.documents.commentAuthor)
  const sidebarOpen = useAppSelector((state) => state.documents.sidebarOpen)
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

  useEffect(() => {
    if (!sidebarOpen) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [sidebarOpen])

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
        scope === 'document' ? documentChatContext(messagesRef.current) : undefined

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
            return [
              ...withoutOptimistic,
              saved.savedUser,
              { ...saved.savedAssistant, followups: result.followups },
            ]
          })
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              text: result.answer,
              citations: result.citations,
              followups: result.followups,
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
          return [
            ...withoutOptimistic,
            saved.savedUser,
            { ...saved.savedAssistant, followups: result.followups },
          ]
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
  const userInitial = useMemo(() => {
    const name = commentAuthor.trim()
    return name ? name.slice(0, 1).toUpperCase() : t('libraryChat.you').slice(0, 1)
  }, [commentAuthor, t])

  return (
    <div className="library-chat-panel">
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
              <span className="opacity-70">
                {' '}
                ·{' '}
                {messages.length > 0
                  ? t('libraryChat.memoryTurns', { count: messages.length })
                  : t('libraryChat.memoryHint')}
              </span>
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

      <div className="library-chat-thread">
        <div className="flex flex-col gap-3 px-2.5 pb-3 pt-2">
          {historyLoading && messages.length === 0 ? (
            <p className="m-0 px-1 text-[11px] text-[var(--color-muted-foreground)]">
              {t('libraryChat.memoryLoading')}
            </p>
          ) : null}

          {messages.length === 0 && !historyLoading && (
            <div className="library-empty-state">
              <div className="library-empty-state-icon">
                <Sparkles className="h-5 w-5" />
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

          {messages.map((message) => {
            const isUser = message.role === 'user'
            return (
              <Message key={message.id} align={isUser ? 'end' : 'start'}>
                <MessageAvatar>
                  <Avatar
                    className={
                      isUser
                        ? 'border-transparent bg-[var(--color-accent)] text-white'
                        : 'border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_14%,var(--color-surface))] text-[var(--color-accent)]'
                    }
                  >
                    <AvatarFallback>
                      {isUser ? userInitial : <Sparkles className="h-3.5 w-3.5" />}
                    </AvatarFallback>
                  </Avatar>
                </MessageAvatar>
                <MessageContent>
                  <Bubble variant={isUser ? 'primary' : 'muted'} className="max-w-[min(100%,320px)]">
                    <BubbleContent>
                      {isUser ? (
                        <p className="m-0 whitespace-pre-wrap">{message.text}</p>
                      ) : (
                        <MarkdownView
                          source={message.text}
                          headingIds={false}
                          className="scribe-markdown--chat"
                        />
                      )}
                    </BubbleContent>
                  </Bubble>
                  {message.citations && message.citations.length > 0 ? (
                    <MessageFooter aria-label={t('libraryChat.citations')}>
                      <div className="library-chat-sources">
                        {message.citations.map((citation) => (
                          <button
                            key={`${message.id}-${citation.documentId}-${citation.snippet.slice(0, 16)}`}
                            type="button"
                            className="library-chat-source"
                            title={citation.snippet}
                            onClick={() => openDocument(citation.documentId)}
                          >
                            {citation.title || t('libraryChat.untitled')}
                          </button>
                        ))}
                      </div>
                    </MessageFooter>
                  ) : null}
                  {message.followups && message.followups.length > 0 ? (
                    <MessageFooter aria-label={t('libraryChat.followups')}>
                      <div className="library-chat-followups">
                        {message.followups.map((question) => (
                          <button
                            key={`${message.id}-${question}`}
                            type="button"
                            className="library-chat-followup"
                            disabled={loading}
                            onClick={() => void sendQuestion(question)}
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    </MessageFooter>
                  ) : null}
                </MessageContent>
              </Message>
            )
          })}

          {loading ? (
            <Message align="start">
              <MessageAvatar>
                <Avatar className="border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_14%,var(--color-surface))] text-[var(--color-accent)]">
                  <AvatarFallback>
                    <Sparkles className="h-3.5 w-3.5" />
                  </AvatarFallback>
                </Avatar>
              </MessageAvatar>
              <MessageContent>
                <Bubble variant="muted">
                  <BubbleContent>
                    <span className="library-chat-typing" role="status">
                      <span className="library-chat-typing-dot" />
                      <span className="library-chat-typing-dot" />
                      <span className="library-chat-typing-dot" />
                      <span className="sr-only">{t('libraryChat.thinking')}</span>
                    </span>
                  </BubbleContent>
                </Bubble>
                <MessageFooter>
                  <p className="m-0 px-1 text-[10px] text-[var(--color-muted-foreground)]">
                    {t('libraryChat.thinking')}
                  </p>
                </MessageFooter>
              </MessageContent>
            </Message>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="library-chat-composer">
        <div className="library-chat-actions">
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
            className="h-9 min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-accent)]"
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
            className="h-9 w-9 rounded-full"
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
