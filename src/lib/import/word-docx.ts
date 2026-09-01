import mammoth from 'mammoth'
import { generateJSON } from '@tiptap/html'
import { invoke } from '@tauri-apps/api/core'
import type { Document } from '@/lib/db/api'
import { createDocument } from '@/lib/db/api'
import { cacheDocument } from '@/lib/cache/document-cache'
import { getEditorExtensions } from '@/lib/editor/extensions'
import {
  isOleWordDoc,
  isZipArchive,
  readScopedBinaryFile,
} from '@/lib/fs/read-scoped-binary'

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
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer

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

async function importLegacyWordViaRust(path: string): Promise<Document> {
  return cacheDocument(await invoke<Document>('import_file', { path }))
}

export async function importWordDocumentFromPath(path: string): Promise<Document> {
  const bytes = await readScopedBinaryFile(path)

  if (bytes.length === 0) {
    throw new Error('Súbor sa nepodarilo prečítať alebo je prázdny.')
  }

  if (isOleWordDoc(bytes)) {
    throw new Error(
      'Toto je starý formát Word (.doc). Uložte ho v Microsoft Word ako .docx a skúste znova.',
    )
  }

  if (!isZipArchive(bytes)) {
    throw new Error(
      'Súbor nie je platný dokument Word (.docx). Otvorte ho vo Worde a uložte ako .docx.',
    )
  }

  const fallbackTitle = importTitleFromPath(path, 'Import z Wordu')

  try {
    const { contentJson, html } = await convertDocxBytesToContentJson(bytes)
    const doc = await createDocument({
      title: titleFromWordHtml(html, fallbackTitle),
      contentJson,
    })
    return cacheDocument(doc)
  } catch {
    return importLegacyWordViaRust(path)
  }
}
