import { RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
  SettingsToggle,
} from '@/components/settings/SettingsPrimitives'
import { applyUiZoom } from '@/store/persistence'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setShowDocumentTabs,
  setShowEditorToolbar,
  setShowPanelRail,
  setShowStatusBar,
  setUiZoom,
} from '@/store/settingsSlice'

const ZOOM_PRESETS = [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25] as const

export function InterfaceSection() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const showDocumentTabs = useAppSelector((state) => state.settings.showDocumentTabs)
  const showEditorToolbar = useAppSelector((state) => state.settings.showEditorToolbar)
  const showStatusBar = useAppSelector((state) => state.settings.showStatusBar)
  const showPanelRail = useAppSelector((state) => state.settings.showPanelRail)
  const uiZoom = useAppSelector((state) => state.settings.uiZoom)
  const [draftZoom, setDraftZoom] = useState(uiZoom)
  const persistTimer = useRef<number | null>(null)

  useEffect(() => {
    setDraftZoom(uiZoom)
  }, [uiZoom])

  useEffect(
    () => () => {
      if (persistTimer.current != null) window.clearTimeout(persistTimer.current)
    },
    [],
  )

  function previewZoom(value: number) {
    setDraftZoom(value)
    applyUiZoom(value)
    if (persistTimer.current != null) window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      dispatch(setUiZoom(value))
      persistTimer.current = null
    }, 160)
  }

  function commitZoom(value: number) {
    if (persistTimer.current != null) {
      window.clearTimeout(persistTimer.current)
      persistTimer.current = null
    }
    setDraftZoom(value)
    dispatch(setUiZoom(value))
  }

  return (
    <div className="interface-settings">
      <SettingsSection>
        <SettingsSectionHeader
          title={t('settings.interface.title')}
          description={t('settings.interface.description')}
        />

        <SettingsGroup>
          <SettingsRow
            title={t('settings.interface.showTabs')}
            description={t('settings.interface.showTabsHint')}
          >
            <SettingsToggle
              checked={showDocumentTabs}
              onChange={() => dispatch(setShowDocumentTabs(!showDocumentTabs))}
              onLabel={t('settings.interface.on')}
              offLabel={t('settings.interface.off')}
            />
          </SettingsRow>
          <SettingsRow
            title={t('settings.interface.showToolbar')}
            description={t('settings.interface.showToolbarHint')}
          >
            <SettingsToggle
              checked={showEditorToolbar}
              onChange={() => dispatch(setShowEditorToolbar(!showEditorToolbar))}
              onLabel={t('settings.interface.on')}
              offLabel={t('settings.interface.off')}
            />
          </SettingsRow>
          <SettingsRow
            title={t('settings.interface.showPanelRail')}
            description={t('settings.interface.showPanelRailHint')}
          >
            <SettingsToggle
              checked={showPanelRail}
              onChange={() => dispatch(setShowPanelRail(!showPanelRail))}
              onLabel={t('settings.interface.on')}
              offLabel={t('settings.interface.off')}
            />
          </SettingsRow>
          <SettingsRow
            title={t('settings.interface.showStatusBar')}
            description={t('settings.interface.showStatusBarHint')}
          >
            <SettingsToggle
              checked={showStatusBar}
              onChange={() => dispatch(setShowStatusBar(!showStatusBar))}
              onLabel={t('settings.interface.on')}
              offLabel={t('settings.interface.off')}
            />
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader
          title={t('settings.interface.advancedTitle')}
          description={t('settings.interface.advancedDescription')}
        />

        <SettingsGroup>
          <SettingsRow
            title={t('settings.interface.uiZoom')}
            description={t('settings.interface.uiZoomHint')}
            layout="stack"
          >
            <div className="interface-zoom">
              <div className="interface-zoom-row">
                <input
                  type="range"
                  min={0.85}
                  max={1.25}
                  step={0.05}
                  value={draftZoom}
                  aria-label={t('settings.interface.uiZoom')}
                  onChange={(event) => previewZoom(Number(event.target.value))}
                  onPointerUp={(event) => commitZoom(Number((event.target as HTMLInputElement).value))}
                  onBlur={(event) => commitZoom(Number(event.target.value))}
                />
                <span className="interface-zoom-value">{Math.round(draftZoom * 100)}%</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2"
                  disabled={draftZoom === 1}
                  onClick={() => commitZoom(1)}
                  title={t('settings.interface.uiZoomReset')}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('common.reset')}
                </Button>
              </div>
              <div className="interface-zoom-presets" role="group" aria-label={t('settings.interface.uiZoom')}>
                {ZOOM_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={cn(draftZoom === preset && 'is-active')}
                    onClick={() => commitZoom(preset)}
                  >
                    {Math.round(preset * 100)}%
                  </button>
                ))}
              </div>
            </div>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>
    </div>
  )
}
