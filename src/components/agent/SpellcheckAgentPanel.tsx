import { Eraser, GraduationCap, Send, SpellCheck2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AgentApplyPreviewDialog,
  type AgentApplyPreviewKind,
} from '@/components/agent/AgentApplyPreviewDialog'
import {
  AgentBlobatar,
  type AgentBlobatarMood,
} from '@/components/agent/AgentBlobatar'
import { MarkdownView } from '@/components/MarkdownView'
import { Button } from '@/components/ui/button'
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
} from '@/components/ui/message'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { applySpellSuggestion } from '@/lib/editor/apply-suggestions'
import { AGENT_TEACHING_MAX_LEN } from '@/lib/library/agent-prefs'
import {
  AGENT_TEACH_DRAFT_MAX_LEN,
  distillTeachingWithLlm,
} from '@/lib/library/agent-teach'
import {
  applySpellcheckFixes,
  runSpellcheckAgent,
  SPELLCHECK_AGENT_BLOBATAR_NAME,
  type SpellcheckAgentFix,
} from '@/lib/library/spellcheck-agent'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { addAgentTeaching, removeAgentTeaching, setAgentPrefs } from '@/store/settingsSlice'

type SpellThreadMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  fixes?: SpellcheckAgentFix[]
  createdAt?: number
}

type SpellcheckAgentPanelProps = {
  onClose?: () => void
}

