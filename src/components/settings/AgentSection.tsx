import { Bot, GraduationCap, Pin, Sparkles, Trash2, Zap } from 'lucide-react'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentBlobatar, AGENT_BLOBATAR_NAME } from '@/components/agent/AgentBlobatar'
import { Button } from '@/components/ui/button'
import {
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import {
  AGENT_OPTIMIZABLE_TOOLS,
  AGENT_TEACHING_MAX_LEN,
  type AgentMaxSteps,
  type AgentOutputLanguage,
  type AgentTeachingScope,
  type AgentTeachingTopic,
  type AgentToolId,
} from '@/lib/library/agent-prefs'
import { AGENT_ROLES, type AgentRoleId } from '@/lib/library/agent-roles'
import {
  AGENT_TEACH_DRAFT_MAX_LEN,
  canDistillTeachingWithLlm,
  distillTeachingWithLlm,
} from '@/lib/library/agent-teach'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  addAgentPinnedFact,
  addAgentTeaching,
  clearAgentTeachings,
  patchAgentPrefs,
  removeAgentPinnedFact,
  removeAgentTeaching,
} from '@/store/settingsSlice'

const TOOL_LABEL_KEYS: Record<AgentToolId, string> = {
  library_answer: 'agent.tools.library_answer',
  document_answer: 'agent.tools.document_answer',
  summarize: 'agent.tools.summarize',
  outline: 'agent.tools.outline',
  tasks: 'agent.tools.tasks',
  similar: 'agent.tools.similar',
  style: 'agent.tools.style',
  flashcards: 'agent.tools.flashcards',
  takeaways: 'agent.tools.takeaways',
  dates: 'agent.tools.dates',
  meeting: 'agent.tools.meeting',
  terminology: 'agent.tools.terminology',
  wiki: 'agent.tools.wiki',
  organize: 'agent.tools.organize',
  duplicates: 'agent.tools.duplicates',
  citations: 'agent.tools.citations',
  quiz: 'agent.tools.quiz',
  revision: 'agent.tools.revision',
  spellcheck: 'agent.tools.spellcheck',
  rewrite: 'agent.tools.rewrite',
  brief: 'agent.tools.brief',
  explain: 'agent.tools.explain',
  simplify: 'agent.tools.simplify',
  action_items: 'agent.tools.action_items',
  glossary: 'agent.tools.glossary',
  compare_notes: 'agent.tools.compare_notes',
  section_summaries: 'agent.tools.section_summaries',
  decisions: 'agent.tools.decisions',
  quotes: 'agent.tools.quotes',
  pii: 'agent.tools.pii',
  rank_tasks: 'agent.tools.rank_tasks',
  contradictions: 'agent.tools.contradictions',
  commitments: 'agent.tools.commitments',
  reading_plan: 'agent.tools.reading_plan',
  note_pulse: 'agent.tools.note_pulse',
  grammar: 'agent.tools.grammar',
  mentions: 'agent.tools.mentions',
  open_loops: 'agent.tools.open_loops',
  tone: 'agent.tools.tone',
  title: 'agent.tools.title',
  continuation: 'agent.tools.continuation',
  template_hints: 'agent.tools.template_hints',
  library_report: 'agent.tools.library_report',
  terminology_library: 'agent.tools.terminology_library',
  files_answer: 'agent.tools.files_answer',
  save_template: 'agent.tools.save_template',
}

type ToolMode = 'default' | 'prefer' | 'never'

function toolMode(
  tool: AgentToolId,
  preferred: AgentToolId[],
  disabled: AgentToolId[],
): ToolMode {
  if (disabled.includes(tool)) return 'never'
  if (preferred.includes(tool)) return 'prefer'
  return 'default'
}

function AgentToggle({
  checked,
  onChange,
  disabled,
  onLabel,
  offLabel,
  compact,
}: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  onLabel: string
  offLabel: string
  compact?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={cn(
        'agent-settings-switch',
        compact && 'agent-settings-switch--compact',
        checked && 'is-on',
      )}
      onClick={onChange}
    >
      <span className="agent-settings-switch-track" aria-hidden="true">
        <span className="agent-settings-switch-knob" />
      </span>
      <span className="agent-settings-switch-label">{checked ? onLabel : offLabel}</span>
    </button>
  )
}

