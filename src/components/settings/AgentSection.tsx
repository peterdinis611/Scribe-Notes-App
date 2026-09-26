import { GraduationCap, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import {
  AGENT_OPTIMIZABLE_TOOLS,
  AGENT_TEACHING_MAX_LEN,
  type AgentMaxSteps,
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

  function togglePreferred(tool: AgentToolId) {
    const preferredTools = prefs.preferredTools.includes(tool)
      ? prefs.preferredTools.filter((item) => item !== tool)
      : [...prefs.preferredTools, tool].slice(0, 6)
    dispatch(patchAgentPrefs({ preferredTools }))
  }

  function toggleDisabled(tool: AgentToolId) {
    const disabledTools = prefs.disabledTools.includes(tool)
      ? prefs.disabledTools.filter((item) => item !== tool)
      : [...prefs.disabledTools, tool].slice(0, 6)
    dispatch(patchAgentPrefs({ disabledTools }))
  }

  function handleTeach() {
    const text = teachInput.trim()
    if (text.length < 2) return
    dispatch(addAgentTeaching(text))
    setTeachInput('')
    toast.success(t('settings.agent.taughtToast'))
  }

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title={t('settings.agent.title')}
        description={t('settings.agent.description')}
      />

      <SettingsGroup>
        <SettingsRow
          title={t('settings.agent.enabled')}
          description={t('settings.agent.enabledHint')}
        >
          <Button type="button" variant={prefs.enabled ? 'default' : 'outline'} size="sm" onClick={toggleEnabled}>
            {prefs.enabled ? t('settings.agent.on') : t('settings.agent.off')}
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup>
        <p className="px-1 pb-2 text-[12px] font-semibold text-[var(--color-foreground)]">
          {t('settings.agent.optimizeTitle')}
        </p>
        <p className="mb-3 px-1 text-[12px] text-[var(--color-muted-foreground)]">
          {t('settings.agent.optimizeHint')}
        </p>
        <SettingsRow
          title={t('settings.agent.maxSteps')}
          description={t('settings.agent.maxStepsHint')}
        >
          <div className="inline-flex gap-1">
            {([1, 2, 3] as AgentMaxSteps[]).map((steps) => (
              <Button
                key={steps}
                type="button"
                size="sm"
                variant={prefs.maxSteps === steps ? 'default' : 'outline'}
                onClick={() => setMaxSteps(steps)}
                disabled={!prefs.enabled}
              >
                {steps}
              </Button>
            ))}
          </div>
        </SettingsRow>
        <SettingsRow
          title={t('settings.agent.preferFast')}
          description={t('settings.agent.preferFastHint')}
        >
          <Button
            type="button"
            size="sm"
            variant={prefs.preferFast ? 'default' : 'outline'}
            onClick={togglePreferFast}
            disabled={!prefs.enabled}
          >
            {prefs.preferFast ? t('settings.agent.on') : t('settings.agent.off')}
          </Button>
        </SettingsRow>
        <div className="mt-3 space-y-2 px-1">
          <p className="text-[12px] font-medium text-[var(--color-foreground)]">
            {t('settings.agent.preferredTools')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {AGENT_OPTIMIZABLE_TOOLS.map((tool) => (
              <button
                key={`pref-${tool}`}
                type="button"
                disabled={!prefs.enabled}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  prefs.preferredTools.includes(tool)
                    ? 'border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-[var(--color-foreground)]'
                    : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]',
                )}
                onClick={() => togglePreferred(tool)}
              >
                {t(TOOL_LABEL_KEYS[tool])}
              </button>
            ))}
          </div>
          <p className="pt-2 text-[12px] font-medium text-[var(--color-foreground)]">
            {t('settings.agent.disabledTools')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {AGENT_OPTIMIZABLE_TOOLS.map((tool) => (
              <button
                key={`dis-${tool}`}
                type="button"
                disabled={!prefs.enabled}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  prefs.disabledTools.includes(tool)
                    ? 'border-[color-mix(in_srgb,var(--color-danger,#c44)_50%,transparent)] bg-[color-mix(in_srgb,var(--color-danger,#c44)_10%,transparent)]'
                    : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]',
                )}
                onClick={() => toggleDisabled(tool)}
              >
                {t(TOOL_LABEL_KEYS[tool])}
              </button>
            ))}
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup>
        <div className="mb-2 flex items-center gap-2 px-1">
          <GraduationCap className="h-4 w-4 text-[var(--color-accent)]" />
          <p className="text-[12px] font-semibold text-[var(--color-foreground)]">
            {t('settings.agent.teachTitle')}
          </p>
        </div>
        <p className="mb-3 px-1 text-[12px] text-[var(--color-muted-foreground)]">
          {t('settings.agent.teachHint')}
        </p>
        <form
          className="flex gap-2 px-1"
          onSubmit={(event) => {
            event.preventDefault()
            handleTeach()
          }}
        >
          <input
            className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[13px]"
            value={teachInput}
            maxLength={AGENT_TEACHING_MAX_LEN}
            disabled={!prefs.enabled}
            placeholder={t('settings.agent.teachPlaceholder')}
            onChange={(event) => setTeachInput(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={!prefs.enabled || teachInput.trim().length < 2}>
            {t('settings.agent.teachAdd')}
          </Button>
        </form>
        {prefs.teachings.length > 0 ? (
          <ul className="mt-3 space-y-1.5 px-1">
            {prefs.teachings.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-[12px]"
              >
                <span className="min-w-0 flex-1 text-[var(--color-foreground)]">{item.text}</span>
                <button
                  type="button"
                  className="shrink-0 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  title={t('settings.agent.teachRemove')}
                  onClick={() => dispatch(removeAgentTeaching(item.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 px-1 text-[12px] text-[var(--color-muted-foreground)]">
            {t('settings.agent.teachEmpty')}
          </p>
        )}
        {prefs.teachings.length > 0 ? (
          <div className="mt-2 px-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                dispatch(clearAgentTeachings())
                toast.success(t('settings.agent.teachCleared'))
              }}
            >
              {t('settings.agent.teachClear')}
            </Button>
          </div>
        ) : null}
      </SettingsGroup>
    </SettingsSection>
  )
}
