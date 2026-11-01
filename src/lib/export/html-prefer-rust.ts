import { renderDocumentHtml, renderTiptapHtml } from '@/lib/db/api'
import { tiptapJsonToHtmlAsync, type HtmlExportOptions } from '@/lib/export/html'
import { isTauriRuntime } from '@/lib/tauri'

/** TipTap node types that still need the browser/TS serializer (Mermaid, media, …). */
const JS_RICH_NODE_TYPES = new Set([
  'mermaidDiagram',
  'd3Chart',
  'youtube',
  'video',
  'leafletMap',
  'lottieAnimation',
  'model3d',
  'paintPad',
  'mathBlock',
  'mathInline',
  'image',
])

function walkHasJsRich(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const record = node as { type?: string; content?: unknown[] }
  if (record.type && JS_RICH_NODE_TYPES.has(record.type)) return true
  if (!Array.isArray(record.content)) return false
  return record.content.some(walkHasJsRich)
}

/** True when export/preview should stay on the TypeScript HTML path. */
export function contentNeedsJsRichExport(contentJson: string): boolean {
  try {
    const doc = JSON.parse(contentJson) as unknown
    return walkHasJsRich(doc)
  } catch {
    return true
  }
}

type PreferRustArgs = {
  contentJson: string
  title: string
  options?: HtmlExportOptions
  /** When set, prefer DB-backed `render_document_html` (same TipTap as disk). */
  documentId?: string | null
}

/**
 * Prefer Rust structural HTML (`render_tiptap_html` / `render_document_html`) for
 * plain notes. Rich embeds fall back to `tiptapJsonToHtmlAsync`.
 */
export async function tiptapJsonToHtmlPreferRust({
  contentJson,
  title,
  options,
  documentId,
}: PreferRustArgs): Promise<string> {
  const includeTitle = options?.includeTitleHeading !== false

  if (isTauriRuntime() && !contentNeedsJsRichExport(contentJson)) {
    try {
      if (documentId?.trim()) {
        return await renderDocumentHtml(documentId.trim(), includeTitle)
      }
      return await renderTiptapHtml(contentJson, title, includeTitle)
    } catch {
      /* fall through to TS serializer */
    }
  }

  return tiptapJsonToHtmlAsync(contentJson, title, options)
}
