import { Search, Trash2, Upload } from 'lucide-react'
import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { IconTooltip } from '@/components/ui/tooltip'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import {
  ensureCustomFontLoaded,
  listCustomFonts,
  registerCustomFontFromPicker,
  removeCustomFont,
  type CustomFontRecord,
} from '@/lib/editor/custom-fonts'
import {
  ensureGoogleFontLoaded,
  filterGoogleFonts,
  listGoogleFontFamilies,
} from '@/lib/editor/google-fonts'
import {
  UI_FONT_PRESETS,
  customUiFontChoice,
  googleUiFontChoice,
  patchUiFontSettings,
  readUiFontSettings,
  type UiFontPresetId,
  type UiFontRole,
  type UiFontSettings,
} from '@/lib/ui-fonts'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FontsSettingsSection() {
  const { t } = useTranslation()
  const [uiFonts, setUiFonts] = useState<UiFontSettings>(() => readUiFontSettings())
  const [uploaded, setUploaded] = useState<CustomFontRecord[]>(() => listCustomFonts())
  const [busy, setBusy] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)
  const [googleFonts, setGoogleFonts] = useState<string[]>([])
  const [googleLoading, setGoogleLoading] = useState(true)
  const [googleQuery, setGoogleQuery] = useState('')
  const applySeq = useRef(0)

  useEffect(() => {
    let cancelled = false
    setGoogleLoading(true)
    void listGoogleFontFamilies()
      .then((fonts) => {
        if (!cancelled) setGoogleFonts(fonts)
      })
      .finally(() => {
        if (!cancelled) setGoogleLoading(false)
      })
    // Warm uploaded faces once — don't re-run on every selection.
    for (const font of listCustomFonts()) {
      void ensureCustomFontLoaded(font.family)
    }
    return () => {
      cancelled = true
    }
  }, [])

  const googleVisible = useMemo(
    () => filterGoogleFonts(googleFonts, googleQuery, 36),
    [googleFonts, googleQuery],
  )

  function refreshUploaded() {
    const next = listCustomFonts()
    setUploaded(next)
    return next
  }

  function setRole(role: UiFontRole, choice: string) {
    const seq = ++applySeq.current
    setApplying(choice)
    startTransition(() => {
      const next = patchUiFontSettings({ [role]: choice }, uiFonts)
      setUiFonts(next)
    })
    // Clear “applying” after the smooth font swap finishes (best-effort).
    window.setTimeout(() => {
      if (applySeq.current === seq) setApplying(null)
    }, 900)
  }

  async function handleUpload() {
    if (busy) return
    setBusy(true)
    try {
      const result = await registerCustomFontFromPicker()
      if (!result.ok) {
        if (result.error === 'cancelled') return
        const key =
          result.error === 'unsupported'
            ? 'toolbar.fonts.uploadUnsupported'
            : result.error === 'tooLarge'
              ? 'toolbar.fonts.uploadTooLarge'
              : result.error === 'limit'
                ? 'toolbar.fonts.uploadLimit'
                : 'toolbar.fonts.uploadFailed'
        toast.error(t(key))
        return
      }
      refreshUploaded()
      toast.success(t('toolbar.fonts.uploadDone'), result.record.family)
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(font: CustomFontRecord) {
    await removeCustomFont(font.id)
    const next = refreshUploaded()
    const customId = customUiFontChoice(font.family)
    const patch: Partial<UiFontSettings> = {}
    if (uiFonts.sans === customId) patch.sans = 'default'
    if (uiFonts.display === customId) patch.display = 'default'
    if (Object.keys(patch).length) {
      setUiFonts(patchUiFontSettings(patch, uiFonts))
    } else {
      setUploaded(next)
    }
    toast.success(t('settings.appearance.fonts.removed'), font.family)
  }

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title={t('settings.appearance.fonts.title')}
        description={t('settings.appearance.fonts.description')}
      />

      <SettingsGroup>
        <SettingsRow
          title={t('settings.appearance.fonts.uiBody')}
          description={t('settings.appearance.fonts.uiBodyHint')}
          layout="stack"
        >
          <FontAaOptions
            role="sans"
            value={uiFonts.sans}
            uploaded={uploaded}
            applying={applying}
            onSelect={(choice) => setRole('sans', choice)}
          />
        </SettingsRow>

        <SettingsRow
          title={t('settings.appearance.fonts.uiDisplay')}
          description={t('settings.appearance.fonts.uiDisplayHint')}
          layout="stack"
        >
          <FontAaOptions
            role="display"
            value={uiFonts.display}
            uploaded={uploaded}
            applying={applying}
            onSelect={(choice) => setRole('display', choice)}
          />
        </SettingsRow>

        <SettingsRow
          title={t('settings.appearance.fonts.googleTitle')}
          description={t('settings.appearance.fonts.googleHint')}
          layout="stack"
        >
          <div className="flex w-full flex-col gap-2">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
              <input
                className="h-9 w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] py-0 pl-8 pr-3 text-[13px] text-[var(--color-foreground)] outline-none focus:border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-border))]"
                value={googleQuery}
                placeholder={t('toolbar.fonts.searchPlaceholder')}
                onChange={(event) => setGoogleQuery(event.target.value)}
                aria-label={t('toolbar.fonts.searchPlaceholder')}
              />
            </label>
            {googleLoading ? (
              <p className="m-0 text-[12px] text-[var(--color-muted-foreground)]" role="status">
                {t('settings.appearance.fonts.googleLoading')}
              </p>
            ) : (
              <div className="grid max-h-[220px] grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
                {googleVisible.map((family) => {
                  const choice = googleUiFontChoice(family)
                  const active = uiFonts.sans === choice || uiFonts.display === choice
                  return (
                    <button
                      key={family}
                      type="button"
                      className={cn(
                        'flex flex-col items-start gap-0.5 rounded-[10px] border px-2.5 py-2 text-left transition-colors',
                        active
                          ? 'border-[var(--color-accent)] bg-[var(--color-selection)]'
                          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-hover)]',
                        applying === choice && 'opacity-70',
                      )}
                      onMouseEnter={() => ensureGoogleFontLoaded(family, { force: true })}
                      onFocus={() => ensureGoogleFontLoaded(family, { force: true })}
                      onClick={() => {
                        ensureGoogleFontLoaded(family, { force: true })
                        setRole('sans', choice)
                      }}
                      title={t('settings.appearance.fonts.googleApplyBody')}
                    >
                      <span
                        className="text-[18px] font-semibold leading-none"
                        style={{ fontFamily: `"${family}", sans-serif` }}
                      >
                        Aa
                      </span>
                      <span className="max-w-full truncate text-[10.5px] font-semibold text-[var(--color-muted-foreground)]">
                        {family}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {!googleLoading && googleVisible.length === 0 ? (
              <p className="m-0 text-[12px] text-[var(--color-muted-foreground)]">
                {t('settings.appearance.fonts.googleEmpty')}
              </p>
            ) : null}
          </div>
        </SettingsRow>

        <SettingsRow
          title={t('settings.appearance.fonts.libraryTitle')}
          description={t('settings.appearance.fonts.libraryHint')}
          layout="stack"
        >
          <div className="flex w-full flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void handleUpload()}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {busy ? t('toolbar.fonts.uploading') : t('toolbar.fonts.upload')}
              </Button>
              <span className="text-[11px] text-[var(--color-muted-foreground)]">
                {t('toolbar.fonts.uploadHint')}
              </span>
            </div>

            {uploaded.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {uploaded.map((font) => (
                  <li
                    key={font.id}
                    className="flex items-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2"
                  >
                    <span
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[15px] font-semibold"
                      style={{ fontFamily: `"${font.family}"` }}
                      aria-hidden="true"
                    >
                      Aa
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className="m-0 truncate text-[13px] font-semibold"
                        style={{ fontFamily: `"${font.family}"` }}
                      >
                        {font.family}
                      </p>
                      <p className="m-0 truncate text-[11px] text-[var(--color-muted-foreground)]">
                        {font.fileName} · {formatBytes(font.byteLength)}
                      </p>
                    </div>
                    <IconTooltip label={t('settings.appearance.fonts.remove')}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-[var(--color-muted-foreground)]"
                        aria-label={t('settings.appearance.fonts.remove')}
                        onClick={() => void handleRemove(font)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </IconTooltip>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-[12.5px] text-[var(--color-muted-foreground)]">
                {t('settings.appearance.fonts.libraryEmpty')}
              </p>
            )}
          </div>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}

function FontAaOptions({
  role,
  value,
  uploaded,
  applying,
  onSelect,
}: {
  role: UiFontRole
  value: string
  uploaded: CustomFontRecord[]
  applying: string | null
  onSelect: (choice: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div
      className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3"
      role="listbox"
      aria-label={
        role === 'sans'
          ? t('settings.appearance.fonts.uiBody')
          : t('settings.appearance.fonts.uiDisplay')
      }
    >
      {UI_FONT_PRESETS.map((preset) => {
        const stack = role === 'sans' ? preset.sans : preset.display
        const active = value === preset.id
        return (
          <button
            key={preset.id}
            type="button"
            role="option"
            aria-selected={active}
            disabled={applying === preset.id}
            className={cn(
              'flex flex-col items-start gap-1 rounded-[12px] border px-3 py-2.5 text-left transition-colors',
              active
                ? 'border-[var(--color-accent)] bg-[var(--color-selection)] shadow-[0_8px_20px_color-mix(in_srgb,var(--color-accent)_14%,transparent)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-hover)]',
              applying === preset.id && 'opacity-70',
            )}
            onClick={() => onSelect(preset.id)}
          >
            <span
              className="text-[22px] font-semibold leading-none tracking-tight"
              style={{ fontFamily: stack }}
            >
              {preset.sample}
            </span>
            <span className="text-[11px] font-semibold text-[var(--color-muted-foreground)]">
              {t(`settings.appearance.fonts.presets.${preset.id as UiFontPresetId}`)}
            </span>
          </button>
        )
      })}

      {uploaded.map((font) => {
        const choice = customUiFontChoice(font.family)
        const active = value === choice
        const stack = `"${font.family}", sans-serif`
        return (
          <button
            key={`${role}-${font.id}`}
            type="button"
            role="option"
            aria-selected={active}
            className={cn(
              'flex flex-col items-start gap-1 rounded-[12px] border px-3 py-2.5 text-left transition-colors',
              active
                ? 'border-[var(--color-accent)] bg-[var(--color-selection)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-hover)]',
            )}
            onClick={() => onSelect(choice)}
          >
            <span
              className="text-[22px] font-semibold leading-none tracking-tight"
              style={{ fontFamily: stack }}
            >
              Aa
            </span>
            <span className="max-w-full truncate text-[11px] font-semibold text-[var(--color-muted-foreground)]">
              {font.family}
            </span>
          </button>
        )
      })}
    </div>
  )
}
