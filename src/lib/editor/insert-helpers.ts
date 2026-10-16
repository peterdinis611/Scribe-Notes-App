import type { Editor } from '@tiptap/react'
import { findParentNode } from '@tiptap/core'
import { MATH_JS_EXAMPLES } from '@/lib/editor/math-js'
import {
  D3_CHART_DEFAULT_SOURCE,
  stringifyD3ChartSpec,
  tableMatrixToChartSpec,
  type D3ChartType,
} from '@/lib/editor/d3-chart'
import { MAP_DEFAULT_SOURCE } from '@/lib/editor/map'
import { MERMAID_DEFAULT_SOURCE, MERMAID_TEMPLATES, type MermaidTemplateId } from '@/lib/editor/mermaid'
import { generateLoremIpsum, saveLoremOptions } from '@/lib/editor/lorem-ipsum'
import { promptLoremOptions } from '@/lib/lorem-dialog'
import { promptMathExpressionDialog } from '@/lib/math-dialog'
import { promptChartDialog } from '@/lib/chart-dialog'
import { promptMermaidDialog } from '@/lib/mermaid-dialog'
import { promptInput } from '@/lib/input-dialog'
import i18n from '@/i18n'
import { toast } from '@/lib/toast'

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

export async function insertMermaidDiagram(editor: Editor, templateId?: MermaidTemplateId) {
  const seed =
    templateId && MERMAID_TEMPLATES[templateId]
      ? MERMAID_TEMPLATES[templateId].source
      : MERMAID_DEFAULT_SOURCE
  const result = await promptMermaidDialog({
    intent: 'insert',
    initialSource: seed,
  })
  if (!result || result.clear || !result.source.trim() || editor.isDestroyed) return
  editor.chain().focus().insertMermaidDiagram({ source: result.source.trim() }).run()
}

export async function insertD3Chart(editor: Editor, initialSource?: string) {
  const result = await promptChartDialog({
    intent: 'insert',
    initialSource: initialSource ?? D3_CHART_DEFAULT_SOURCE,
  })
  if (!result || result.clear || !result.source.trim() || editor.isDestroyed) return
  editor.chain().focus().insertD3Chart({ source: result.source.trim() }).run()
}

/** Build a chart from the table under the cursor and open the chart builder. */
export async function insertChartFromTable(editor: Editor, type: D3ChartType = 'bar') {
  if (editor.isDestroyed) return false
  const table = findParentNode((node) => node.type.name === 'table')(editor.state.selection)
  if (!table) {
    toast.info(i18n.t('d3Chart.fromTable.needTable'))
    return false
  }

  const matrix: string[][] = []
  table.node.forEach((rowNode) => {
    if (rowNode.type.name !== 'tableRow') return
    const row: string[] = []
    rowNode.forEach((cellNode) => {
      if (cellNode.type.name !== 'tableCell' && cellNode.type.name !== 'tableHeader') return
      row.push(cellNode.textContent.trim())
    })
    if (row.length > 0) matrix.push(row)
  })

  const parsed = tableMatrixToChartSpec(matrix, type)
  if (!parsed.ok) {
    toast.info(parsed.error)
    return false
  }

  const result = await promptChartDialog({
    intent: 'insert',
    initialSource: stringifyD3ChartSpec(parsed.spec),
  })
  if (!result || result.clear || !result.source.trim() || editor.isDestroyed) return false

  const insertPos = table.pos + table.node.nodeSize
  editor.chain().focus().insertD3Chart({ source: result.source.trim(), pos: insertPos }).run()
  return true
}

export function insertLeafletMap(editor: Editor) {
  editor.chain().focus().insertLeafletMap({ source: MAP_DEFAULT_SOURCE }).run()
}

export function insertEmptyVideoBlock(editor: Editor, pos?: number) {
  editor.chain().focus().insertVideo({ pos, src: null }).run()
}

