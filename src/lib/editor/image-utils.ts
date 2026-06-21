import { convertFileSrc } from '@tauri-apps/api/core'
import type { Editor } from '@tiptap/react'
import { saveDocumentImage } from '@/lib/db/api'

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

export function pickImageFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml'
    input.multiple = true
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.click()
  })
}

export function extractImageFiles(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.files).filter((file) => file.type.startsWith('image/'))
}
