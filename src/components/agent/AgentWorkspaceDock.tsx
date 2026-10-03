import { PanelRightClose } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AgentPanel } from '@/components/AgentPanel'
import { AgentBlobatar, AGENT_BLOBATAR_NAME } from '@/components/agent/AgentBlobatar'
import { SpellcheckAgentPanel } from '@/components/agent/SpellcheckAgentPanel'
import { SPELLCHECK_AGENT_BLOBATAR_NAME } from '@/lib/library/spellcheck-agent'
import { IconTooltip } from '@/components/ui/tooltip'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { openAgentPanel, setAgentPanelOpen, setAgentPersona } from '@/store/documentsSlice'
import { cn } from '@/lib/utils'

/** Right-edge workspace for local agents — opens beside the library/editor. */
export function AgentWorkspaceDock() {
  const open = useAppSelector((state) => state.documents.agentPanelOpen)
  const persona = useAppSelector((state) => state.documents.agentPersona)
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const readingMode = useAppSelector((state) => state.documents.readingMode)
  const dispatch = useAppDispatch()
  const { t } = useTranslation()

  if (!open || focusMode || readingMode) return null

  const isSpell = persona === 'spellcheck'
  const blobName = isSpell ? SPELLCHECK_AGENT_BLOBATAR_NAME : AGENT_BLOBATAR_NAME

  return (
    <aside
      className={cn(
        'agent-workspace-dock titlebar-no-drag',
        isSpell && 'agent-workspace-dock--spellcheck',
      )}
      aria-label={isSpell ? t('agent.spellAgent.dockAria') : t('agent.dockAria')}
    >
      <header className="agent-dock-header">
        <div className="agent-dock-identity">
          <AgentBlobatar
            name={blobName}
            size={36}
            title={isSpell ? t('agent.spellAgent.faceTitle') : t('agent.faceTitle')}
            className="agent-dock-face"
          />
          <div className="agent-dock-copy">
            <p className="agent-dock-kicker">
              {isSpell ? t('agent.spellAgent.brandBadge') : t('agent.brandBadge')}
            </p>
            <h2 className="agent-dock-title">
              {isSpell ? t('agent.spellAgent.dockTitle') : t('agent.dockTitle')}
            </h2>
          </div>
        </div>
        <div className="agent-dock-actions">
          <div className="agent-persona-switch" role="group" aria-label={t('agent.personaSwitch')}>
            <button
              type="button"
              className={cn('agent-persona-tab', !isSpell && 'is-active')}
              aria-pressed={!isSpell}
              onClick={() => dispatch(setAgentPersona('general'))}
            >
              {t('agent.personaGeneral')}
            </button>
            <button
              type="button"
              className={cn('agent-persona-tab', isSpell && 'is-active')}
              aria-pressed={isSpell}
              onClick={() => dispatch(openAgentPanel({ persona: 'spellcheck' }))}
            >
              {t('agent.personaSpellcheck')}
            </button>
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
        <AgentPanel variant="dock" onClose={() => dispatch(setAgentPanelOpen(false))} />
      )}
    </aside>
  )
}
