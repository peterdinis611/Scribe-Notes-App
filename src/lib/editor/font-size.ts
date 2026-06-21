import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType
      unsetFontSize: () => ReturnType
    }
  }
}

export const FontSize = Extension.create({
  name: 'fontSize',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {}
              return { style: `font-size: ${attributes.fontSize}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    }
  },
})

export const FONT_SIZES = ['12px', '14px', '16px', '18px', '22px', '28px'] as const

export const TEXT_COLORS = [
  { label: 'Predvolená', value: '' },
  { label: 'Čierna', value: '#1d1d1f' },
  { label: 'Modrá', value: '#007aff' },
  { label: 'Červená', value: '#ff3b30' },
  { label: 'Zelená', value: '#34c759' },
  { label: 'Oranžová', value: '#ff9500' },
  { label: 'Fialová', value: '#af52de' },
] as const

export const HIGHLIGHT_COLORS = [
  { label: 'Žltá', value: '#fff3a3' },
  { label: 'Zelená', value: '#d1fae5' },
  { label: 'Modrá', value: '#dbeafe' },
  { label: 'Ružová', value: '#fce7f3' },
] as const
