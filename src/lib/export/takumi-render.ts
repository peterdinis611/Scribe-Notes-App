import type { ReactNode } from 'react'
import { invoke } from '@/lib/tauri'
import type { ExportResult } from '@/lib/db/api'

let initPromise: Promise<void> | null = null

async function ensureTakumiReady(): Promise<typeof import('takumi-pdf/no-init')> {
  const mod = await import('takumi-pdf/no-init')
  if (!initPromise) {
    initPromise = (async () => {
      const { default: wasmUrl } = await import('takumi-pdf/wasm-url')
      await mod.default({ module_or_path: wasmUrl })
    })()
  }
  await initPromise
  return mod
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export type TakumiRenderOptions = {
  title?: string
  size?: 'a4' | 'letter'
  /** Outer page margin in CSS px. pdfcn templates usually pad themselves — default 0. */
  margin?: number
}

/** Render a pdfcn/Takumi JSX document to PDF bytes (browser WASM). */
export async function renderTakumiDocument(
  document: ReactNode,
  options?: TakumiRenderOptions,
): Promise<{ bytes: Uint8Array; dataBase64: string }> {
  const { render } = await ensureTakumiReady()
  const bytes = await render(document, {
    size: options?.size ?? 'a4',
    margin: options?.margin ?? 0,
    metadata: options?.title
      ? {
          title: options.title,
          authors: ['Scribe'],
        }
      : undefined,
  })
  return { bytes, dataBase64: bytesToBase64(bytes) }
}

/** Render JSX → PDF and save via the existing Tauri save dialog. */
export async function exportTakumiPdf(
  document: ReactNode,
  title: string,
  options?: Omit<TakumiRenderOptions, 'title'>,
): Promise<ExportResult | null> {
  const { dataBase64 } = await renderTakumiDocument(document, { ...options, title })
  return invoke<ExportResult | null>('export_pdf_bytes', {
    input: { title, dataBase64 },
  })
}
