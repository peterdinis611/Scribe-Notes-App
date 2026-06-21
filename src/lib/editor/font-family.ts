import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontFamily: {
      setFontFamily: (fontFamily: string) => ReturnType
      unsetFontFamily: () => ReturnType
    }
  }
}

export const FONT_FAMILIES = [
  { label: 'Predvolená', value: '' },
  { label: 'Systémová', value: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
  { label: 'Segoe UI', value: '"Segoe UI", Tahoma, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Garamond', value: 'Garamond, "Times New Roman", serif' },
  { label: 'Palatino', value: 'Palatino, "Palatino Linotype", serif' },
  { label: 'Baskerville', value: 'Baskerville, "Times New Roman", serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Courier', value: '"Courier New", Courier, monospace' },
  { label: 'Monospace', value: '"SF Mono", Menlo, Monaco, monospace' },
  { label: 'Consolas', value: 'Consolas, "Courier New", monospace' },
] as const

export function normalizeFontFamily(value: string | null | undefined) {
  return (value ?? '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function isPresetFontFamily(value: string | null | undefined) {
  const normalized = normalizeFontFamily(value)
  if (!normalized) return true
  return FONT_FAMILIES.some((item) => normalizeFontFamily(item.value) === normalized)
}

export function getFontFamilyLabel(editorValue: string | null | undefined) {
  const normalized = normalizeFontFamily(editorValue)
  if (!normalized) return 'Predvolená'

  const preset = FONT_FAMILIES.find((item) => normalizeFontFamily(item.value) === normalized)
  if (preset) return preset.label

  const firstFamily = (editorValue ?? '').split(',')[0]?.replaceAll('"', '').trim()
  return firstFamily || 'Vlastný font'
}

export function formatCustomFontFamily(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (trimmed.includes(',')) return trimmed

  if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.test(trimmed)) {
    return trimmed
  }

  if (/\s/.test(trimmed)) {
    return `"${trimmed}"`
  }

  return trimmed
}

export const FontFamily = Extension.create({
  name: 'fontFamily',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element) => element.style.fontFamily?.replaceAll('"', '') || null,
            renderHTML: (attributes) => {
              if (!attributes.fontFamily) return {}
              return { style: `font-family: ${attributes.fontFamily}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setFontFamily:
        (fontFamily: string) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontFamily: formatCustomFontFamily(fontFamily) }).run(),
      unsetFontFamily:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run(),
    }
  },
})
