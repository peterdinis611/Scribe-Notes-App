import { invoke } from '@tauri-apps/api/core'
import {
  DEFAULT_PAGE_SETUP,
  PAPER_SIZES,
  normalizePageSetup,
  type PageSetup,
} from '@/lib/editor/page-setup'

export type PdfExportOptions = {
  pageSetup?: PageSetup
  title?: string
}

type RenderPdfResult = {
  dataBase64: string
}

function base64ToBlob(dataBase64: string): Blob {
  const bytes = Uint8Array.from(atob(dataBase64), (char) => char.charCodeAt(0))
  return new Blob([bytes], { type: 'application/pdf' })
}

/**
 * Native macOS PDF via WKWebView print engine (no html2pdf / html2canvas).
 * `html` should be built with `forPrint: true` so headers, watermark and
 * `@media print` rules match the system print path.
 */
export async function generatePdfFromHtml(
  html: string,
  options?: PdfExportOptions,
): Promise<{ blob: Blob; dataBase64: string }> {
  const pageSetup = normalizePageSetup(options?.pageSetup ?? DEFAULT_PAGE_SETUP)
  const paper = PAPER_SIZES[pageSetup.paperSize]

  const { dataBase64 } = await invoke<RenderPdfResult>('render_html_to_pdf', {
    input: {
      html,
      paperWidthPx: paper.width,
      paperHeightPx: paper.height,
      marginTopPx: pageSetup.marginTop,
      marginRightPx: pageSetup.marginRight,
      marginBottomPx: pageSetup.marginBottom,
      marginLeftPx: pageSetup.marginLeft,
    },
  })

  return {
    dataBase64,
    blob: base64ToBlob(dataBase64),
  }
}
