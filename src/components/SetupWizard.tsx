import { Languages, Palette, Sparkles, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LocaleToggle, useCustomLocaleRefresh } from '@/components/LocaleToggle'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { registerCustomLocaleBundle } from '@/i18n'
import { pickAndParseCustomLocale } from '@/lib/i18n/custom-locale-io'
import { THEME_PRESETS } from '@/lib/themes/presets'
import type { ThemePresetId } from '@/lib/themes/types'
import type { UiSkin } from '@/lib/ui-skin'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import {
  ensureSetupCompletedForExistingUsers,
  persistSetupCompleted,
  readSetupCompleted,
  upsertCustomLocale,
} from '@/store/persistence'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { createThemeSelection } from '@/store/settings-helpers'
import { setLocale, setThemeSettings, setUiSkin } from '@/store/settingsSlice'

const STEP_IDS = ['language', 'skin', 'theme'] as const

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

type SetupWizardProps = {
  onFinished?: () => void
}

export function SetupWizard({ onFinished }: SetupWizardProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const themeSettings = useAppSelector((state) => state.settings.themeSettings)
  const uiSkin = useAppSelector((state) => state.settings.uiSkin)
  const { refreshToken, bump } = useCustomLocaleRefresh()
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

  const wizardThemes = useMemo(() => {
    return WIZARD_THEME_IDS.map((id) => {
      if (id === 'system') {
        return {
          id,
          name: t('settings.appearance.systemTheme'),
          description: t('settings.appearance.systemThemeDescription'),
          swatch: ['#ffffff', '#1e1e1e'] as [string, string],
        }
      }
      const preset = THEME_PRESETS.find((entry) => entry.id === id)
      if (!preset) return null
      return {
        id,
        name: preset.name,
        description: preset.description,
        swatch: [preset.colors.background, preset.colors.selectionStrong] as [string, string],
      }
    }).filter(Boolean) as Array<{
      id: ThemePresetId
      name: string
      description: string
      swatch: [string, string]
    }>
  }, [t])

  function finish() {
    persistSetupCompleted(true)
    setOpen(false)
    onFinished?.()
  }

  function handleNext() {
    if (step >= STEP_IDS.length - 1) {
      finish()
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
  const Icon = stepId === 'language' ? Languages : stepId === 'skin' ? Sparkles : Palette

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) finish()
      }}
    >
      <DialogContent
        className="setup-wizard max-w-[520px] overflow-hidden shadow-[inset_3px_0_0_0_var(--color-accent)]"
        showClose
      >
        <DialogHeader>
          <div className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface))] text-[var(--color-accent)]">
            <Icon className="h-4 w-4" />
          </div>
          <DialogTitle className="font-[family-name:var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]">
            {t('setup.title')}
          </DialogTitle>
          <DialogDescription className="font-mono text-[10px] uppercase tracking-[0.1em]">
            {t('setup.stepOf', { current: step + 1, total: STEP_IDS.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-1">
          <h3 className="m-0 font-[family-name:var(--font-display)] text-[16px] font-bold tracking-[-0.02em] text-[var(--color-foreground)]">
            {t(`setup.${stepId}.title`)}
          </h3>
          <p className="m-0 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
            {t(`setup.${stepId}.description`)}
          </p>
        </div>

        {stepId === 'language' && (
          <div className="flex flex-col gap-3 py-1">
            <LocaleToggle showLabels refreshToken={refreshToken} className="w-fit" />
            <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
              <p className="m-0 mb-2 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
                {t('setup.language.importHint')}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={localeBusy}
                onClick={() => void handleImportLanguage()}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {t('settings.language.importJson')}
              </Button>
            </div>
          </div>
        )}

        {stepId === 'skin' && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([
              ['classic', 'settings.appearance.skinClassic', 'settings.appearance.skinClassicDesc'],
              ['press', 'settings.appearance.skinPress', 'settings.appearance.skinPressDesc'],
            ] as const).map(([id, titleKey, descKey]) => (
              <button
                key={id}
                type="button"
                onClick={() => chooseSkin(id)}
                className={cn(
                  'rounded-[var(--radius-md)] border px-4 py-3 text-left transition-colors',
                  uiSkin === id
                    ? 'border-[var(--color-accent)] bg-[var(--color-selection)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-hover)]',
                )}
              >
                <p className="m-0 text-[13px] font-semibold text-[var(--color-foreground)]">{t(titleKey)}</p>
                <p className="mt-1 text-[11px] leading-snug text-[var(--color-muted-foreground)]">
                  {t(descKey)}
                </p>
              </button>
            ))}
          </div>
        )}

        {stepId === 'theme' && (
          <div className="grid max-h-[280px] grid-cols-2 gap-2 overflow-y-auto pr-0.5 sm:grid-cols-3">
            {wizardThemes.map((theme) => {
              const active = themeSettings.themeId === theme.id
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => chooseTheme(theme.id)}
                  className={cn(
                    'flex flex-col gap-2 rounded-[var(--radius-md)] border p-2.5 text-left transition-colors',
                    active
                      ? 'border-[var(--color-accent)] bg-[var(--color-selection)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-hover)]',
                  )}
                >
                  <span
                    className="flex h-8 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]"
                    aria-hidden
                  >
                    <span className="flex-1" style={{ background: theme.swatch[0] }} />
                    <span className="w-1/3" style={{ background: theme.swatch[1] }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold text-[var(--color-foreground)]">
                      {theme.name}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[10px] leading-snug text-[var(--color-muted-foreground)]">
                      {theme.description}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 py-1">
          {STEP_IDS.map((id, index) => (
            <span
              key={id}
              className={
                index === step
                  ? 'h-1.5 w-5 rounded-[var(--radius-sm)] bg-[var(--color-accent)]'
                  : 'h-1.5 w-1.5 rounded-[var(--radius-sm)] bg-[var(--color-border)]'
              }
              aria-hidden="true"
            />
          ))}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={finish}>
              {t('common.skip')}
            </Button>
            {step > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={handleBack}>
                {t('common.back')}
              </Button>
            )}
          </div>
          <Button type="button" variant="default" size="sm" onClick={handleNext}>
            {isLast ? t('setup.finish') : t('common.next')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
