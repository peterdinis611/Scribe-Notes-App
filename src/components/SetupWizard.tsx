import { Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCustomLocaleRefresh } from '@/components/LocaleToggle'
import { registerCustomLocaleBundle } from '@/i18n'
import { APP_SHORT_VERSION } from '@/lib/app-version'
import { pickAndParseCustomLocale } from '@/lib/i18n/custom-locale-io'
import { THEME_PRESETS } from '@/lib/themes/presets'
import type { ThemePresetId } from '@/lib/themes/types'
import type { UiSkin } from '@/lib/ui-skin'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import {
  ensureSetupCompletedForExistingUsers,
  persistOnboardingDismissed,
  persistSetupCompleted,
  readSetupCompleted,
  upsertCustomLocale,
} from '@/store/persistence'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { createThemeSelection } from '@/store/settings-helpers'
import { setLocale, setThemeSettings, setUiSkin } from '@/store/settingsSlice'

const STEP_IDS = ['welcome', 'skin', 'theme'] as const

const WIZARD_THEME_IDS: ThemePresetId[] = [
  'system',
  'light',
  'dark',
  'sepia',
  'paper',
  'blotter',
  'nord',
  'midnight',
  'forest',
  'ocean',
  'rose',
  'dracula',
]

const WELCOME_POINTS = ['newDocument', 'wikiLink', 'structure'] as const

type SetupWizardProps = {
  onFinished?: () => void
}

