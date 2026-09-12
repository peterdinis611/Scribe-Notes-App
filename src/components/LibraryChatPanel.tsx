import { MessageCircle, Send, Settings2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { nlpStatus } from '@/lib/db/nlp-api'
import {
  askLibrary,
  type LibraryChatCitation,
} from '@/lib/library/library-chat'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch } from '@/store/hooks'
import { setActiveDocument, setActiveDocumentId } from '@/store/documentsSlice'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  citations?: LibraryChatCitation[]
}

type LibraryChatPanelProps = {
  onNavigate?: () => void
}

function translateError(message: string, t: (key: string) => string): string {
  if (message.startsWith('libraryChat.') || message.startsWith('nlp.')) {
    return t(message)
  }
  return message
}

export function LibraryChatPanel({ onNavigate }: LibraryChatPanelProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [nlpReady, setNlpReady] = useState<boolean | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, loading])

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

  const send = useCallback(async () => {
    const question = input.trim()
    if (!question || loading) return

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: question,
    }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const result = await askLibrary(question)
      setNlpReady(true)
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: result.answer,
          citations: result.citations,
        },
      ])
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
  }, [input, loading, t])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2.5 px-2 pb-3 pt-1">
          {messages.length === 0 && (
            <div className="library-empty-state">
              <div className="library-empty-state-icon">
                <MessageCircle className="h-5 w-5" />
              </div>
              <p className="library-empty-state-title">{t('libraryChat.emptyTitle')}</p>
              <p className="library-empty-state-text">{t('libraryChat.emptyHint')}</p>
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
                {message.role === 'user' ? t('libraryChat.you') : t('libraryChat.assistant')}
              </p>
              <p className="m-0 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--color-foreground)]">
                {message.text}
              </p>
              {message.citations && message.citations.length > 0 && (
                <div className="mt-2 border-t border-[var(--color-border)] pt-1.5">
                  <p className="m-0 mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    {t('libraryChat.citations')}
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {message.citations.map((citation) => (
                      <li key={`${message.id}-${citation.documentId}`}>
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
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className="h-8 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-[12px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-accent)]"
            placeholder={t('libraryChat.placeholder')}
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
