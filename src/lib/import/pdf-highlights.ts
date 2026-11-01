import {
  PdfAnnotationSubtype,
  PdfAnnotationSubtypeName,
  type PdfAnnotationObject,
  type Rect,
} from '@embedpdf/models'
import { getPdfiumEngine } from '@/lib/pdf/pdfium-engine'

/** Pure TipTap helpers stay in sync with `crates/scribe-ui/src/pdf_highlights.rs`. Extraction uses EmbedPDF/PDFium. */

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

const MARKUP_TYPES = new Set<PdfAnnotationSubtype>([
  PdfAnnotationSubtype.HIGHLIGHT,
  PdfAnnotationSubtype.UNDERLINE,
  PdfAnnotationSubtype.SQUIGGLY,
  PdfAnnotationSubtype.STRIKEOUT,
])

function mapToTipTapHighlight(color: string | null): string {
  if (!color) return '#fef08a'
  const hex = color.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase()
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return '#fef08a'
  const r = Number(match[1])
  const g = Number(match[2])
  const b = Number(match[3])
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function rectsOverlap(a: Rect, b: Rect, pad = 2): boolean {
  const ax2 = a.origin.x + a.size.width + pad
  const ay2 = a.origin.y + a.size.height + pad
  const bx2 = b.origin.x + b.size.width + pad
  const by2 = b.origin.y + b.size.height + pad
  return (
    a.origin.x - pad < bx2 &&
    ax2 > b.origin.x - pad &&
    a.origin.y - pad < by2 &&
    ay2 > b.origin.y - pad
  )
}

function annotationColor(ann: PdfAnnotationObject): string | null {
  const stroke = 'strokeColor' in ann ? ann.strokeColor : undefined
  const color = 'color' in ann ? ann.color : undefined
  const value = (typeof stroke === 'string' && stroke) || (typeof color === 'string' && color) || null
  return value
}

function annotationSegmentRects(ann: PdfAnnotationObject): Rect[] {
  if ('segmentRects' in ann && Array.isArray(ann.segmentRects)) {
    return ann.segmentRects as Rect[]
  }
  return ann.rect ? [ann.rect] : []
}

async function textForMarkup(
  engine: Awaited<ReturnType<typeof getPdfiumEngine>>,
  doc: Parameters<typeof engine.getPageTextRects>[0],
  page: Parameters<typeof engine.getPageTextRects>[1],
  ann: PdfAnnotationObject,
): Promise<string> {
  const contents = typeof ann.contents === 'string' ? ann.contents.trim() : ''
  if (contents) return contents

  const segments = annotationSegmentRects(ann)
  if (segments.length === 0) return ''

  const textRects = await engine.getPageTextRects(doc, page).toPromise()
  const parts: string[] = []
  for (const item of textRects) {
    if (!item.content?.trim()) continue
    if (segments.some((seg) => rectsOverlap(item.rect, seg))) {
      parts.push(item.content)
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** Parse highlight-like annotations from a PDF ArrayBuffer via EmbedPDF/PDFium. */
export async function extractPdfHighlights(
  data: ArrayBuffer,
  fileName = 'document.pdf',
): Promise<PdfHighlightsImport> {
  const engine = await getPdfiumEngine()
  const doc = await engine
    .openDocumentBuffer({
      id: `highlights-${fileName}-${Date.now()}`,
      content: data.slice(0),
    })
    .toPromise()

  try {
    const highlights: PdfHighlightAnnotation[] = []
    for (const page of doc.pages) {
      const annotations = await engine.getPageAnnotations(doc, page).toPromise()
      for (const ann of annotations) {
        if (!MARKUP_TYPES.has(ann.type)) continue
        const text = await textForMarkup(engine, doc, page, ann)
        if (!text) continue
        highlights.push({
          page: page.index + 1,
          text,
          color: annotationColor(ann),
          subtype: PdfAnnotationSubtypeName[ann.type] ?? String(ann.type),
        })
      }
    }

    return {
      fileName,
      pageCount: doc.pageCount,
      highlights,
    }
  } finally {
    await engine.closeDocument(doc).toPromise().catch(() => undefined)
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
