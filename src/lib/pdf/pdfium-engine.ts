import {
  createPdfiumDirectEngine,
  type PdfEngine,
} from '@embedpdf/engines/pdfium'
import pdfiumWasmUrl from '@embedpdf/pdfium/pdfium.wasm?url'

let enginePromise: Promise<PdfEngine<Blob>> | null = null

/** Shared main-thread PDFium engine (local WASM — works offline in Tauri). */
export function getPdfiumEngine(): Promise<PdfEngine<Blob>> {
  if (!enginePromise) {
    enginePromise = createPdfiumDirectEngine(pdfiumWasmUrl, {
      fontFallback: null,
    }).catch((error: unknown) => {
      enginePromise = null
      throw error
    })
  }
  return enginePromise
}

/** Bundled WASM URL for `@embedpdf/react-pdf-viewer` (avoid CDN in desktop). */
export function getPdfiumWasmUrl(): string {
  return pdfiumWasmUrl
}