function CardHead({
  id,
  title,
  hint,
  tone,
  children,
}: {
  id: string
  title: string
  hint: string
  tone: 'optimize' | 'behavior' | 'pins' | 'teach' | 'roles'
  children: ReactNode
}) {
  return (
    <div className={cn('agent-settings-card-head', `is-${tone}`)}>
      <span className="agent-settings-card-icon" aria-hidden="true">
        {children}
      </span>
      <div>
        <h4 id={id}>{title}</h4>
        <p>{hint}</p>
      </div>
    </div>
  )
}

export function AgentSection() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const prefs = useAppSelector((state) => state.settings.agentPrefs)
  const activeDocumentId = useAppSelector((state) => state.documents.activeDocumentId)
  const activeDocument = activeDocumentId ? peekCachedDocument(activeDocumentId) : null
  const [teachInput, setTeachInput] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [teachScope, setTeachScope] = useState<AgentTeachingScope>('global')
  const [teachTopic, setTeachTopic] = useState<AgentTeachingTopic>('general')
  const [teachWithAi, setTeachWithAi] = useState(true)
  const [teachBusy, setTeachBusy] = useState(false)
  const [llmTeachReady, setLlmTeachReady] = useState<boolean | null>(null)

  const budgetMax = prefs.dailyRunBudget
  const budgetUsed = prefs.runsToday
  const budgetRatio =
    budgetMax > 0 ? Math.min(1, budgetUsed / budgetMax) : 0

  function toggleEnabled() {
    const next = !prefs.enabled
    dispatch(patchAgentPrefs({ enabled: next }))
    toast.success(next ? t('settings.agent.enabledToast') : t('settings.agent.disabledToast'))
  }

  function toggleRole(roleId: AgentRoleId) {
    const current = prefs.agents[roleId]?.enabled !== false
    const next = !current
    dispatch(
      patchAgentPrefs({
        agents: {
          ...prefs.agents,
          [roleId]: { enabled: next },
        },
      }),
    )
    toast.success(
      next
        ? t('settings.agent.roleEnabledToast', { name: t(`settings.agent.roles.${roleId}.label`) })
        : t('settings.agent.roleDisabledToast', { name: t(`settings.agent.roles.${roleId}.label`) }),
    )
  }

  useEffect(() => {
    let cancelled = false
    void canDistillTeachingWithLlm().then((ready) => {
      if (!cancelled) setLlmTeachReady(ready)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function setMaxSteps(maxSteps: AgentMaxSteps) {
    dispatch(patchAgentPrefs({ maxSteps }))
  }

  function togglePreferFast() {
    dispatch(patchAgentPrefs({ preferFast: !prefs.preferFast }))
  }

  function setToolMode(tool: AgentToolId, mode: ToolMode) {
    let preferredTools = prefs.preferredTools.filter((item) => item !== tool)
    let disabledTools = prefs.disabledTools.filter((item) => item !== tool)
    if (mode === 'prefer') preferredTools = [...preferredTools, tool].slice(0, 6)
    if (mode === 'never') disabledTools = [...disabledTools, tool].slice(0, 6)
    dispatch(patchAgentPrefs({ preferredTools, disabledTools }))
  }

  async function handleTeach() {
    const draft = teachInput.trim()
    if (draft.length < 2 || teachBusy) return
    setTeachBusy(true)
    try {
      const result = teachWithAi
        ? await distillTeachingWithLlm(draft, {
            force: draft.length > AGENT_TEACHING_MAX_LEN || draft.includes('\n'),
            topic: teachTopic,
          })
        : { text: draft.slice(0, AGENT_TEACHING_MAX_LEN), distilled: false }
      if (teachScope === 'document') {
        if (!activeDocumentId) {
          toast.error(t('settings.agent.teachNeedsDocument'))
          return
        }
        dispatch(
          addAgentTeaching({
            text: result.text,
            scope: 'document',
            documentId: activeDocumentId,
            topic: teachTopic,
          }),
        )
      } else {
        dispatch(addAgentTeaching({ text: result.text, topic: teachTopic }))
      }
      setTeachInput('')
      toast.success(
        result.distilled
          ? t('settings.agent.teachRefinedToast')
          : teachTopic === 'grammar'
            ? t('settings.agent.taughtGrammarToast')
            : t('settings.agent.taughtToast'),
      )
    } catch {
      toast.error(t('settings.agent.teachRefineOffline'))
    } finally {
      setTeachBusy(false)
    }
  }

  return (
    <SettingsSection className="agent-settings">
      <SettingsSectionHeader
        title={t('settings.agent.title')}
        description={t('settings.agent.description')}
      />

      <div
        className={cn('agent-settings-power', prefs.enabled && 'is-live')}
        style={{ '--agent-reveal': '0' } as CSSProperties}
      >
        <div className="agent-settings-power-mark" aria-hidden="true">
          <AgentBlobatar
            name={AGENT_BLOBATAR_NAME}
            size={40}
            talking={prefs.enabled}
            title={t('agent.faceTitle')}
          />
          <span className="agent-settings-power-led" data-on={prefs.enabled || undefined} />
        </div>
        <div className="agent-settings-power-copy">
          <span className="agent-settings-power-kicker">
            {prefs.enabled ? t('settings.agent.on') : t('settings.agent.off')}
          </span>
          <span>{t('settings.agent.enabled')}</span>
          <small>{t('settings.agent.enabledHint')}</small>
        </div>
        <AgentToggle
          checked={prefs.enabled}
          onChange={toggleEnabled}
          onLabel={t('settings.agent.on')}
          offLabel={t('settings.agent.off')}
        />
      </div>

      <div className={cn('agent-settings-grid', !prefs.enabled && 'is-dimmed')}>
        <section
          className="agent-settings-card agent-settings-card--roles"
          aria-labelledby="agent-roles-title"
          style={{ '--agent-reveal': '1' } as CSSProperties}
        >
          <CardHead
            id="agent-roles-title"
            title={t('settings.agent.rolesTitle')}
            hint={t('settings.agent.rolesHint')}
            tone="roles"
          >
            <Bot className="h-3.5 w-3.5" />
          </CardHead>

          <ul className="agent-settings-roles">
            {AGENT_ROLES.map((role) => {
              const checked = prefs.agents[role.id]?.enabled !== false
              return (
                <li key={role.id} className={cn(!checked && 'is-off')}>
                  <div className="agent-settings-role-copy">
                    <span>{t(role.labelKey)}</span>
                    <small>{t(role.hintKey)}</small>
                  </div>
                  <AgentToggle
                    compact
                    checked={checked}
                    onChange={() => toggleRole(role.id)}
                    disabled={!prefs.enabled}
                    onLabel={t('settings.agent.on')}
                    offLabel={t('settings.agent.off')}
                  />
                </li>
              )
            })}
          </ul>
        </section>

        <section
          className="agent-settings-card agent-settings-card--optimize"
          aria-labelledby="agent-optimize-title"
          style={{ '--agent-reveal': '2' } as CSSProperties}
        >
          <CardHead
            id="agent-optimize-title"
            title={t('settings.agent.optimizeTitle')}
            hint={t('settings.agent.optimizeHint')}
            tone="optimize"
          >
            <Zap className="h-3.5 w-3.5" />
          </CardHead>

          <div className="agent-settings-field">
            <div className="agent-settings-field-copy">
              <span>{t('settings.agent.maxSteps')}</span>
              <small>{t('settings.agent.maxStepsHint')}</small>
            </div>
            <div className="agent-settings-segment" role="group" aria-label={t('settings.agent.maxSteps')}>
              {([1, 2, 3] as AgentMaxSteps[]).map((steps) => (
                <button
                  key={steps}
                  type="button"
                  className={cn(prefs.maxSteps === steps && 'is-active')}
                  disabled={!prefs.enabled}
                  onClick={() => setMaxSteps(steps)}
                >
                  {steps}
                </button>
              ))}
            </div>
          </div>

          <div className="agent-settings-field">
            <div className="agent-settings-field-copy">
              <span>{t('settings.agent.preferFast')}</span>
              <small>{t('settings.agent.preferFastHint')}</small>
            </div>
            <AgentToggle
              compact
              checked={prefs.preferFast}
              onChange={togglePreferFast}
              disabled={!prefs.enabled}
              onLabel={t('settings.agent.on')}
              offLabel={t('settings.agent.off')}
            />
          </div>

          <div className="agent-settings-tools">
            <div className="agent-settings-tools-head">
              <span>{t('settings.agent.toolColumn')}</span>
              <span>{t('settings.agent.modeColumn')}</span>
            </div>
            <ul>
              {AGENT_OPTIMIZABLE_TOOLS.map((tool) => {
                const mode = toolMode(tool, prefs.preferredTools, prefs.disabledTools)
                return (
                  <li key={tool} data-mode={mode}>
                    <span className="agent-settings-tool-name">{t(TOOL_LABEL_KEYS[tool])}</span>
                    <div className="agent-settings-segment agent-settings-segment--modes" role="group">
                      {(
                        [
                          ['default', t('settings.agent.modeDefault')],
                          ['prefer', t('settings.agent.modePrefer')],
                          ['never', t('settings.agent.modeNever')],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={cn(
                            mode === value && 'is-active',
                            value === 'never' && mode === value && 'is-never',
                          )}
                          disabled={!prefs.enabled}
                          onClick={() => setToolMode(tool, value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        <section
          className="agent-settings-card agent-settings-card--behavior"
          aria-labelledby="agent-behavior-title"
          style={{ '--agent-reveal': '2' } as CSSProperties}
        >
          <CardHead
            id="agent-behavior-title"
            title={t('settings.agent.behaviorTitle')}
            hint={t('settings.agent.behaviorHint')}
            tone="behavior"
          >
            <AgentBlobatar name={AGENT_BLOBATAR_NAME} size={16} title={t('agent.faceTitle')} />
          </CardHead>

          <div className="agent-settings-field">
            <div className="agent-settings-field-copy">
              <span>{t('settings.agent.outputLanguage')}</span>
              <small>{t('settings.agent.outputLanguageHint')}</small>
            </div>
            <div className="agent-settings-segment" role="group">
              {([
                ['auto', t('settings.agent.langAuto')],
                ['sk', 'SK'],
                ['en', 'EN'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={cn(prefs.outputLanguage === value && 'is-active')}
                  disabled={!prefs.enabled}
                  onClick={() =>
                    dispatch(patchAgentPrefs({ outputLanguage: value as AgentOutputLanguage }))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="agent-settings-field">
            <div className="agent-settings-field-copy">
              <span>{t('settings.agent.askWhenUncertain')}</span>
              <small>{t('settings.agent.askWhenUncertainHint')}</small>
            </div>
            <AgentToggle
              compact
              checked={prefs.askWhenUncertain}
              onChange={() =>
                dispatch(patchAgentPrefs({ askWhenUncertain: !prefs.askWhenUncertain }))
              }
              disabled={!prefs.enabled}
              onLabel={t('settings.agent.on')}
              offLabel={t('settings.agent.off')}
            />
          </div>

          <div className="agent-settings-field">
            <div className="agent-settings-field-copy">
              <span>{t('settings.agent.quietHours')}</span>
              <small>{t('settings.agent.quietHoursHint')}</small>
            </div>
            <AgentToggle
              compact
              checked={prefs.quietHours}
              onChange={() => dispatch(patchAgentPrefs({ quietHours: !prefs.quietHours }))}
              disabled={!prefs.enabled}
              onLabel={t('settings.agent.on')}
              offLabel={t('settings.agent.off')}
            />
          </div>

          <div className="agent-settings-field agent-settings-field--budget">
            <div className="agent-settings-field-copy">
              <span>{t('settings.agent.dailyBudget')}</span>
              <small>
                {t('settings.agent.dailyBudgetHint', {
                  used: prefs.runsToday,
                  max: prefs.dailyRunBudget || '∞',
                })}
              </small>
            </div>
            <div className="agent-settings-segment" role="group">
              {([0, 20, 40, 80] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cn(prefs.dailyRunBudget === value && 'is-active')}
                  disabled={!prefs.enabled}
                  onClick={() => dispatch(patchAgentPrefs({ dailyRunBudget: value }))}
                >
                  {value === 0 ? '∞' : value}
                </button>
              ))}
            </div>
            {budgetMax > 0 ? (
              <div
                className="agent-settings-budget-meter"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={budgetMax}
                aria-valuenow={budgetUsed}
                aria-label={t('settings.agent.dailyBudget')}
              >
                <span style={{ width: `${budgetRatio * 100}%` }} />
              </div>
            ) : null}
          </div>

          <div className="agent-settings-field">
            <div className="agent-settings-field-copy">
              <span>{t('settings.agent.autoRunOnSave')}</span>
              <small>{t('settings.agent.autoRunOnSaveHint')}</small>
            </div>
            <AgentToggle
              compact
              checked={prefs.autoRunOnSave}
              onChange={() =>
                dispatch(patchAgentPrefs({ autoRunOnSave: !prefs.autoRunOnSave }))
              }
              disabled={!prefs.enabled}
              onLabel={t('settings.agent.on')}
              offLabel={t('settings.agent.off')}
            />
          </div>
        </section>

        <section
          className="agent-settings-card agent-settings-card--pins"
          aria-labelledby="agent-pins-title"
          style={{ '--agent-reveal': '3' } as CSSProperties}
        >
          <CardHead
            id="agent-pins-title"
            title={t('settings.agent.pinnedTitle')}
            hint={t('settings.agent.pinnedHint')}
            tone="pins"
          >
            <Pin className="h-3.5 w-3.5" />
          </CardHead>
          <form
            className="agent-settings-teach-form"
            onSubmit={(event) => {
              event.preventDefault()
              const text = pinInput.trim()
              if (text.length < 2) return
              dispatch(addAgentPinnedFact(text))
              setPinInput('')
            }}
          >
            <input
              value={pinInput}
              maxLength={AGENT_TEACHING_MAX_LEN}
              disabled={!prefs.enabled}
              placeholder={t('settings.agent.pinnedPlaceholder')}
              onChange={(event) => setPinInput(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={!prefs.enabled || pinInput.trim().length < 2}>
              {t('settings.agent.pinnedAdd')}
            </Button>
          </form>
          {prefs.pinnedFacts.length > 0 ? (
            <ol className="agent-settings-teachings">
              {prefs.pinnedFacts.map((item, index) => (
                <li key={item.id}>
                  <span className="agent-settings-teaching-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="agent-settings-teaching-text">{item.text}</span>
                  <button
                    type="button"
                    className="agent-settings-teaching-remove"
                    onClick={() => dispatch(removeAgentPinnedFact(item.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="agent-settings-empty">
              <Pin className="h-4 w-4" aria-hidden="true" />
              {t('settings.agent.pinnedEmpty')}
            </p>
          )}
        </section>

        <section
          className="agent-settings-card agent-settings-card--teach"
          aria-labelledby="agent-teach-title"
          style={{ '--agent-reveal': '4' } as CSSProperties}
        >
          <CardHead
            id="agent-teach-title"
            title={t('settings.agent.teachTitle')}
            hint={t('settings.agent.teachHint')}
            tone="teach"
          >
            <GraduationCap className="h-3.5 w-3.5" />
          </CardHead>

          <div className="agent-scope-switch mb-2" role="group" aria-label={t('settings.agent.teachTitle')}>
            <button
              type="button"
              className={cn('library-chat-scope-tab', teachScope === 'global' && 'is-active')}
              onClick={() => setTeachScope('global')}
            >
              {t('settings.agent.teachScopeToggleGlobal')}
            </button>
            <button
              type="button"
              className={cn('library-chat-scope-tab', teachScope === 'document' && 'is-active')}
              disabled={!activeDocumentId}
              title={
                activeDocumentId
                  ? activeDocument?.title || t('libraryChat.untitled')
                  : t('settings.agent.teachNeedsDocument')
              }
              onClick={() => setTeachScope('document')}
            >
              {t('settings.agent.teachScopeToggleDocument')}
            </button>
          </div>
          <div
            className="agent-scope-switch mb-2"
            role="group"
            aria-label={t('settings.agent.teachTopicLabel')}
          >
            <button
              type="button"
              className={cn('library-chat-scope-tab', teachTopic === 'general' && 'is-active')}
              onClick={() => setTeachTopic('general')}
            >
              {t('settings.agent.teachTopicGeneral')}
            </button>
            <button
              type="button"
              className={cn('library-chat-scope-tab', teachTopic === 'grammar' && 'is-active')}
              onClick={() => setTeachTopic('grammar')}
            >
              {t('settings.agent.teachTopicGrammar')}
            </button>
          </div>
          <p className="mb-2 text-[11px] text-[var(--color-muted-foreground)]">
            {teachTopic === 'grammar'
              ? t('settings.agent.teachTopicGrammarHint')
              : teachScope === 'document'
                ? t('settings.agent.teachScopeDocument')
                : t('settings.agent.teachScopeGlobal')}
          </p>

          <form
            className="agent-settings-teach-form agent-settings-teach-form--stack"
            onSubmit={(event) => {
              event.preventDefault()
              void handleTeach()
            }}
          >
            <textarea
              value={teachInput}
              maxLength={AGENT_TEACH_DRAFT_MAX_LEN}
              disabled={!prefs.enabled || teachBusy}
              rows={3}
              placeholder={
                teachTopic === 'grammar'
                  ? t('settings.agent.teachPlaceholderGrammar')
                  : teachWithAi
                    ? t('settings.agent.teachPlaceholderLong')
                    : teachScope === 'document'
                      ? t('settings.agent.teachPlaceholderDocument')
                      : t('settings.agent.teachPlaceholder')
              }
              onChange={(event) => setTeachInput(event.target.value)}
              aria-label={t('settings.agent.teachTitle')}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className={cn('library-chat-chip', teachWithAi && 'is-active')}
                aria-pressed={teachWithAi}
                disabled={!prefs.enabled}
                title={t('settings.agent.teachRefineHint')}
                onClick={() => setTeachWithAi((value) => !value)}
              >
                <Sparkles className="mr-1 inline h-3 w-3" />
                {t('settings.agent.teachRefine')}
              </button>
              {teachWithAi && llmTeachReady === false ? (
                <span className="text-[11px] text-[var(--color-muted-foreground)]">
                  {t('settings.agent.teachRefineOffline')}
                </span>
              ) : null}
              <Button
                type="submit"
                size="sm"
                className="ml-auto"
                disabled={!prefs.enabled || teachInput.trim().length < 2 || teachBusy}
              >
                {teachBusy ? t('settings.agent.teachRefineBusy') : t('settings.agent.teachAdd')}
              </Button>
            </div>
          </form>

          {prefs.teachings.length > 0 ? (
            <>
              <ol className="agent-settings-teachings">
                {prefs.teachings.map((item, index) => (
                  <li key={item.id}>
                    <span className="agent-settings-teaching-index">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="agent-settings-teaching-text">
                      <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-55">
                        {item.scope === 'document'
                          ? t('settings.agent.teachBadgeDocument')
                          : t('settings.agent.teachBadgeGlobal')}
                      </span>
                      {item.topic === 'grammar' ? (
                        <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)] opacity-80">
                          {t('settings.agent.teachBadgeGrammar')}
                        </span>
                      ) : null}
                      {item.text}
                    </span>
                    <button
                      type="button"
                      className="agent-settings-teaching-remove"
                      title={t('settings.agent.teachRemove')}
                      onClick={() => dispatch(removeAgentTeaching(item.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="agent-settings-clear"
                onClick={() => {
                  dispatch(clearAgentTeachings())
                  toast.success(t('settings.agent.teachCleared'))
                }}
              >
                {t('settings.agent.teachClear')}
              </button>
            </>
          ) : (
            <p className="agent-settings-empty">
              <GraduationCap className="h-4 w-4" aria-hidden="true" />
              {t('settings.agent.teachEmpty')}
            </p>
          )}
        </section>
      </div>
    </SettingsSection>
  )
}
