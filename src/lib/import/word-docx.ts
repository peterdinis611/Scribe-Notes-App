import { invoke } from '@tauri-apps/api/core'
import type { Document } from '@/lib/db/api'
import { createDocument, updateDocument } from '@/lib/db/api'
import { cacheDocument } from '@/lib/cache/document-cache'
import {
  isOleWordDoc,
  isZipArchive,
  readScopedBinaryFile,
} from '@/lib/fs/read-scoped-binary'
import { getImportExtensions } from '@/lib/import/import-extensions'
import {
  createImportImageToken,
  materializeImportImages,
  type PendingImportImage,
} from '@/lib/import/word-images'

const DOCX_EXTENSION = /\.docx$/i
const EMPTY_DOC_JSON = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

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

function normalizeDocJson(json: unknown): string {
  if (!json || typeof json !== 'object') {
    return EMPTY_DOC_JSON
  }

  const doc = json as { type?: string; content?: unknown[] }
  if (doc.type !== 'doc' || !Array.isArray(doc.content) || doc.content.length === 0) {
    return EMPTY_DOC_JSON
  }

  return JSON.stringify(doc)
}

function yieldToMain() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

export async function convertDocxBytesToContentJson(bytes: Uint8Array): Promise<{
  contentJson: string
  html: string
  pendingImages: Map<string, PendingImportImage>
}> {
  const [{ default: mammoth }, { generateJSON }] = await Promise.all([
    import('mammoth'),
    import('@tiptap/html'),
  ])

  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer

  const pendingImages = new Map<string, PendingImportImage>()
  let nextImageIndex = 0

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      ignoreEmptyParagraphs: false,
      convertImage: mammoth.images.imgElement(async (image) => {
        const token = createImportImageToken(nextImageIndex)
        nextImageIndex += 1
        pendingImages.set(token, {
          buffer: await image.read(),
          contentType: image.contentType,
        })
        return { src: token }
      }),
    },
  )

  const html = result.value
  if (!html.trim()) {
    return {
      html: '',
      contentJson: EMPTY_DOC_JSON,
      pendingImages,
    }
  }

  await yieldToMain()

  const extensions = getImportExtensions()
  const doc = generateJSON(`<div class="document-content">${html}</div>`, extensions)

  return {
    html,
    contentJson: normalizeDocJson(doc),
    pendingImages,
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
    const { contentJson, html, pendingImages } = await convertDocxBytesToContentJson(bytes)
    const title = titleFromWordHtml(html, fallbackTitle)

    const created = await createDocument({
      title,
      contentJson,
    })

    if (pendingImages.size === 0) {
      return cacheDocument(created)
    }

    const materialized = await materializeImportImages(
      created.id,
      contentJson,
      pendingImages,
    )

    if (materialized === contentJson) {
      return cacheDocument(created)
    }

    return cacheDocument(
      await updateDocument({
        id: created.id,
        contentJson: materialized,
      }),
    )
  } catch {
    return importLegacyWordViaRust(path)
  }
}
