/** Generate a QR code PNG data URL for embedding in notes. */
import QRCode from 'qrcode'

export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

export type QrGenerateOptions = {
  /** Pixel size of the square canvas (default 512). */
  width?: number
  margin?: number
  dark?: string
  light?: string
  errorCorrectionLevel?: QrErrorCorrectionLevel
}

export async function generateQrDataUrl(
  content: string,
  options: QrGenerateOptions = {},
): Promise<string> {
  const text = content.trim()
  if (!text) {
    throw new Error('QR content is empty')
  }
  if (text.length > 2000) {
    throw new Error('QR content is too long (max 2000 characters)')
  }
  const ecl = options.errorCorrectionLevel ?? 'M'
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: ecl,
    margin: options.margin ?? 2,
    width: options.width ?? 512,
    color: {
      dark: options.dark ?? '#0c0a09',
      light: options.light ?? '#ffffff',
    },
  })
}
