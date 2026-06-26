import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockSpacing: {
      setLineHeight: (lineHeight: string) => ReturnType
      unsetLineHeight: () => ReturnType
      setSpaceBefore: (space: string) => ReturnType
      unsetSpaceBefore: () => ReturnType
      setSpaceAfter: (space: string) => ReturnType
      unsetSpaceAfter: () => ReturnType
    }
  }
}

const BLOCK_TYPES = ['paragraph', 'heading'] as const

export const BlockSpacing = Extension.create({
  name: 'blockSpacing',

  addGlobalAttributes() {
    return [
      {
        types: [...BLOCK_TYPES],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) return {}
              return { style: `line-height: ${attributes.lineHeight}` }
            },
          },
          spaceBefore: {
            default: null,
            parseHTML: (element) => element.style.marginTop || null,
            renderHTML: (attributes) => {
              if (!attributes.spaceBefore) return {}
              return { style: `margin-top: ${attributes.spaceBefore}` }
            },
          },
          spaceAfter: {
            default: null,
            parseHTML: (element) => element.style.marginBottom || null,
            renderHTML: (attributes) => {
              if (!attributes.spaceAfter) return {}
              return { style: `margin-bottom: ${attributes.spaceAfter}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setLineHeight:
        (lineHeight: string) =>
        ({ editor, chain }) => {
          const type = editor.isActive('heading') ? 'heading' : 'paragraph'
          return chain().updateAttributes(type, { lineHeight }).run()
        },
      unsetLineHeight:
        () =>
        ({ editor, chain }) => {
          const type = editor.isActive('heading') ? 'heading' : 'paragraph'
          return chain().updateAttributes(type, { lineHeight: null }).run()
        },
      setSpaceBefore:
        (space: string) =>
        ({ editor, chain }) => {
          const type = editor.isActive('heading') ? 'heading' : 'paragraph'
          return chain().updateAttributes(type, { spaceBefore: space }).run()
        },
      unsetSpaceBefore:
        () =>
        ({ editor, chain }) => {
          const type = editor.isActive('heading') ? 'heading' : 'paragraph'
          return chain().updateAttributes(type, { spaceBefore: null }).run()
        },
      setSpaceAfter:
        (space: string) =>
        ({ editor, chain }) => {
          const type = editor.isActive('heading') ? 'heading' : 'paragraph'
          return chain().updateAttributes(type, { spaceAfter: space }).run()
        },
      unsetSpaceAfter:
        () =>
        ({ editor, chain }) => {
          const type = editor.isActive('heading') ? 'heading' : 'paragraph'
          return chain().updateAttributes(type, { spaceAfter: null }).run()
        },
    }
  },
})

export const LINE_HEIGHTS = [
  { label: 'Jednoduché', value: '1.2' },
  { label: '1,15', value: '1.15' },
  { label: '1,5', value: '1.5' },
  { label: 'Dvojité', value: '2' },
] as const

export const PARAGRAPH_SPACING = [
  { label: 'Žiadne', value: '0px' },
  { label: 'Malé (6 px)', value: '6px' },
  { label: 'Stredné (12 px)', value: '12px' },
  { label: 'Veľké (18 px)', value: '18px' },
  { label: 'Extra (24 px)', value: '24px' },
] as const
