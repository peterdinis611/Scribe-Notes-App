import { getImportExtensions } from '@/lib/import/import-extensions'

export const EMPTY_DOC_JSON = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

function stripHtmlTags(value: string) {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

export function titleFromHtml(html: string, fallback: string) {
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  if (heading) {
    const title = stripHtmlTags(heading)
    if (title) return title
  }
  return fallback
}

export function normalizeDocJson(json: unknown): string {
  if (!json || typeof json !== 'object') {
    return EMPTY_DOC_JSON
  }

  const doc = json as { type?: string; content?: unknown[] }
  if (doc.type !== 'doc' || !Array.isArray(doc.content) || doc.content.length === 0) {
    return EMPTY_DOC_JSON
  }

  return JSON.stringify(doc)
}

export function plainTextToContentJson(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) {
    return EMPTY_DOC_JSON
  }

  return JSON.stringify({
    type: 'doc',
    content: paragraphs.map((paragraph) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: paragraph }],
    })),
  })
}

function yieldToMain() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

export async function convertHtmlToContentJson(html: string): Promise<string> {
  const trimmed = html.trim()
  if (!trimmed) return EMPTY_DOC_JSON

  const { generateJSON } = await import('@tiptap/html')
  await yieldToMain()

  const extensions = getImportExtensions()
  const doc = generateJSON(`<div class="document-content">${trimmed}</div>`, extensions)
  return normalizeDocJson(doc)
}
