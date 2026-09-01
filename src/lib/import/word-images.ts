import type { JSONContent } from '@tiptap/core'
import { saveDocumentImage } from '@/lib/db/api'

const IMAGE_TOKEN_PREFIX = 'scribe-import-img://'

export type PendingImportImage = {
  buffer: ArrayBuffer
  contentType: string
}

export function createImportImageToken(index: number) {
  return `${IMAGE_TOKEN_PREFIX}${index}`
}

export function isImportImageToken(src: string | null | undefined) {
  return typeof src === 'string' && src.startsWith(IMAGE_TOKEN_PREFIX)
}

export function mimeToExtension(contentType: string) {
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('gif')) return 'gif'
  if (contentType.includes('svg')) return 'svg'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  return 'png'
}

export function bufferToDataUrl(contentType: string, buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return `data:${contentType};base64,${btoa(binary)}`
}

const IMAGE_SAVE_BATCH = 4

export async function materializeImportImages(
  documentId: string,
  contentJson: string,
  pendingImages: Map<string, PendingImportImage>,
): Promise<string> {
  if (pendingImages.size === 0) return contentJson

  const replacements = new Map<string, string>()
  const entries = [...pendingImages.entries()]

  for (let offset = 0; offset < entries.length; offset += IMAGE_SAVE_BATCH) {
    const batch = entries.slice(offset, offset + IMAGE_SAVE_BATCH)
    await Promise.all(
      batch.map(async ([token, image], batchIndex) => {
        const ext = mimeToExtension(image.contentType)
        const dataUrl = bufferToDataUrl(image.contentType, image.buffer)
        const path = await saveDocumentImage(
          documentId,
          `word-import-${offset + batchIndex}.${ext}`,
          dataUrl,
        )
        replacements.set(token, path)
      }),
    )
  }

  let doc: JSONContent
  try {
    doc = JSON.parse(contentJson) as JSONContent
  } catch {
    return contentJson
  }

  let changed = false

  const visit = (node: JSONContent) => {
    if (
      node.type === 'image' &&
      typeof node.attrs?.src === 'string' &&
      replacements.has(node.attrs.src)
    ) {
      node.attrs = {
        ...node.attrs,
        src: replacements.get(node.attrs.src),
        width: node.attrs.width ?? '480px',
        align: node.attrs.align ?? 'center',
      }
      changed = true
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) visit(child)
    }
  }

  visit(doc)
  return changed ? JSON.stringify(doc) : contentJson
}
