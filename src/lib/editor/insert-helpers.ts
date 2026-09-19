import type { Editor } from '@tiptap/react'
import { MATH_JS_EXAMPLES } from '@/lib/editor/math-js'
import { D3_CHART_DEFAULT_SOURCE } from '@/lib/editor/d3-chart'
import { MERMAID_DEFAULT_SOURCE } from '@/lib/editor/mermaid'
import { generateLoremIpsum, saveLoremOptions } from '@/lib/editor/lorem-ipsum'
import { promptLoremOptions } from '@/lib/lorem-dialog'
import { promptMathExpressionDialog } from '@/lib/math-dialog'
import { promptInput } from '@/lib/input-dialog'
import i18n from '@/i18n'

export async function insertInlineMath(editor: Editor) {
  const result = await promptMathExpressionDialog({
    mode: 'inline',
    intent: 'insert',
    initialExpression: MATH_JS_EXAMPLES.inline,
  })
  if (!result || result.clear || !result.expression || editor.isDestroyed) return
  editor.chain().focus().insertMathInline({ expression: result.expression }).run()
}

export async function insertBlockMath(editor: Editor) {
  const result = await promptMathExpressionDialog({
    mode: 'block',
    intent: 'insert',
    initialExpression: MATH_JS_EXAMPLES.block,
  })
  if (!result || result.clear || !result.expression || editor.isDestroyed) return
  editor.chain().focus().insertMathBlock({ expression: result.expression }).run()
}

export function insertMermaidDiagram(editor: Editor) {
  editor.chain().focus().insertMermaidDiagram({ source: MERMAID_DEFAULT_SOURCE }).run()
}

export function insertD3Chart(editor: Editor) {
  editor.chain().focus().insertD3Chart({ source: D3_CHART_DEFAULT_SOURCE }).run()
}

export async function insertYoutubeVideo(editor: Editor) {
  if (editor.isDestroyed) return
  const url = await promptInput({
    title: i18n.t('toolbar.youtubeDialog.title'),
    description: i18n.t('toolbar.youtubeDialog.description'),
    defaultValue: 'https://www.youtube.com/watch?v=',
    placeholder: 'https://www.youtube.com/watch?v=',
    confirmLabel: i18n.t('toolbar.youtubeDialog.confirm'),
  })
  if (!url?.trim() || editor.isDestroyed) return
  editor.chain().focus().setYoutubeVideo({ src: url.trim() }).run()
}

/** Opens options dialog, then inserts configured lorem ipsum at the cursor. */
export async function insertLoremIpsum(editor: Editor): Promise<boolean> {
  if (editor.isDestroyed) return false
  const options = await promptLoremOptions()
  if (!options || editor.isDestroyed) return false
  const saved = saveLoremOptions(options)
  const text = generateLoremIpsum(saved)
  if (!text.trim()) return false

  const blocks = text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({
      type: 'paragraph' as const,
      content: [{ type: 'text' as const, text: block }],
    }))

  if (blocks.length === 0) return false
  editor.chain().focus().insertContent(blocks).run()
  return true
}

export async function insertScannedBarcode(editor: Editor): Promise<boolean> {
  const { scanBarcode } = await import('@/lib/barcode-scanner')
  const scanned = await scanBarcode()
  if (!scanned?.content) return false

  const content = scanned.content
  const looksLikeUrl = /^https?:\/\//i.test(content)
  if (looksLikeUrl) {
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'text',
        text: content,
        marks: [{ type: 'link', attrs: { href: content, target: '_blank' } }],
      })
      .run()
  } else {
    editor.chain().focus().insertContent(content).run()
  }
  return true
}

export function insertDetailsBlock(editor: Editor) {
  editor.chain().focus().setDetails().run()
}
