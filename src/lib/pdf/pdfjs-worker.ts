import { GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/** Ensure pdf.js worker is configured once (shared by import + preview). */
export function ensurePdfjsWorker(): void {
  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  }
}
