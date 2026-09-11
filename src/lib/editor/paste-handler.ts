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

/** Parse Excel / Sheets / TSV clipboard into a rectangular grid. */
export function parseTsvTable(text: string): string[][] | null {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd()
  if (!normalized.includes('\t')) return null

  const rows = normalized
    .split('\n')
    .map((line) => line.split('\t').map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0))

  if (rows.length < 1) return null
  if (rows.length === 1 && rows[0].length < 2) return null

  const cols = Math.max(...rows.map((row) => row.length))
  if (cols < 2 && rows.length < 2) return null

  return rows.map((row) => {
    const next = [...row]
    while (next.length < cols) next.push('')
    return next
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function tsvGridToTableHtml(grid: string[][]): string {
  const withHeader = grid.length > 1
  const header = withHeader ? grid[0] : null
  const body = withHeader ? grid.slice(1) : grid
  const thead = header
    ? `<thead><tr>${header.map((cell) => `<th><p>${escapeHtml(cell)}</p></th>`).join('')}</tr></thead>`
    : ''
  const tbody = `<tbody>${body
    .map((row) => `<tr>${row.map((cell) => `<td><p>${escapeHtml(cell)}</p></td>`).join('')}</tr>`)
    .join('')}</tbody>`
  return `<table>${thead}${tbody}</table>`
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
    const extension = this

    return [
      new Plugin({
        props: {
          handlePaste(_view, event) {
            const files = getImageOnlyClipboardFiles(event.clipboardData)
            if (files.length && extension.options.onInsertImages) {
              event.preventDefault()
              void extension.options.onInsertImages(files)
              return true
            }

            const text = event.clipboardData?.getData('text/plain') ?? ''
            const grid = parseTsvTable(text)
            if (!grid || !extension.editor) return false

            event.preventDefault()
            extension.editor.chain().focus().insertContent(tsvGridToTableHtml(grid)).run()
            return true
          },
        },
      }),
    ]
  },
})
