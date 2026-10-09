import { PanelRightClose } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentPanel } from '@/components/AgentPanel'
import { AgentBlobatar, AGENT_BLOBATAR_NAME } from '@/components/agent/AgentBlobatar'
import { SpellcheckAgentPanel } from '@/components/agent/SpellcheckAgentPanel'
import { SPELLCHECK_AGENT_BLOBATAR_NAME } from '@/lib/library/spellcheck-agent'
import {
  enabledAgentRoles,
  firstEnabledAgentRole,
  getAgentRole,
  type AgentRoleId,
} from '@/lib/library/agent-roles'
import { IconTooltip } from '@/components/ui/tooltip'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { openAgentPanel, setAgentPanelOpen, setAgentPersona } from '@/store/documentsSlice'
import { cn } from '@/lib/utils'

/** Right-edge workspace for local agents — opens beside the library/editor. */
export function AgentWorkspaceDock() {
  const open = useAppSelector((state) => state.documents.agentPanelOpen)
  const persona = useAppSelector((state) => state.documents.agentPersona)
  const agentPrefs = useAppSelector((state) => state.settings.agentPrefs)
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const readingMode = useAppSelector((state) => state.documents.readingMode)
  const dispatch = useAppDispatch()
  const { t } = useTranslation()

  const roles = enabledAgentRoles(agentPrefs.agents)
  const activeRoleId = firstEnabledAgentRole(agentPrefs.agents, persona) ?? 'general'
  const activeRole = getAgentRole(activeRoleId)
  const isSpell = activeRole.panel === 'spellcheck'
  const blobName = isSpell ? SPELLCHECK_AGENT_BLOBATAR_NAME : AGENT_BLOBATAR_NAME

  useEffect(() => {
    if (!open) return
    if (persona !== activeRoleId) {
      dispatch(setAgentPersona(activeRoleId))
    }
  }, [open, persona, activeRoleId, dispatch])

  if (!open || focusMode || readingMode) return null

  if (!agentPrefs.enabled || roles.length === 0) {
    return (
      <aside className="agent-workspace-dock titlebar-no-drag" aria-label={t('agent.dockAria')}>
        <header className="agent-dock-header">
          <div className="agent-dock-identity">
            <AgentBlobatar name={AGENT_BLOBATAR_NAME} size={36} className="agent-dock-face" />
            <div className="agent-dock-copy">
              <p className="agent-dock-kicker">{t('agent.brandBadge')}</p>
              <h2 className="agent-dock-title">{t('agent.rolesNoneTitle')}</h2>
            </div>
          </div>
          <IconTooltip label={t('agent.dockClose')}>
            <button
              type="button"
              className="agent-dock-close"
              aria-label={t('agent.dockClose')}
              onClick={() => dispatch(setAgentPanelOpen(false))}
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          </IconTooltip>
        </header>
        <p className="agent-dock-empty-roles">{t('agent.rolesNoneHint')}</p>
      </aside>
    )
  }

  return (
    <aside
      className={cn(
        'agent-workspace-dock titlebar-no-drag',
        isSpell && 'agent-workspace-dock--spellcheck',
        `agent-workspace-dock--${activeRoleId}`,
      )}
      aria-label={isSpell ? t('agent.spellAgent.dockAria') : t('agent.dockAria')}
    >
      <header className="agent-dock-header">
        <div className="agent-dock-identity">
          <AgentBlobatar
            name={blobName}
            size={36}
            title={isSpell ? t('agent.spellAgent.faceTitle') : t(activeRole.labelKey)}
            className="agent-dock-face"
          />
          <div className="agent-dock-copy">
            <p className="agent-dock-kicker">
              {isSpell ? t('agent.spellAgent.brandBadge') : t(activeRole.labelKey)}
            </p>
            <h2 className="agent-dock-title">
              {isSpell ? t('agent.spellAgent.dockTitle') : t(activeRole.dockTitleKey)}
            </h2>
          </div>
        </div>
        <div className="agent-dock-actions">
          <div className="agent-persona-switch" role="group" aria-label={t('agent.personaSwitch')}>
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                className={cn('agent-persona-tab', activeRoleId === role.id && 'is-active')}
                aria-pressed={activeRoleId === role.id}
                onClick={() => dispatch(openAgentPanel({ persona: role.id as AgentRoleId }))}
              >
                {t(role.dockLabelKey)}
              </button>
            ))}
          </div>
          <IconTooltip label={t('agent.dockClose')}>
            <button
              type="button"
              className="agent-dock-close"
              aria-label={t('agent.dockClose')}
              onClick={() => dispatch(setAgentPanelOpen(false))}
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          </IconTooltip>
        </div>
      </header>
      {isSpell ? (
        <SpellcheckAgentPanel onClose={() => dispatch(setAgentPanelOpen(false))} />
      ) : (
        <AgentPanel
          variant="dock"
          roleId={activeRoleId}
          onClose={() => dispatch(setAgentPanelOpen(false))}
        />
      )}
    </aside>
  )
}
