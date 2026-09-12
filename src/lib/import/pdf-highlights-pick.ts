import { open } from '@tauri-apps/plugin-dialog'
import { cacheDocument } from '@/lib/cache/document-cache'
import { createDocument, readBinaryFile, type Document } from '@/lib/db/api'
import {
  extractPdfHighlights,
  pdfHighlightsToContentJson,
} from '@/lib/import/pdf-highlights'

function titleFromPdfPath(path: string) {
  const fileName = path.split(/[/\\]/).pop() ?? 'PDF highlights'
  return fileName.replace(/\.pdf$/i, '').trim() || 'PDF highlights'
}

/** Pick a PDF and create a note from its highlight/underline annotations. */
export async function pickAndImportPdfHighlights(): Promise<{
  document: Document
  highlightCount: number
} | null> {
  const selected = await open({
    multiple: false,
    title: 'Import PDF highlights',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    fileAccessMode: 'scoped',
  })

  if (!selected || Array.isArray(selected)) return null

  const bytes = await readBinaryFile(selected)
  const uint8 = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes)
  const buffer = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as ArrayBuffer
  const fileName = selected.split(/[/\\]/).pop() ?? 'document.pdf'
  const imported = await extractPdfHighlights(buffer, fileName)
  const contentJson = JSON.stringify(pdfHighlightsToContentJson(imported))
  const doc = await createDocument({
    title: `${titleFromPdfPath(selected)} · highlights`,
    contentJson,
  })
  return {
    document: cacheDocument(doc),
    highlightCount: imported.highlights.length,
  }
}
