import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

export const PASTE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const

export function getImageOnlyClipboardFiles(data: DataTransfer | null): File[] {
  if (!data) return []

  const html = data.getData('text/html').trim()
  const text = data.getData('text/plain').trim()
  if (html || text) return []

  return Array.from(data.files).filter((file) =>
    PASTE_IMAGE_MIME_TYPES.includes(file.type as (typeof PASTE_IMAGE_MIME_TYPES)[number]),
  )
}

type ClipboardPasteOptions = {
  onInsertImages?: (files: File[]) => void | Promise<void>
}

export const ClipboardPaste = Extension.create<ClipboardPasteOptions>({
  name: 'clipboardPaste',

  addOptions() {
    return {
      onInsertImages: undefined,
    }
  },

  addProseMirrorPlugins() {
    const { onInsertImages } = this.options

    return [
      new Plugin({
        props: {
          handlePaste(_view, event) {
            const files = getImageOnlyClipboardFiles(event.clipboardData)
            if (!files.length || !onInsertImages) return false

            event.preventDefault()
            void onInsertImages(files)
            return true
          },
        },
      }),
    ]
  },
})