export async function insertVideo(editor: Editor) {
  if (editor.isDestroyed) return
  const { normalizeVideoSrcAsync } = await import('@/lib/editor/video')
  const url = await promptInput({
    title: i18n.t('toolbar.videoDialog.title'),
    description: i18n.t('toolbar.videoDialog.description'),
    defaultValue: 'https://www.youtube.com/watch?v=',
    placeholder: 'https://www.youtube.com/watch?v=',
    confirmLabel: i18n.t('toolbar.videoDialog.confirm'),
  })
  if (!url?.trim() || editor.isDestroyed) return
  const src = await normalizeVideoSrcAsync(url)
  if (editor.isDestroyed) return
  editor.chain().focus().insertVideo({ src }).run()
}

export async function insertYoutubeVideo(editor: Editor) {
  await insertVideo(editor)
}

/** Opens options dialog, then inserts configured lorem / placeholder text at the cursor. */
export async function insertLoremIpsum(editor: Editor): Promise<boolean> {
  if (editor.isDestroyed) return false
  const options = await promptLoremOptions()
  if (!options || editor.isDestroyed) return false
  const saved = saveLoremOptions(options)

  let text = ''
  if (saved.engine !== 'local') {
    try {
      const { nlpGeneratePlaceholder } = await import('@/lib/db/nlp-api')
      const result = await nlpGeneratePlaceholder({
        unit: saved.unit,
        count: saved.count,
        language: saved.language,
        startWithClassic: saved.startWithLorem,
        preferRust: saved.engine === 'rust',
      })
      text = result.text ?? ''
    } catch {
      text = ''
    }
  }
  if (!text.trim()) {
    text = generateLoremIpsum(saved)
  }
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

/** Insert a library-based continue-writing suggestion at the cursor. */
export async function insertContinuation(
  editor: Editor,
  options?: { excludeDocumentId?: string },
): Promise<boolean> {
  if (editor.isDestroyed) return false

  const { from } = editor.state.selection
  const prefix = editor.state.doc.textBetween(Math.max(0, from - 800), from, '\n', '\n')

  try {
    const { nlpSuggestContinuation } = await import('@/lib/db/nlp-api')
    const result = await nlpSuggestContinuation({
      prefix,
      maxSuggestions: 3,
      maxTokens: 16,
      excludeDocumentId: options?.excludeDocumentId,
    })
    const text = result.suggestions?.[0]?.text?.trim()
    if (!text || editor.isDestroyed) return false
    const needsSpace = prefix.length > 0 && !/\s$/.test(prefix)
    editor
      .chain()
      .focus()
      .insertContent(needsSpace ? ` ${text}` : text)
      .run()
    return true
  } catch {
    return false
  }
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

/** Prompt for text/URL and insert a QR code as a document image. */
export async function insertQrCodeImage(editor: Editor): Promise<boolean> {
  const { store } = await import('@/store/index')
  const documentId = store.getState().documents.activeDocumentId
  if (!documentId) {
    toast.error(i18n.t('toasts.qrNoDocument'))
    return false
  }

  const content = await promptInput({
    title: i18n.t('toolbar.actions.qrCode'),
    description: i18n.t('toolbar.actions.qrCodeHint'),
    placeholder: i18n.t('toolbar.actions.qrCodePlaceholder'),
    confirmLabel: i18n.t('toolbar.actions.qrCodeInsert'),
  })
  if (!content?.trim() || editor.isDestroyed) return false

  try {
    const { generateQrDataUrl } = await import('@/lib/editor/qr-generate')
    const { saveDocumentImage } = await import('@/lib/db/api')
    const dataUrl = await generateQrDataUrl(content)
    const path = await saveDocumentImage(
      documentId,
      `qr-${Date.now()}.png`,
      dataUrl,
    )
    if (editor.isDestroyed) return false
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'image',
        attrs: {
          src: path,
          alt: content.trim().slice(0, 120),
          caption: null,
          width: '280px',
          align: 'center',
        },
      })
      .run()
    return true
  } catch (error) {
    toast.error(i18n.t('toasts.qrGenerateError'), String(error))
    return false
  }
}

export function insertDetailsBlock(editor: Editor) {
  editor.chain().focus().setDetails().run()
}