export function SetupWizard({ onFinished }: SetupWizardProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const themeSettings = useAppSelector((state) => state.settings.themeSettings)
  const uiSkin = useAppSelector((state) => state.settings.uiSkin)
  const locale = useAppSelector((state) => state.settings.locale)
  const { bump } = useCustomLocaleRefresh()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [localeBusy, setLocaleBusy] = useState(false)

  useEffect(() => {
    if (ensureSetupCompletedForExistingUsers() || readSetupCompleted()) {
      setOpen(false)
      return
    }
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const wizardThemes = useMemo(() => {
    return WIZARD_THEME_IDS.map((id) => {
      if (id === 'system') {
        return {
          id,
          name: t('settings.appearance.systemTheme'),
          swatch: ['#ffffff', '#1e1e1e'] as [string, string],
        }
      }
      const preset = THEME_PRESETS.find((entry) => entry.id === id)
      if (!preset) return null
      return {
        id,
        name: preset.name,
        swatch: [preset.colors.background, preset.colors.selectionStrong] as [string, string],
      }
    }).filter(Boolean) as Array<{
      id: ThemePresetId
      name: string
      swatch: [string, string]
    }>
  }, [t])

  function finish(startTour = false) {
    persistSetupCompleted(true)
    if (!startTour) persistOnboardingDismissed(true)
    setOpen(false)
    onFinished?.()
  }

  function handleNext() {
    if (step >= STEP_IDS.length - 1) {
      finish(false)
      return
    }
    setStep((value) => value + 1)
  }

  function handleBack() {
    setStep((value) => Math.max(0, value - 1))
  }

  function chooseTheme(themeId: ThemePresetId) {
    dispatch(setThemeSettings(createThemeSelection(themeSettings, themeId)))
  }

  function chooseSkin(skin: UiSkin) {
    dispatch(setUiSkin(skin))
  }

  async function handleImportLanguage() {
    if (localeBusy) return
    setLocaleBusy(true)
    try {
      const pack = await pickAndParseCustomLocale()
      if (!pack) return
      registerCustomLocaleBundle(pack)
      upsertCustomLocale(pack)
      bump()
      dispatch(setLocale(pack.code))
      toast.success(t('toasts.localeImported', { name: pack.name }))
    } catch (error) {
      toast.error(t('toasts.localeImportError'), String(error))
    } finally {
      setLocaleBusy(false)
    }
  }

  if (!open) return null

  const stepId = STEP_IDS[step]!
  const isLast = step >= STEP_IDS.length - 1
  const folio = String(step + 1).padStart(2, '0')

  return (
    <div className="setup-folio-root titlebar-no-drag" role="dialog" aria-modal="true" aria-labelledby="setup-folio-title">
      <div className="setup-folio-scrim" />
      <div className="setup-folio">
        <aside className="setup-folio-margin" aria-hidden="true">
          <p className="setup-folio-brand">{t('welcome.brandWithEdition', { version: APP_SHORT_VERSION })}</p>
          <span className="setup-folio-numeral">{folio}</span>
          <p className="setup-folio-count">{t('setup.stepOf', { current: step + 1, total: STEP_IDS.length })}</p>
        </aside>

        <div className="setup-folio-page">
          <header className="setup-folio-head">
            <p className="setup-folio-kicker">{t('setup.kicker', { version: APP_SHORT_VERSION })}</p>
            <h1 id="setup-folio-title" className="setup-folio-title">
              {stepId === 'welcome'
                ? t('onboarding.title', { version: APP_SHORT_VERSION })
                : t(`setup.${stepId}.title`)}
            </h1>
            <p className="setup-folio-lead">
              {stepId === 'welcome' ? t('setup.welcome.lead') : t(`setup.${stepId}.description`)}
            </p>
          </header>

          {stepId === 'welcome' && (
            <div className="setup-folio-body">
              <ol className="setup-folio-points">
                {WELCOME_POINTS.map((id, index) => (
                  <li key={id}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{t(`onboarding.${id}.title`)}</strong>
                      <p>{t(`onboarding.${id}.description`)}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="setup-folio-langs" role="group" aria-label={t('setup.language.title')}>
                {([
                  ['sk', 'Slovenčina', 'Píšte v slovenčine.'],
                  ['en', 'English', 'Write in English.'],
                ] as const).map(([id, label, hint]) => (
                  <button
                    key={id}
                    type="button"
                    className={cn('setup-folio-lang', locale === id && 'is-active')}
                    aria-pressed={locale === id}
                    onClick={() => dispatch(setLocale(id))}
                  >
                    <em>{id.toUpperCase()}</em>
                    <strong>{label}</strong>
                    <span>{hint}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="setup-folio-import"
                disabled={localeBusy}
                onClick={() => void handleImportLanguage()}
              >
                <Upload className="h-3.5 w-3.5" />
                {t('settings.language.importJson')}
              </button>
            </div>
          )}

          {stepId === 'skin' && (
            <div className="setup-folio-skins">
              {([
                ['classic', 'settings.appearance.skinClassic', 'settings.appearance.skinClassicDesc'],
                ['press', 'settings.appearance.skinPress', 'settings.appearance.skinPressDesc'],
              ] as const).map(([id, titleKey, descKey]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => chooseSkin(id)}
                  className={cn('setup-folio-skin', uiSkin === id && 'is-active')}
                  aria-pressed={uiSkin === id}
                >
                  <span className={cn('setup-folio-skin-sheet', `is-${id}`)} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <strong>{t(titleKey)}</strong>
                  <span>{t(descKey)}</span>
                </button>
              ))}
            </div>
          )}

          {stepId === 'theme' && (
            <div className="setup-folio-themes">
              {wizardThemes.map((theme) => {
                const active = themeSettings.themeId === theme.id
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => chooseTheme(theme.id)}
                    className={cn('setup-folio-theme', active && 'is-active')}
                    aria-pressed={active}
                    title={theme.name}
                  >
                    <span className="setup-folio-swatch" aria-hidden="true">
                      <span style={{ background: theme.swatch[0] }} />
                      <span style={{ background: theme.swatch[1] }} />
                    </span>
                    <em>{theme.name}</em>
                  </button>
                )
              })}
            </div>
          )}

          <footer className="setup-folio-foot">
            <button type="button" className="setup-folio-quiet" onClick={() => finish(false)}>
              {t('common.skip')}
            </button>
            <div className="setup-folio-actions">
              {step > 0 && (
                <button type="button" className="setup-folio-ghost" onClick={handleBack}>
                  {t('common.back')}
                </button>
              )}
              {isLast ? (
                <>
                  <button type="button" className="setup-folio-ghost" onClick={() => finish(true)}>
                    {t('setup.showTour')}
                  </button>
                  <button type="button" className="setup-folio-next" onClick={() => finish(false)}>
                    {t('setup.startWriting')}
                  </button>
                </>
              ) : (
                <button type="button" className="setup-folio-next" onClick={handleNext}>
                  {t('common.next')}
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}
