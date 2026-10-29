import { RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
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
  patchToastSettings,
  setShowDocumentTabs,
  setShowEditorToolbar,
  setShowPanelRail,
  setShowStatusBar,
  setToastSettings,
  setUiZoom,
} from '@/store/settingsSlice'
import {
  DEFAULT_TOAST_SETTINGS,
  toast,
  type ToastPosition,
  type ToastStackBehavior,
} from '@/lib/toast'

const ZOOM_PRESETS = [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25] as const

export function InterfaceSection() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const showDocumentTabs = useAppSelector((state) => state.settings.showDocumentTabs)
  const showEditorToolbar = useAppSelector((state) => state.settings.showEditorToolbar)
  const showStatusBar = useAppSelector((state) => state.settings.showStatusBar)
  const showPanelRail = useAppSelector((state) => state.settings.showPanelRail)
  const uiZoom = useAppSelector((state) => state.settings.uiZoom)
  const toastSettings = useAppSelector((state) => state.settings.toastSettings)
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

      <Separator className="my-5" />

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

      <Separator className="my-5" />

      <SettingsSection>
        <SettingsSectionHeader
          title={t('settings.interface.toastsTitle')}
          description={t('settings.interface.toastsDescription')}
        />

        <SettingsGroup>
          <SettingsRow
            title={t('settings.interface.toastsEnabled')}
            description={t('settings.interface.toastsEnabledHint')}
          >
            <SettingsToggle
              checked={toastSettings.enabled}
              onChange={() => dispatch(patchToastSettings({ enabled: !toastSettings.enabled }))}
              onLabel={t('settings.interface.on')}
              offLabel={t('settings.interface.off')}
            />
          </SettingsRow>

          <SettingsRow
            title={t('settings.interface.toastsPosition')}
            description={t('settings.interface.toastsPositionHint')}
            layout="stack"
          >
            <select
              className="h-8 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-[13px]"
              value={toastSettings.position}
              disabled={!toastSettings.enabled}
              onChange={(event) =>
                dispatch(patchToastSettings({ position: event.target.value as ToastPosition }))
              }
            >
              <option value="bottom-right">{t('settings.interface.toastsPosBottomRight')}</option>
              <option value="bottom-left">{t('settings.interface.toastsPosBottomLeft')}</option>
              <option value="top-right">{t('settings.interface.toastsPosTopRight')}</option>
              <option value="top-left">{t('settings.interface.toastsPosTopLeft')}</option>
            </select>
          </SettingsRow>

          <SettingsRow
            title={t('settings.interface.toastsDuration')}
            description={t('settings.interface.toastsDurationHint')}
            layout="stack"
          >
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={800}
                max={10000}
                step={100}
                value={toastSettings.durationMs}
                disabled={!toastSettings.enabled}
                aria-label={t('settings.interface.toastsDuration')}
                onChange={(event) =>
                  dispatch(patchToastSettings({ durationMs: Number(event.target.value) }))
                }
              />
              <span className="interface-zoom-value tabular-nums">
                {(toastSettings.durationMs / 1000).toFixed(1)}s
              </span>
            </div>
          </SettingsRow>

          <SettingsRow
            title={t('settings.interface.toastsMax')}
            description={t('settings.interface.toastsMaxHint')}
            layout="stack"
          >
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                value={toastSettings.maxVisible}
                disabled={!toastSettings.enabled}
                aria-label={t('settings.interface.toastsMax')}
                onChange={(event) =>
                  dispatch(patchToastSettings({ maxVisible: Number(event.target.value) }))
                }
              />
              <span className="interface-zoom-value tabular-nums">{toastSettings.maxVisible}</span>
            </div>
          </SettingsRow>

          <SettingsRow
            title={t('settings.interface.toastsStack')}
            description={t('settings.interface.toastsStackHint')}
            layout="stack"
          >
            <select
              className="h-8 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-[13px]"
              value={toastSettings.stackBehavior}
              disabled={!toastSettings.enabled}
              onChange={(event) =>
                dispatch(
                  patchToastSettings({ stackBehavior: event.target.value as ToastStackBehavior }),
                )
              }
            >
              <option value="drop-oldest">{t('settings.interface.toastsStackOldest')}</option>
              <option value="drop-newest">{t('settings.interface.toastsStackNewest')}</option>
              <option value="replace-same">{t('settings.interface.toastsStackReplace')}</option>
            </select>
          </SettingsRow>

          <SettingsRow
            title={t('settings.interface.toastsDense')}
            description={t('settings.interface.toastsDenseHint')}
          >
            <SettingsToggle
              checked={toastSettings.dense}
              onChange={() => dispatch(patchToastSettings({ dense: !toastSettings.dense }))}
              onLabel={t('settings.interface.on')}
              offLabel={t('settings.interface.off')}
            />
          </SettingsRow>

          <SettingsRow
            title={t('settings.interface.toastsReducedMotion')}
            description={t('settings.interface.toastsReducedMotionHint')}
          >
            <SettingsToggle
              checked={toastSettings.respectReducedMotion}
              onChange={() =>
                dispatch(
                  patchToastSettings({
                    respectReducedMotion: !toastSettings.respectReducedMotion,
                  }),
                )
              }
              onLabel={t('settings.interface.on')}
              offLabel={t('settings.interface.off')}
            />
          </SettingsRow>

          <SettingsRow
            title={t('settings.interface.toastsPreview')}
            description={t('settings.interface.toastsPreviewHint')}
          >
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={!toastSettings.enabled}
                onClick={() => toast.success(t('settings.interface.toastsPreviewSuccess'))}
              >
                {t('settings.interface.toastsPreviewSuccessBtn')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={!toastSettings.enabled}
                onClick={() => toast.info(t('settings.interface.toastsPreviewInfo'))}
              >
                {t('settings.interface.toastsPreviewInfoBtn')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  dispatch(setToastSettings(DEFAULT_TOAST_SETTINGS))
                  toast.info(t('settings.interface.toastsResetDone'))
                }}
              >
                {t('common.reset')}
              </Button>
            </div>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>
    </div>
  )
}
