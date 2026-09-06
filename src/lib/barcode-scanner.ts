/** Barcode / QR scanning via @tauri-apps/plugin-barcode-scanner (Android + iOS). */

import { Format, type Scanned } from '@tauri-apps/plugin-barcode-scanner'
import { isTauriRuntime } from '@/lib/tauri'

export type ScannedBarcode = {
  content: string
  format: string | null
}

const DEFAULT_FORMATS = [Format.QRCode, Format.EAN13, Format.Code128, Format.DataMatrix]

export function isBarcodeScannerSupported(): boolean {
  if (!isTauriRuntime()) return false
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  return (
    /android|iphone|ipad|ipod/.test(ua) ||
    (ua.includes('tauri') && /mobile|android|iphone|ipad/.test(ua))
  )
}

export async function scanBarcode(options?: {
  formats?: Format[]
  windowed?: boolean
}): Promise<ScannedBarcode | null> {
  if (!isTauriRuntime()) {
    throw new Error('Barcode scanner requires the Scribe app (Tauri).')
  }

  const {
    scan,
    cancel,
    checkPermissions,
    requestPermissions,
  } = await import('@tauri-apps/plugin-barcode-scanner')

  let permission = await checkPermissions()
  if (permission !== 'granted' && permission !== 'denied') {
    permission = await requestPermissions()
  }
  if (permission !== 'granted') {
    throw new Error('Camera permission is required to scan barcodes.')
  }

  try {
    const result: Scanned = await scan({
      windowed: options?.windowed ?? false,
      formats: options?.formats ?? DEFAULT_FORMATS,
    })
    const content = (result.content ?? '').trim()
    if (!content) return null
    return {
      content,
      format: result.format != null ? String(result.format) : null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/cancel/i.test(message)) {
      try {
        await cancel()
      } catch {
        /* ignore */
      }
      return null
    }
    throw error
  }
}

export { Format }