export function SpellcheckAgentPanel({ onClose: _onClose }: SpellcheckAgentPanelProps) {
  const { t, i18n } = useTranslation()
  const dispatch = useAppDispatch()
  const activeDocumentId = useAppSelector((state) => state.documents.activeDocumentId)
  const commentAuthor = useAppSelector((state) => state.documents.commentAuthor)
  const agentPrefs = useAppSelector((state) => state.settings.agentPrefs)
  const activeDocument = activeDocumentId ? peekCachedDocument(activeDocumentId) : null
  const slovak = i18n.language?.toLowerCase().startsWith('sk')

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<SpellThreadMessage[]>([])
  const [blobMood, setBlobMood] = useState<AgentBlobatarMood>('idle')
  const [applyPreview, setApplyPreview] = useState<AgentApplyPreviewKind | null>(null)
  const [applyBusy, setApplyBusy] = useState(false)
  const [showTeach, setShowTeach] = useState(false)
  const [teachInput, setTeachInput] = useState('')
  const [teachBusy, setTeachBusy] = useState(false)
  const applyPendingRef = useRef<null | (() => void)>(null)
  const moodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)

  const setMoodBriefly = useCallback((mood: AgentBlobatarMood) => {
    setBlobMood(mood)
    if (moodTimerRef.current) clearTimeout(moodTimerRef.current)
    moodTimerRef.current = setTimeout(() => setBlobMood('idle'), 1600)
  }, [])

  useEffect(() => {
    return () => {
      if (moodTimerRef.current) clearTimeout(moodTimerRef.current)
    }
  }, [])

  // Own session thread — does not share history with the general Local Agent.
  useEffect(() => {
    setMessages([])
  }, [activeDocumentId])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  const starters = slovak
    ? [
        'Skontroluj pravopis',
        'Nájdi preklepy',
        'Oprav zjavné chyby',
      ]
    : ['Check spelling', 'Find typos', 'Fix obvious mistakes']

  const queueApply = useCallback(
    (fixes: SpellcheckAgentFix[]) => {
      if (!activeDocumentId) {
        toast.error(t('libraryChat.noActiveDocument'))
        return
      }
      const previewFixes = fixes.map((fix) => ({
        word: fix.word,
        suggestion: fix.suggestion,
      }))
      setApplyPreview({ type: 'spellcheck', fixes: previewFixes })
      applyPendingRef.current = () => {
        const applied = applySpellcheckFixes(fixes)
        if (applied > 0) toast.success(t('agent.applySpellcheckDone', { count: applied }))
        else toast.error(t('agent.applySpellcheckFailed'))
      }
    },
    [activeDocumentId, t],
  )

  const runCheck = useCallback(
    async (goal?: string) => {
      if (!activeDocumentId || loading) return
      if (!agentPrefs.enabled) {
        toast.error(t('agent.errorTitle'), t('agent.disabled'))
        return
      }
      const displayGoal = (goal || input).trim() || t('agent.spellAgent.defaultGoal')
      const userMsg: SpellThreadMessage = {
        id: `spell-user-${Date.now()}`,
        role: 'user',
        text: displayGoal,
        createdAt: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setLoading(true)
      setBlobMood('thinking')

      try {
        const prior = [...messages, userMsg].map((item) => ({
          role: item.role,
          text: item.text,
        }))
        const result = await runSpellcheckAgent(
          activeDocumentId,
          displayGoal,
          prior.map((item) => ({ role: item.role, text: item.text })),
          agentPrefs,
        )
        if (result.nextPrefs) dispatch(setAgentPrefs(result.nextPrefs))

        const assistant: SpellThreadMessage = {
          id: `spell-assistant-${Date.now()}`,
          role: 'assistant',
          text: result.answer || t('agent.spellAgent.empty'),
          fixes: result.fixes,
          createdAt: Date.now(),
        }
        setMessages((prev) => [...prev, assistant])
        setMoodBriefly(result.fixes.length ? 'done' : 'idle')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const key =
          message.startsWith('libraryChat.') || message.startsWith('agent.') ? message : null
        toast.error(t('agent.errorTitle'), key ? t(key) : message)
        setMoodBriefly('error')
      } finally {
        setLoading(false)
      }
    },
    [activeDocumentId, agentPrefs, dispatch, input, loading, messages, setMoodBriefly, t],
  )

  const clearThread = useCallback(() => {
    setMessages([])
  }, [])

  const grammarTeachings = agentPrefs.teachings.filter((item) => item.topic === 'grammar')

  const handleTeachGrammar = useCallback(async () => {
    const draft = teachInput.trim()
    if (draft.length < 2 || teachBusy) return
    setTeachBusy(true)
    try {
      const result = await distillTeachingWithLlm(draft, {
        force: draft.length > AGENT_TEACHING_MAX_LEN || draft.includes('\n'),
        topic: 'grammar',
      })
      dispatch(
        addAgentTeaching({
          text: result.text,
          topic: 'grammar',
          scope: activeDocumentId ? 'document' : 'global',
          documentId: activeDocumentId,
        }),
      )
      setTeachInput('')
      toast.success(
        result.distilled
          ? t('settings.agent.teachRefinedToast')
          : t('settings.agent.taughtGrammarToast'),
      )
    } catch {
      toast.error(t('settings.agent.teachRefineOffline'))
    } finally {
      setTeachBusy(false)
    }
  }, [activeDocumentId, dispatch, t, teachBusy, teachInput])

  const docTitle =
    activeDocument?.title?.trim() ||
    (activeDocumentId ? t('libraryChat.untitled') : null)
  const userName = commentAuthor.trim() || t('libraryChat.you')

  return (
    <div className="library-chat-panel agent-panel agent-panel--dock spellcheck-agent-panel">
      <div className="agent-panel-toolbar shrink-0">
        <div className="spellcheck-agent-meta">
          <SpellCheck2 className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden />
          <p className="library-chat-scope-meta">
            {activeDocumentId
              ? t('agent.spellAgent.askingAbout', { title: docTitle })
              : t('agent.spellAgent.needsDocument')}
          </p>
        </div>
        {messages.length > 0 ? (
          <button type="button" className="library-chat-clear" onClick={() => void clearThread()}>
            <Eraser className="h-3 w-3" />
            {t('agent.clearMemory')}
          </button>
        ) : null}
      </div>

      <div className="library-chat-scroll">
        <div className="library-chat-thread">
          {messages.length === 0 && !loading ? (
            <div className="agent-empty-state spellcheck-agent-empty">
              <AgentBlobatar
                name={SPELLCHECK_AGENT_BLOBATAR_NAME}
                size={48}
                mood={blobMood}
                title={t('agent.spellAgent.faceTitle')}
              />
              <p className="agent-empty-title">{t('agent.spellAgent.emptyTitle')}</p>
              <p className="agent-empty-copy">{t('agent.spellAgent.emptyHint')}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {starters.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="library-chat-chip"
                    disabled={!activeDocumentId || loading || !agentPrefs.enabled}
                    onClick={() => void runCheck(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message) => (
            <Message key={message.id} className={cn(message.role === 'user' && 'is-user')}>
              <MessageAvatar>
                {message.role === 'assistant' ? (
                  <AgentBlobatar
                    name={SPELLCHECK_AGENT_BLOBATAR_NAME}
                    size={28}
                    title={t('agent.spellAgent.faceTitle')}
                  />
                ) : (
                  <AgentBlobatar name={userName} size={28} title={t('agent.yourFaceTitle')} />
                )}
              </MessageAvatar>
              <MessageContent>
                <Bubble>
                  <BubbleContent>
                    {message.role === 'assistant' ? (
                      <MarkdownView markdown={message.text} />
                    ) : (
                      <p className="m-0 whitespace-pre-wrap">{message.text}</p>
                    )}
                  </BubbleContent>
                </Bubble>
                {message.role === 'assistant' && message.fixes && message.fixes.length > 0 ? (
                  <MessageFooter>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="library-chat-chip is-active"
                        disabled={loading}
                        onClick={() => queueApply(message.fixes!)}
                      >
                        {t('agent.applySpellcheck')}
                      </button>
                      {message.fixes.slice(0, 6).map((fix) => (
                        <button
                          key={`${message.id}-${fix.word}-${fix.suggestion}`}
                          type="button"
                          className="library-chat-chip"
                          disabled={loading}
                          title={
                            fix.alternatives.length
                              ? fix.alternatives.join(', ')
                              : fix.suggestion
                          }
                          onClick={() => {
                            if (applySpellSuggestion(fix.word, fix.suggestion)) {
                              toast.success(
                                t('panels.insights.spellcheckApplied', { word: fix.suggestion }),
                              )
                            } else {
                              toast.error(t('agent.applySpellcheckFailed'))
                            }
                          }}
                        >
                          {fix.word} → {fix.suggestion}
                        </button>
                      ))}
                    </div>
                  </MessageFooter>
                ) : null}
              </MessageContent>
            </Message>
          ))}

          {loading ? (
            <div className="library-chat-status agent-thinking-row" role="status">
              <AgentBlobatar
                name={SPELLCHECK_AGENT_BLOBATAR_NAME}
                size={22}
                mood="thinking"
                title={t('agent.spellAgent.faceTitle')}
              />
              <span>{t('agent.spellAgent.thinking')}</span>
            </div>
          ) : null}
          <div ref={threadEndRef} />
        </div>
      </div>

      <div className="library-chat-composer">
        <div className="mb-1.5 flex flex-wrap gap-1">
          <button
            type="button"
            className="library-chat-chip is-active"
            disabled={!activeDocumentId || loading || !agentPrefs.enabled}
            onClick={() => void runCheck(t('agent.spellAgent.defaultGoal'))}
          >
            {t('agent.spellAgent.runNow')}
          </button>
          <button
            type="button"
            className={cn('library-chat-chip', showTeach && 'is-active')}
            disabled={!agentPrefs.enabled}
            onClick={() => setShowTeach((value) => !value)}
          >
            <GraduationCap className="mr-1 inline h-3 w-3" />
            {t('settings.agent.teachTopicGrammar')}
          </button>
          {starters.map((chip) => (
            <button
              key={`footer-${chip}`}
              type="button"
              className="library-chat-chip"
              disabled={!activeDocumentId || loading || !agentPrefs.enabled}
              onClick={() => void runCheck(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
        {showTeach ? (
          <div className="mb-2 space-y-1.5 rounded-lg border border-[var(--color-border)] p-2">
            <p className="m-0 text-[11px] text-[var(--color-muted-foreground)]">
              {t('settings.agent.teachTopicGrammarHint')}
            </p>
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(event) => {
                event.preventDefault()
                void handleTeachGrammar()
              }}
            >
              <textarea
                className="library-chat-input min-h-[3.5rem] resize-y"
                value={teachInput}
                maxLength={AGENT_TEACH_DRAFT_MAX_LEN}
                placeholder={t('settings.agent.teachPlaceholderGrammar')}
                onChange={(event) => setTeachInput(event.target.value)}
              />
              <Button
                type="submit"
                size="sm"
                className="self-end"
                disabled={teachInput.trim().length < 2 || teachBusy}
              >
                {teachBusy ? t('settings.agent.teachRefineBusy') : t('settings.agent.teachAdd')}
              </Button>
            </form>
            {grammarTeachings.slice(0, 4).map((item) => (
              <button
                key={item.id}
                type="button"
                className="library-chat-chip w-full justify-between text-left"
                title={t('settings.agent.teachRemove')}
                onClick={() => dispatch(removeAgentTeaching(item.id))}
              >
                <span className="truncate">{item.text}</span>
                <Eraser className="ml-1 h-3 w-3 shrink-0 opacity-70" />
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            void runCheck(input)
          }}
        >
          <input
            className="library-chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t('agent.spellAgent.placeholder')}
            disabled={loading || !agentPrefs.enabled || !activeDocumentId}
            aria-label={t('agent.spellAgent.placeholder')}
          />
          <Button
            type="submit"
            size="sm"
            disabled={loading || !agentPrefs.enabled || !activeDocumentId}
            aria-label={t('agent.run')}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>

      <AgentApplyPreviewDialog
        open={Boolean(applyPreview)}
        preview={applyPreview}
        busy={applyBusy}
        onOpenChange={(open) => {
          if (!open) {
            setApplyPreview(null)
            applyPendingRef.current = null
          }
        }}
        onConfirm={() => {
          const action = applyPendingRef.current
          if (!action) {
            setApplyPreview(null)
            return
          }
          setApplyBusy(true)
          try {
            action()
            setApplyPreview(null)
            applyPendingRef.current = null
          } finally {
            setApplyBusy(false)
          }
        }}
      />
    </div>
  )
}
