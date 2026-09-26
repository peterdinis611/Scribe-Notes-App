import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { invoke } from '@tauri-apps/api/core'
import { isLikelyAnimatedImageFile } from '@/lib/editor/animated-image'
import {
  extractSvgMarkup,
  isDocumentMediaFile,
  isLikelyImageUrl,
  svgMarkupToFile,
} from '@/lib/editor/image-utils'
import { isMapUrl, specFromMapUrl } from '@/lib/editor/map'
import { isVideoUrl } from '@/lib/editor/video'

export const PASTE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/apng',
  'image/svg+xml',
] as const

/** Detect Word / Office / Google Docs / Pages clipboard noise (mirrors Rust). */
export function looksLikeDirtyHtml(html: string): boolean {
  const lower = html.toLowerCase()
  return (
    lower.includes('mso-') ||
    lower.includes('xmlns:o') ||
    lower.includes('xmlns:w') ||
    lower.includes('urn:schemas-microsoft') ||
    lower.includes('docs-internal-guid') ||
    lower.includes('apple-converted-space') ||
    lower.includes('<o:p') ||
    lower.includes('class="msonormal') ||
    (lower.includes('<span') && lower.includes('style=')) ||
    lower.includes('<font ')
  )
}

export type NormalizeClipboardHtmlResult = {
  html: string
  changed: boolean
  source: string
  strippedTags: number
}

/** Clean clipboard HTML via Rust (Word / Pages / web junk → TipTap-friendly). */
export async function normalizeClipboardHtml(
  html: string,
): Promise<NormalizeClipboardHtmlResult> {
  return invoke<NormalizeClipboardHtmlResult>('normalize_clipboard_html', {
    input: { html },
  })
}

export function getImageOnlyClipboardFiles(data: DataTransfer | null): File[] {
  if (!data) return []

  const files = Array.from(data.files).filter((file) => isDocumentMediaFile(file))
  if (!files.length) return []

  const html = data.getData('text/html').trim()
  const text = data.getData('text/plain').trim()
  // Browsers often attach HTML alongside a GIF file. Prefer the file so frames stay intact.
  if ((html || text) && !files.some(isLikelyAnimatedImageFile)) return []

  return files
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
  onDropImages?: (files: File[], pos?: number) => void | Promise<void>
}

export const ClipboardPaste = Extension.create<ClipboardPasteOptions>({
  name: 'clipboardPaste',

  addOptions() {
    return {
      onInsertImages: undefined,
      onDropImages: undefined,
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDrop: (view, event) => {
            if (!this.options.onDropImages) return false
            if (event.dataTransfer?.types.includes('application/x-prosemirror-slice')) {
              return false
            }
            const files = Array.from(event.dataTransfer?.files ?? []).filter(isDocumentMediaFile)
            if (!files.length) return false

            const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY })
            event.preventDefault()
            event.stopPropagation()
            void this.options.onDropImages(files, dropPos?.pos)
            return true
          },
          handlePaste: (_view, event) => {
            const files = getImageOnlyClipboardFiles(event.clipboardData)
            if (files.length && this.options.onInsertImages) {
              event.preventDefault()
              void this.options.onInsertImages(files)
              return true
            }

            const text = (event.clipboardData?.getData('text/plain') ?? '').trim()
            const html = (event.clipboardData?.getData('text/html') ?? '').trim()
            const svgMarkup = extractSvgMarkup(text, html)
            if (svgMarkup && this.options.onInsertImages) {
              event.preventDefault()
              void this.options.onInsertImages([svgMarkupToFile(svgMarkup)])
              return true
            }

            if (text && isLikelyImageUrl(text) && this.editor) {
              event.preventDefault()
              this.editor
                .chain()
                .focus()
                .insertContent({
                  type: 'image',
                  attrs: {
                    src: text,
                    width: '480px',
                    align: 'center',
                  },
                })
                .run()
              return true
            }

            if (text && isVideoUrl(text) && this.editor) {
              event.preventDefault()
              this.editor.chain().focus().insertVideo({ src: text }).run()
              return true
            }

            if (text && isMapUrl(text) && this.editor) {
              const spec = specFromMapUrl(text)
              event.preventDefault()
              this.editor
                .chain()
                .focus()
                .insertLeafletMap({ source: spec ? JSON.stringify(spec, null, 2) : text })
                .run()
              return true
            }

            const grid = parseTsvTable(text)
            if (grid && this.editor) {
              event.preventDefault()
              this.editor.chain().focus().insertContent(tsvGridToTableHtml(grid)).run()
              return true
            }

            if (html && looksLikeDirtyHtml(html) && this.editor) {
              const editor = this.editor
              event.preventDefault()
              void (async () => {
                let cleaned = html
                try {
                  const result = await normalizeClipboardHtml(html)
                  if (result.html?.trim()) cleaned = result.html
                } catch {
                  // Fall back to original HTML if Rust IPC fails.
                }
                if (editor.isDestroyed) return
                editor.chain().focus().insertContent(cleaned).run()
              })()
              return true
            }

            return false
          },
        },
      }),
    ]
  },
})
