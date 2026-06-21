import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import {
  FONT_FAMILIES,
  formatCustomFontFamily,
  getFontFamilyLabel,
  isPresetFontFamily,
  normalizeFontFamily,
} from '@/lib/editor/font-family'

type FontFamilyMenuItemsProps = {
  editor: Editor
  onApplied?: () => void
}

export function FontFamilyMenuItems({ editor, onApplied }: FontFamilyMenuItemsProps) {
  const currentFontFamily = editor.getAttributes('textStyle').fontFamily as string | undefined
  const normalizedCurrentFont = normalizeFontFamily(currentFontFamily)
  const [customFont, setCustomFont] = useState(() =>
    isPresetFontFamily(currentFontFamily) ? '' : (currentFontFamily ?? ''),
  )

  function applyFont(value: string) {
    const formatted = formatCustomFontFamily(value)
    if (!formatted) editor.chain().focus().unsetFontFamily().run()
    else editor.chain().focus().setFontFamily(formatted).run()
    onApplied?.()
  }

  return (
    <>
      {FONT_FAMILIES.map(({ label, value }) => (
        <DropdownMenuItem
          key={label}
          className="font-family-option"
          style={{ fontFamily: value || undefined }}
          onClick={() => applyFont(value)}
        >
          <span>{label}</span>
          {normalizeFontFamily(value) === normalizedCurrentFont && (
            <span className="font-family-option-check">✓</span>
          )}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <div
        className="font-family-custom"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <label className="font-family-custom-label" htmlFor="custom-font-input">
          Vlastný font
        </label>
        <div className="font-family-custom-row">
          <input
            id="custom-font-input"
            type="text"
            className="font-family-custom-input"
            placeholder='napr. "Comic Sans MS"'
            value={customFont}
            onChange={(event) => setCustomFont(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                applyFont(customFont)
              }
            }}
          />
          <button type="button" className="font-family-custom-apply" onClick={() => applyFont(customFont)}>
            OK
          </button>
        </div>
      </div>
    </>
  )
}

export function getCurrentFontFamilyLabel(editor: Editor) {
  const currentFontFamily = editor.getAttributes('textStyle').fontFamily as string | undefined
  return getFontFamilyLabel(currentFontFamily)
}
