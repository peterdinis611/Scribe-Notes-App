import { useEffect, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { listSystemFontFamilies } from '@/lib/db/api'
import {
  FONT_FAMILIES,
  formatCustomFontFamily,
  getFontFamilyLabel,
  isPresetFontFamily,
  normalizeFontFamily,
  pushRecentFont,
  readRecentFonts,
} from '@/lib/editor/font-family'
import {
  applyGoogleFontFamily,
  filterGoogleFonts,
  listGoogleFontFamilies,
  matchesGoogleFontValue,
} from '@/lib/editor/google-fonts'

type FontFamilyMenuItemsProps = {
  editor: Editor
  onApplied?: () => void
}

function presetLabel(
  item: (typeof FONT_FAMILIES)[number],
  t: (key: string) => string,
) {
  if ('labelKey' in item && item.labelKey) return t(item.labelKey)
  if ('label' in item) return item.label
  return ''
}

export function FontFamilyMenuItems({ editor, onApplied }: FontFamilyMenuItemsProps) {
  const { t } = useTranslation()
  const currentFontFamily = editor.getAttributes('textStyle').fontFamily as string | undefined
  const normalizedCurrentFont = normalizeFontFamily(currentFontFamily)
  const [customFont, setCustomFont] = useState(() =>
    isPresetFontFamily(currentFontFamily) ? '' : (currentFontFamily ?? ''),
  )
  const [query, setQuery] = useState('')
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [googleFonts, setGoogleFonts] = useState<string[]>([])
  const [recentFonts, setRecentFonts] = useState(() => readRecentFonts())

  useEffect(() => {
    let cancelled = false
    void listSystemFontFamilies().then((fonts) => {
      if (!cancelled) setSystemFonts(fonts)
    })
    void listGoogleFontFamilies().then((fonts) => {
      if (!cancelled) setGoogleFonts(fonts)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function applyFont(value: string, options?: { google?: boolean }) {
    const formatted = options?.google
      ? applyGoogleFontFamily(value)
      : formatCustomFontFamily(value)
    if (!formatted) editor.chain().focus().unsetFontFamily().run()
    else {
      editor.chain().focus().setFontFamily(formatted).run()
      pushRecentFont(formatted)
      setRecentFonts(readRecentFonts())
    }
    onApplied?.()
  }

  const q = query.trim().toLowerCase()

  const presets = useMemo(() => {
    return FONT_FAMILIES.filter((item) => {
      if (!q) return true
      const label = presetLabel(item, t).toLowerCase()
      return label.includes(q) || normalizeFontFamily(item.value).includes(q)
    })
  }, [q, t])

  const filteredRecent = useMemo(() => {
    return recentFonts.filter((font) => {
      if (isPresetFontFamily(font)) return false
      if (!q) return true
      return normalizeFontFamily(font).includes(q)
    })
  }, [q, recentFonts])

  const filteredSystem = useMemo(() => {
    if (!q) return systemFonts.slice(0, 40)
    return systemFonts
      .filter((font) => font.toLowerCase().includes(q))
      .slice(0, 60)
  }, [q, systemFonts])

  const filteredGoogle = useMemo(
    () => filterGoogleFonts(googleFonts, query, 60),
    [googleFonts, query],
  )

  return (
    <>
      <div
        className="font-family-search"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="search"
          className="font-family-search-input"
          value={query}
          placeholder={t('toolbar.fonts.searchPlaceholder')}
          aria-label={t('toolbar.fonts.searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {presets.map((item) => {
        const label = presetLabel(item, t)
        return (
          <DropdownMenuItem
            key={item.value || 'default'}
            className="font-family-option"
            style={{ fontFamily: item.value || undefined }}
            onClick={() => applyFont(item.value)}
          >
            <span>{label}</span>
            {normalizeFontFamily(item.value) === normalizedCurrentFont && (
              <span className="font-family-option-check">✓</span>
            )}
          </DropdownMenuItem>
        )
      })}

      {filteredRecent.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <p className="font-family-section-label">{t('toolbar.fonts.recent')}</p>
          {filteredRecent.map((font) => (
            <DropdownMenuItem
              key={`recent:${font}`}
              className="font-family-option"
              style={{ fontFamily: font }}
              onClick={() => applyFont(font, { google: true })}
            >
              <span>{getFontFamilyLabel(font, t)}</span>
              {normalizeFontFamily(font) === normalizedCurrentFont && (
                <span className="font-family-option-check">✓</span>
              )}
            </DropdownMenuItem>
          ))}
        </>
      )}

      {filteredGoogle.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <p className="font-family-section-label">{t('toolbar.fonts.googleFonts')}</p>
          <p className="font-family-hint">{t('toolbar.fonts.googleHint')}</p>
          {filteredGoogle.map((font) => (
            <DropdownMenuItem
              key={`google:${font}`}
              className="font-family-option"
              style={{ fontFamily: `"${font}", sans-serif` }}
              onClick={() => applyFont(font, { google: true })}
            >
              <span>{font}</span>
              {matchesGoogleFontValue(currentFontFamily, font) && (
                <span className="font-family-option-check">✓</span>
              )}
            </DropdownMenuItem>
          ))}
          {!q && googleFonts.length > filteredGoogle.length && (
            <p className="font-family-hint">{t('toolbar.fonts.searchToSeeMore')}</p>
          )}
        </>
      )}

      {filteredSystem.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <p className="font-family-section-label">{t('toolbar.fonts.systemFonts')}</p>
          {filteredSystem.map((font) => (
            <DropdownMenuItem
              key={`system:${font}`}
              className="font-family-option"
              style={{ fontFamily: `"${font}", sans-serif` }}
              onClick={() => applyFont(font)}
            >
              <span>{font}</span>
              {normalizeFontFamily(font) === normalizedCurrentFont && (
                <span className="font-family-option-check">✓</span>
              )}
            </DropdownMenuItem>
          ))}
          {!q && systemFonts.length > filteredSystem.length && (
            <p className="font-family-hint">{t('toolbar.fonts.searchToSeeMore')}</p>
          )}
        </>
      )}

      <DropdownMenuSeparator />
      <div
        className="font-family-custom"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <label className="font-family-custom-label" htmlFor="custom-font-input">
          {t('toolbar.fonts.custom')}
        </label>
        <div className="font-family-custom-row">
          <input
            id="custom-font-input"
            type="text"
            className="font-family-custom-input"
            placeholder={t('toolbar.fonts.customPlaceholder')}
            value={customFont}
            onChange={(event) => setCustomFont(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                applyFont(customFont, { google: true })
              }
            }}
          />
          <button
            type="button"
            className="font-family-custom-apply"
            onClick={() => applyFont(customFont, { google: true })}
          >
            {t('common.ok')}
          </button>
        </div>
      </div>
    </>
  )
}

export function getCurrentFontFamilyLabel(editor: Editor, t?: (key: string) => string) {
  const currentFontFamily = editor.getAttributes('textStyle').fontFamily as string | undefined
  return getFontFamilyLabel(currentFontFamily, t)
}
