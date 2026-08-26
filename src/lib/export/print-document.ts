import { tiptapJsonToHtmlAsync, type HtmlExportOptions } from '@/lib/export/html'

const PRINT_FRAME_ID = 'scribe-print-frame'

function getOrCreatePrintFrame(): HTMLIFrameElement {
  let frame = document.getElementById(PRINT_FRAME_ID) as HTMLIFrameElement | null
  if (frame) return frame

  frame = document.createElement('iframe')
  frame.id = PRINT_FRAME_ID
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;'
  document.body.appendChild(frame)
  return frame
}

/**
 * Print HTML without `window.open` — popups are blocked in Tauri / WKWebView,
 * and `noopener` makes `window.open` return null even when a window would open.
 */
export function printDocumentHtml(html: string, title: string): void {
  const frame = getOrCreatePrintFrame()
  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) {
    window.alert('Nepodarilo sa pripraviť tlač. Skúste to znova.')
    return
  }

  doc.open()
  doc.write(html)
  doc.close()
  doc.title = title

  let printed = false
  const triggerPrint = () => {
    if (printed) return
    printed = true
    try {
      win.focus()
      win.print()
    } catch {
      window.alert('Nepodarilo sa spustiť tlač. Skúste to znova.')
    }
  }

  // Images / fonts may still be loading after write().
  frame.onload = () => {
    window.setTimeout(triggerPrint, 50)
  }
  window.setTimeout(triggerPrint, 400)
}

export async function printDocumentFromContent(
  contentJson: string,
  title: string,
  options?: HtmlExportOptions,
): Promise<void> {
  const html = await tiptapJsonToHtmlAsync(contentJson, title, {
    ...options,
    forPrint: true,
  })
  printDocumentHtml(html, title)
}
