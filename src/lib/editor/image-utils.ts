import { convertFileSrc } from '@/lib/tauri'
import type { Editor } from '@tiptap/react'
import { saveDocumentImage } from '@/lib/db/api'

const IMAGE_URL_EXT =
  /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|heic|heif)(?:\?[^#]*)?(?:#.*)?$/i

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function resolveImageSrc(src: string | null | undefined): string {
  if (!src) return ''
  if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
    return src
  }
  if (src.startsWith('asset://') || src.startsWith('file://')) {
    return src
  }
  return convertFileSrc(src)
}

/** Notion-style: bare image URL or known CDN image host. */
export function isLikelyImageUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed)) return false
  try {
    const url = new URL(trimmed)
    if (IMAGE_URL_EXT.test(url.pathname)) return true
    const host = url.hostname.toLowerCase()
    return (
      host.includes('imgur.com') ||
      host.includes('cloudinary.com') ||
      host.includes('unsplash.com') ||
      host.includes('images.unsplash.com') ||
      host.includes('googleusercontent.com') ||
      host.includes('twimg.com') ||
      host.endsWith('notion.so') ||
      host.endsWith('notion.site')
    )
  } catch {
    return false
  }
}

function guessExtension(src: string, mime?: string): string {
  if (mime?.includes('png')) return 'png'
  if (mime?.includes('webp')) return 'webp'
  if (mime?.includes('gif')) return 'gif'
  if (mime?.includes('svg')) return 'svg'
  if (mime?.includes('jpeg') || mime?.includes('jpg')) return 'jpg'
  const match = src.match(/\.(png|jpe?g|gif|webp|svg)(?:\?|$)/i)
  return match?.[1]?.toLowerCase().replace('jpeg', 'jpg') ?? 'png'
}

export function insertEmptyImageBlock(editor: Editor, pos?: number) {
  let chain = editor.chain().focus()
  if (pos !== undefined) {
    chain = chain.setTextSelection(pos)
  }
  chain
    .insertContent({
      type: 'image',
      attrs: {
        src: null,
        alt: null,
        caption: null,
        width: '480px',
        align: 'center',
      },
    })
    .run()
}

export function insertImageFromUrl(editor: Editor, url: string, pos?: number) {
  const src = url.trim()
  if (!src) return false
  let chain = editor.chain().focus()
  if (pos !== undefined) {
    chain = chain.setTextSelection(pos)
  }
  return chain
    .insertContent({
      type: 'image',
      attrs: {
        src,
        alt: null,
        width: '480px',
        align: 'center',
      },
    })
    .run()
}

export async function insertImageFromFile(
  editor: Editor,
  documentId: string,
  file: File,
  pos?: number,
) {
  const base64 = await fileToBase64(file)
  const path = await saveDocumentImage(documentId, file.name, base64)

  let chain = editor.chain().focus()
  if (pos !== undefined) {
    chain = chain.setTextSelection(pos)
  }

  chain
    .insertContent({
      type: 'image',
      attrs: {
        src: path,
        alt: file.name,
        width: '480px',
        align: 'center',
      },
    })
    .run()
}

export async function insertImagesFromFiles(
  editor: Editor,
  documentId: string,
  files: File[],
  pos?: number,
) {
  let insertPos = pos
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    await insertImageFromFile(editor, documentId, file, insertPos)
    if (insertPos !== undefined) {
      insertPos += 1
    }
  }
}

export async function replaceImageFromFile(documentId: string, file: File): Promise<string> {
  const base64 = await fileToBase64(file)
  return saveDocumentImage(documentId, file.name, base64)
}

export async function saveCroppedImage(documentId: string, dataUrl: string): Promise<string> {
  return saveDocumentImage(documentId, `cropped-${Date.now()}.png`, dataUrl)
}

export async function downloadImageSrc(src: string, baseName = 'image'): Promise<void> {
  const resolved = resolveImageSrc(src)
  const response = await fetch(resolved)
  const blob = await response.blob()
  const ext = guessExtension(src, blob.type)
  const safeName = baseName.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'image'
  const objectUrl = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `${safeName}.${ext}`
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function copyImageToClipboard(src: string): Promise<boolean> {
  const resolved = resolveImageSrc(src)
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      await navigator.clipboard.writeText(src)
      return true
    }
    const response = await fetch(resolved)
    const blob = await response.blob()
    const type = blob.type || 'image/png'
    if (!type.startsWith('image/') || type === 'image/svg+xml') {
      await navigator.clipboard.writeText(src)
      return true
    }
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })])
    return true
  } catch {
    try {
      await navigator.clipboard.writeText(src)
      return true
    } catch {
      return false
    }
  }
}

export function pickImageFiles(options?: { multiple?: boolean }): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml'
    input.multiple = options?.multiple ?? true
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.click()
  })
}

export function extractImageFiles(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.files).filter((file) => file.type.startsWith('image/'))
}
