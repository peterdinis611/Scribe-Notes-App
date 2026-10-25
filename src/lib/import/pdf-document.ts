import { getDocument } from 'pdfjs-dist'
import { ensurePdfjsWorker } from '@/lib/pdf/pdfjs-worker'
import { readScopedBinaryFile } from '@/lib/fs/read-scoped-binary'
import { importTitleFromPath } from '@/lib/import/import-path'
import { assertImportAllowedByAntivirus } from '@/lib/antivirus/scan-import'

ensurePdfjsWorker()

const MAX_PAGES = 80
const MAX_CHARS = 400_000
const EMPTY_DOC_JSON = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

export function isPdfPath(path: string) {
  return /\.pdf$/i.test(path)
}

type TipTapNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
  text?: string
}

function paragraphNode(text: string): TipTapNode {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (!trimmed) return { type: 'paragraph' }
  return {
    type: 'paragraph',
    content: [{ type: 'text', text: trimmed }],
  }
}

function headingNode(level: number, text: string): TipTapNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  }
}

/** Extract plain text from a PDF into TipTap JSON (lossy). */
export async function convertPdfBytesToContentJson(bytes: Uint8Array): Promise<string> {
  const loadingTask = getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
    isEvalSupported: false,
  })
  const pdf = await loadingTask.promise
  const pageCount = Math.min(pdf.numPages, MAX_PAGES)
  const content: TipTapNode[] = []
  let totalChars = 0

  for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
    if (totalChars >= MAX_CHARS) break
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()
    const parts: string[] = []
    for (const item of textContent.items as Array<{ str?: string }>) {
      if (item.str) parts.push(item.str)
    }
    const pageText = parts.join(' ').replace(/\s+/g, ' ').trim()
    if (!pageText) continue

    if (pageCount > 1) {
      content.push(headingNode(2, `Page ${pageNum}`))
    }

    // Split on sentence-ish gaps into short paragraphs.
    const chunks = pageText.split(/(?<=[.!?])\s+(?=[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ])/)
    for (const chunk of chunks) {
      if (totalChars >= MAX_CHARS) break
      const slice = chunk.slice(0, MAX_CHARS - totalChars)
      totalChars += slice.length
      content.push(paragraphNode(slice))
    }
  }

  if (content.length === 0) return EMPTY_DOC_JSON
  return JSON.stringify({ type: 'doc', content })
}

export async function importPdfDocumentFromPath(path: string) {
  await assertImportAllowedByAntivirus(path)
  const bytes = await readScopedBinaryFile(path)
  if (bytes.length === 0) {
    throw new Error('PDF súbor sa nepodarilo prečítať alebo je prázdny.')
  }
  if (bytes.byteLength > 40 * 1024 * 1024) {
    throw new Error('PDF je príliš veľký (max 40 MB).')
  }

  const [{ createDocument }, { cacheDocument }] = await Promise.all([
    import('@/lib/db/api'),
    import('@/lib/cache/document-cache'),
  ])

  const contentJson = await convertPdfBytesToContentJson(bytes)
  const created = await createDocument({
    title: importTitleFromPath(path, 'Import z PDF'),
    contentJson,
  })
  return cacheDocument(created)
}
