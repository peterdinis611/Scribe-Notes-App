import mammoth from 'mammoth'
import { generateJSON } from '@tiptap/html'
import type { Document } from '@/lib/db/api'
import { createDocument, readBinaryFile } from '@/lib/db/api'
import { cacheDocument } from '@/lib/cache/document-cache'
import { getEditorExtensions } from '@/lib/editor/extensions'

const DOCX_EXTENSION = /\.docx$/i

export function isWordDocxPath(path: string) {
  return DOCX_EXTENSION.test(path)
}

export function importTitleFromPath(path: string, fallback: string) {
  const fileName = path.split(/[/\\]/).pop() ?? fallback
  const stem = fileName.replace(/\.[^.]+$/, '').trim()
  return stem || fallback
}

function stripHtmlTags(value: string) {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

export function titleFromWordHtml(html: string, fallback: string) {
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  if (heading) {
    const title = stripHtmlTags(heading)
    if (title) return title
  }
  return fallback
}

function bufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!)
  }
  return btoa(binary)
}

function normalizeDocJson(json: unknown): string {
  if (!json || typeof json !== 'object') {
    return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })
  }

  const doc = json as { type?: string; content?: unknown[] }
  if (doc.type !== 'doc' || !Array.isArray(doc.content) || doc.content.length === 0) {
    return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })
  }

  return JSON.stringify(doc)
}

export async function convertDocxBytesToContentJson(bytes: Uint8Array): Promise<{
  contentJson: string
  html: string
}> {
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const imageBuffer = await image.read()
        const base64 = bufferToBase64(imageBuffer)
        return {
          src: `data:${image.contentType};base64,${base64}`,
        }
      }),
    },
  )

  const html = result.value.trim()
  if (!html) {
    return {
      html: '',
      contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
    }
  }

  const extensions = getEditorExtensions({ onInsertImages: () => {} })
  const doc = generateJSON(`<div class="document-content">${html}</div>`, extensions)

  return {
    html,
    contentJson: normalizeDocJson(doc),
  }
}

export async function importWordDocumentFromPath(path: string): Promise<Document> {
  const bytes = new Uint8Array(await readBinaryFile(path))
  const { contentJson, html } = await convertDocxBytesToContentJson(bytes)
  const fallbackTitle = importTitleFromPath(path, 'Import z Wordu')

  const doc = await createDocument({
    title: titleFromWordHtml(html, fallbackTitle),
    contentJson,
  })

  return cacheDocument(doc)
}
