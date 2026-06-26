import type { Editor } from '@tiptap/react'

export type ParagraphStyleId = 'title' | 'subtitle' | 'heading' | 'body' | 'caption'

export const PARAGRAPH_STYLES: Array<{
  id: ParagraphStyleId
  label: string
  hint: string
}> = [
  { id: 'title', label: 'Titulok', hint: 'Hlavný názov dokumentu' },
  { id: 'subtitle', label: 'Podtitul', hint: 'Podnadpis alebo perex' },
  { id: 'heading', label: 'Nadpis sekcie', hint: 'Sekčný nadpis' },
  { id: 'body', label: 'Text', hint: 'Bežný odsek' },
  { id: 'caption', label: 'Popisok', hint: 'Malý popis pod obrázkom' },
]

export function applyParagraphStyle(editor: Editor, styleId: ParagraphStyleId) {
  const chain = editor.chain().focus()

  switch (styleId) {
    case 'title':
      chain
        .setHeading({ level: 1 })
        .updateAttributes('heading', { lineHeight: '1.15', spaceAfter: '12px', spaceBefore: '0px' })
        .setFontSize('32px')
        .unsetItalic()
        .run()
      break
    case 'subtitle':
      chain
        .setHeading({ level: 2 })
        .updateAttributes('heading', { lineHeight: '1.25', spaceAfter: '10px', spaceBefore: '0px' })
        .setFontSize('22px')
        .unsetItalic()
        .run()
      break
    case 'heading':
      chain
        .setHeading({ level: 3 })
        .updateAttributes('heading', { lineHeight: '1.3', spaceAfter: '8px', spaceBefore: '12px' })
        .setFontSize('18px')
        .unsetItalic()
        .run()
      break
    case 'body':
      chain
        .setParagraph()
        .updateAttributes('paragraph', { lineHeight: '1.6', spaceAfter: '0px', spaceBefore: '0px' })
        .unsetFontSize()
        .unsetItalic()
        .unsetBold()
        .run()
      break
    case 'caption':
      chain
        .setParagraph()
        .updateAttributes('paragraph', { lineHeight: '1.4', spaceAfter: '0px', spaceBefore: '6px' })
        .setFontSize('12px')
        .setItalic()
        .setTextAlign('center')
        .run()
      break
  }
}
