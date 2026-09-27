import { PanelRightClose } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AgentPanel } from '@/components/AgentPanel'
import { AgentBlobatar, AGENT_BLOBATAR_NAME } from '@/components/agent/AgentBlobatar'
import { IconTooltip } from '@/components/ui/tooltip'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setAgentPanelOpen } from '@/store/documentsSlice'

/** Right-edge workspace for local agent goals — opens beside the library/editor. */
export function AgentWorkspaceDock() {
  const open = useAppSelector((state) => state.documents.agentPanelOpen)
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const readingMode = useAppSelector((state) => state.documents.readingMode)
  const dispatch = useAppDispatch()
  const { t } = useTranslation()

  if (!open || focusMode || readingMode) return null

  return (
    <aside className="agent-workspace-dock titlebar-no-drag" aria-label={t('agent.dockAria')}>
      <header className="agent-dock-header">
        <div className="agent-dock-identity">
          <AgentBlobatar
            name={AGENT_BLOBATAR_NAME}
            size={36}
            title={t('agent.faceTitle')}
            className="agent-dock-face"
          />
          <div className="agent-dock-copy">
            <p className="agent-dock-kicker">{t('agent.brandBadge')}</p>
            <h2 className="agent-dock-title">{t('agent.dockTitle')}</h2>
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
      <AgentPanel
        variant="dock"
        onClose={() => dispatch(setAgentPanelOpen(false))}
      />
    </aside>
  )
}
