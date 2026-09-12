import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

if (!GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl
}

/** One highlight/underline annotation extracted from a PDF. */
export type PdfHighlightAnnotation = {
  page: number
  text: string
  color: string | null
  subtype: string
}

export type PdfHighlightsImport = {
  fileName: string
  pageCount: number
  highlights: PdfHighlightAnnotation[]
}

const HIGHLIGHT_SUBTYPES = new Set(['Highlight', 'Underline', 'Squiggly', 'StrikeOut'])

function rgbaToCss(color: number[] | undefined): string | null {
  if (!color || color.length < 3) return null
  const [r, g, b] = color
  const toByte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)
  if (color.length >= 4) {
    return `rgba(${toByte(r!)}, ${toByte(g!)}, ${toByte(b!)}, ${Math.min(1, Math.max(0, color[3]!)).toFixed(2)})`
  }
  return `rgb(${toByte(r!)}, ${toByte(g!)}, ${toByte(b!)})`
}

function mapToTipTapHighlight(color: string | null): string {
  if (!color) return '#fef08a'
  // Prefer solid hex-ish for TipTap highlight mark.
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return '#fef08a'
  const r = Number(match[1])
  const g = Number(match[2])
  const b = Number(match[3])
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

async function extractTextFromQuadPoints(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof getDocument>['promise']>['getPage']>>,
  quadPoints: number[] | undefined,
): Promise<string> {
  if (!quadPoints || quadPoints.length < 8) return ''
  const textContent = await page.getTextContent()
  const items = textContent.items as Array<{ str?: string; transform?: number[] }>

  // QuadPoints: 8 numbers per quad (x1,y1 ... x4,y4). Use bounding box.
  const boxes: Array<{ xMin: number; yMin: number; xMax: number; yMax: number }> = []
  for (let i = 0; i + 7 < quadPoints.length; i += 8) {
    const xs = [quadPoints[i]!, quadPoints[i + 2]!, quadPoints[i + 4]!, quadPoints[i + 6]!]
    const ys = [quadPoints[i + 1]!, quadPoints[i + 3]!, quadPoints[i + 5]!, quadPoints[i + 7]!]
    boxes.push({
      xMin: Math.min(...xs),
      xMax: Math.max(...xs),
      yMin: Math.min(...ys),
      yMax: Math.max(...ys),
    })
  }

  const parts: string[] = []
  for (const item of items) {
    if (!item.str || !item.transform) continue
    const x = item.transform[4] ?? 0
    const y = item.transform[5] ?? 0
    const inside = boxes.some(
      (box) => x >= box.xMin - 2 && x <= box.xMax + 2 && y >= box.yMin - 2 && y <= box.yMax + 2,
    )
    if (inside) parts.push(item.str)
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** Parse highlight-like annotations from a PDF ArrayBuffer. */
export async function extractPdfHighlights(
  data: ArrayBuffer,
  fileName = 'document.pdf',
): Promise<PdfHighlightsImport> {
  const loadingTask = getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    isEvalSupported: false,
  })

  const pdf = await loadingTask.promise
  const highlights: PdfHighlightAnnotation[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum)
    const annotations = await page.getAnnotations({ intent: 'display' })
    for (const ann of annotations as Array<Record<string, unknown>>) {
      const subtype = String(ann.subtype ?? '')
      if (!HIGHLIGHT_SUBTYPES.has(subtype)) continue

      let text = String(ann.contentsObj && typeof ann.contentsObj === 'object'
        ? (ann.contentsObj as { str?: string }).str ?? ''
        : ann.contents ?? '').trim()

      if (!text) {
        text = await extractTextFromQuadPoints(page, ann.quadPoints as number[] | undefined)
      }
      if (!text) continue

      highlights.push({
        page: pageNum,
        text,
        color: rgbaToCss(ann.color as number[] | undefined),
        subtype,
      })
    }
  }

  return {
    fileName,
    pageCount: pdf.numPages,
    highlights,
  }
}

/** Build TipTap doc JSON from imported PDF highlights. */
export function pdfHighlightsToContentJson(imported: PdfHighlightsImport): Record<string, unknown> {
  const content: unknown[] = [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: `Highlights · ${imported.fileName}` }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `${imported.highlights.length} annotation(s) from ${imported.pageCount} page(s).`,
          marks: [{ type: 'italic' }],
        },
      ],
    },
  ]

  let currentPage = -1
  for (const item of imported.highlights) {
    if (item.page !== currentPage) {
      currentPage = item.page
      content.push({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: `Page ${item.page}` }],
      })
    }
    content.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: item.text,
          marks: [
            {
              type: 'highlight',
              attrs: { color: mapToTipTapHighlight(item.color) },
            },
          ],
        },
      ],
    })
  }

  if (imported.highlights.length === 0) {
    content.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'No highlight/underline annotations found in this PDF.',
          marks: [{ type: 'italic' }],
        },
      ],
    })
  }

  return { type: 'doc', content }
}
