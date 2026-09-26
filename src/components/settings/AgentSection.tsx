import { Bot, GraduationCap, Trash2, Zap } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import {
  AGENT_OPTIMIZABLE_TOOLS,
  AGENT_TEACHING_MAX_LEN,
  type AgentMaxSteps,
  type AgentOutputLanguage,
  type AgentToolId,
} from '@/lib/library/agent-prefs'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  addAgentTeaching,
  clearAgentTeachings,
  patchAgentPrefs,
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

export function AgentSection() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const prefs = useAppSelector((state) => state.settings.agentPrefs)
  const [teachInput, setTeachInput] = useState('')

  function toggleEnabled() {
    const next = !prefs.enabled
    dispatch(patchAgentPrefs({ enabled: next }))
    toast.success(next ? t('settings.agent.enabledToast') : t('settings.agent.disabledToast'))
  }

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

  function handleTeach() {
    const text = teachInput.trim()
    if (text.length < 2) return
    dispatch(addAgentTeaching(text))
    setTeachInput('')
    toast.success(t('settings.agent.taughtToast'))
  }

  return (
    <SettingsSection className="agent-settings">
      <SettingsSectionHeader
        title={t('settings.agent.title')}
        description={t('settings.agent.description')}
      />

      <div className="agent-settings-power">
        <div className="agent-settings-power-mark" aria-hidden="true">
          <Bot className="h-4 w-4" />
        </div>
        <div className="agent-settings-power-copy">
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
        <section className="agent-settings-card" aria-labelledby="agent-optimize-title">
          <div className="agent-settings-card-head">
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            <div>
              <h4 id="agent-optimize-title">{t('settings.agent.optimizeTitle')}</h4>
              <p>{t('settings.agent.optimizeHint')}</p>
            </div>
          </div>

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
                  <li key={tool}>
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

        <section className="agent-settings-card" aria-labelledby="agent-behavior-title">
          <div className="agent-settings-card-head">
            <Bot className="h-3.5 w-3.5" aria-hidden="true" />
            <div>
              <h4 id="agent-behavior-title">{t('settings.agent.behaviorTitle')}</h4>
              <p>{t('settings.agent.behaviorHint')}</p>
            </div>
          </div>

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

          <div className="agent-settings-field">
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
          </div>
        </section>

        <section className="agent-settings-card agent-settings-card--teach" aria-labelledby="agent-teach-title">
          <div className="agent-settings-card-head">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
            <div>
              <h4 id="agent-teach-title">{t('settings.agent.teachTitle')}</h4>
              <p>{t('settings.agent.teachHint')}</p>
            </div>
          </div>

          <form
            className="agent-settings-teach-form"
            onSubmit={(event) => {
              event.preventDefault()
              handleTeach()
            }}
          >
            <input
              value={teachInput}
              maxLength={AGENT_TEACHING_MAX_LEN}
              disabled={!prefs.enabled}
              placeholder={t('settings.agent.teachPlaceholder')}
              onChange={(event) => setTeachInput(event.target.value)}
              aria-label={t('settings.agent.teachTitle')}
            />
            <Button type="submit" size="sm" disabled={!prefs.enabled || teachInput.trim().length < 2}>
              {t('settings.agent.teachAdd')}
            </Button>
          </form>

          {prefs.teachings.length > 0 ? (
            <>
              <ol className="agent-settings-teachings">
                {prefs.teachings.map((item, index) => (
                  <li key={item.id}>
                    <span className="agent-settings-teaching-index">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="agent-settings-teaching-text">{item.text}</span>
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
            <p className="agent-settings-empty">{t('settings.agent.teachEmpty')}</p>
          )}
        </section>
      </div>
    </SettingsSection>
  )
}
