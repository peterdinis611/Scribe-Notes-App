import { useEffect, useMemo, useState } from 'react'
import { Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { listSystemFontFamilies } from '@/lib/db/api'
import {
  applyCustomFontFamily,
  ensureCustomFontLoaded,
  listCustomFonts,
  registerCustomFontFromPicker,
  type CustomFontRecord,
} from '@/lib/editor/custom-fonts'
import {
  FONT_FAMILIES,
  formatCustomFontFamily,
  getFontFamilyLabel,
  normalizeFontFamily,
  pushRecentFont,
  readRecentFonts,
} from '@/lib/editor/font-family'
import {
  applyGoogleFontFamily,
  filterGoogleFonts,
  listGoogleFontFamilies,
} from '@/lib/editor/google-fonts'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

type FontFamilyFieldProps = {
  value: string
  onChange: (value: string) => void
  className?: string
}

function presetLabel(item: (typeof FONT_FAMILIES)[number], t: (key: string) => string) {
  if ('labelKey' in item && item.labelKey) return t(item.labelKey)
  if ('label' in item) return item.label
  return ''
}

/** Document-level font family control (page setup / typography). */
export function FontFamilyField({ value, onChange, className }: FontFamilyFieldProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [googleFonts, setGoogleFonts] = useState<string[]>([])
  const [uploadedFonts, setUploadedFonts] = useState<CustomFontRecord[]>(() => listCustomFonts())
  const [customDraft, setCustomDraft] = useState(value)
  const [recentFonts, setRecentFonts] = useState(() => readRecentFonts())
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    setCustomDraft(value)
  }, [value])

  useEffect(() => {
    let cancelled = false
    void listSystemFontFamilies().then((fonts) => {
      if (!cancelled) setSystemFonts(fonts)
    })
    void listGoogleFontFamilies().then((fonts) => {
      if (!cancelled) setGoogleFonts(fonts)
    })
    setUploadedFonts(listCustomFonts())
    for (const font of listCustomFonts()) {
      void ensureCustomFontLoaded(font.family)
    }
    return () => {
      cancelled = true
    }
  }, [])

  function apply(next: string, options?: { google?: boolean; uploaded?: boolean }) {
    const formatted = options?.uploaded
      ? applyCustomFontFamily(next)
      : options?.google
        ? applyGoogleFontFamily(next)
        : formatCustomFontFamily(next)
    if (options?.uploaded) void ensureCustomFontLoaded(next)
    onChange(formatted)
    if (formatted) {
      pushRecentFont(formatted)
      setRecentFonts(readRecentFonts())
    }
  }

  async function handleUpload() {
    if (uploading) return
    setUploading(true)
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
        toast.error(t('toolbar.fonts.uploadError'), t(key))
        return
      }
      setUploadedFonts(listCustomFonts())
      apply(result.record.family, { uploaded: true })
      toast.success(t('toolbar.fonts.uploadDone'), result.record.family)
    } finally {
      setUploading(false)
    }
  }

  const q = query.trim().toLowerCase()
  const options = useMemo(() => {
    const rows: Array<{ id: string; label: string; value: string; google?: boolean; uploaded?: boolean }> = []

    for (const item of FONT_FAMILIES) {
      const label = presetLabel(item, t)
      if (q && !label.toLowerCase().includes(q) && !normalizeFontFamily(item.value).includes(q)) {
        continue
      }
      rows.push({ id: `preset:${item.value || 'default'}`, label, value: item.value })
    }

    for (const font of uploadedFonts) {
      if (q && !font.family.toLowerCase().includes(q) && !font.fileName.toLowerCase().includes(q)) {
        continue
      }
      rows.push({
        id: `uploaded:${font.id}`,
        label: font.family,
        value: font.family,
        uploaded: true,
      })
    }

    for (const font of recentFonts) {
      if (q && !font.toLowerCase().includes(q)) continue
      rows.push({
        id: `recent:${font}`,
        label: getFontFamilyLabel(font, t),
        value: font,
        google: true,
      })
    }

    for (const font of filterGoogleFonts(googleFonts, query, 50)) {
      rows.push({ id: `google:${font}`, label: font, value: font, google: true })
    }

    const systemSlice = q
      ? systemFonts.filter((font) => font.toLowerCase().includes(q)).slice(0, 80)
      : systemFonts.slice(0, 50)

    for (const font of systemSlice) {
      rows.push({ id: `system:${font}`, label: font, value: font })
    }

    return rows
  }, [googleFonts, q, query, recentFonts, systemFonts, t, uploadedFonts])

  const currentLabel = getFontFamilyLabel(value, t)

  return (
    <div className={cn('font-family-field', className)}>
      <div className="font-family-field-current" style={{ fontFamily: value || undefined }}>
        {currentLabel || t('toolbar.fonts.default')}
      </div>
      <button
        type="button"
        className="font-family-upload-btn font-family-upload-btn--field"
        disabled={uploading}
        onClick={() => void handleUpload()}
      >
        <Upload className="h-3.5 w-3.5" aria-hidden />
        {uploading ? t('toolbar.fonts.uploading') : t('toolbar.fonts.upload')}
      </button>
      <p className="font-family-hint m-0 px-0.5">{t('toolbar.fonts.uploadHint')}</p>
      <input
        type="search"
        className="font-family-search-input"
        value={query}
        placeholder={t('toolbar.fonts.searchPlaceholder')}
        aria-label={t('toolbar.fonts.searchPlaceholder')}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="font-family-field-list" role="listbox" aria-label={t('pageStyles.fontFamily')}>
        {options.some((option) => option.id.startsWith('google:')) && (
          <p className="font-family-hint m-0 px-2.5 py-1.5">{t('toolbar.fonts.googleHint')}</p>
        )}
        {options.map((option) => {
          const active = normalizeFontFamily(option.value) === normalizeFontFamily(value)
          return (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={active}
              className={cn('font-family-field-option', active && 'is-active')}
              style={{ fontFamily: option.value || undefined }}
              onClick={() => apply(option.value, { google: option.google, uploaded: option.uploaded })}
            >
              <span>{option.label}</span>
              {active && <span className="font-family-option-check">✓</span>}
            </button>
          )
        })}
      </div>
      <div className="font-family-custom-row">
        <input
          type="text"
          className="font-family-custom-input"
          placeholder={t('toolbar.fonts.customPlaceholder')}
          value={customDraft}
          aria-label={t('toolbar.fonts.custom')}
          onChange={(event) => setCustomDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              apply(customDraft, { google: true })
            }
          }}
        />
        <button
          type="button"
          className="font-family-custom-apply"
          onClick={() => apply(customDraft, { google: true })}
        >
          {t('common.ok')}
        </button>
      </div>
    </div>
  )
}
