/** GIF87a / GIF89a and other animated raster formats. */

export type AnimatedImageKind = 'gif' | 'webp' | 'apng'

const GIF_EXT = /\.gif(?:$|[?#])/i
const APNG_EXT = /\.apng(?:$|[?#])/i
const WEBP_EXT = /\.webp(?:$|[?#])/i

export function mimeForAnimatedKind(kind: AnimatedImageKind): string {
  if (kind === 'gif') return 'image/gif'
  if (kind === 'apng') return 'image/png'
  return 'image/webp'
}

export function guessAnimatedKindFromSrc(src: string | null | undefined): AnimatedImageKind | null {
  if (!src) return null
  const trimmed = src.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:image/gif')) return 'gif'
  if (trimmed.startsWith('data:image/apng')) return 'apng'
  if (GIF_EXT.test(trimmed)) return 'gif'
  if (APNG_EXT.test(trimmed)) return 'apng'
  return null
}

export function isLikelyAnimatedImageSrc(src: string | null | undefined): boolean {
  return guessAnimatedKindFromSrc(src) !== null
}

export function isLikelyAnimatedImageFile(file: File): boolean {
  if (file.type === 'image/gif' || file.type === 'image/apng') return true
  const name = file.name.toLowerCase()
  return name.endsWith('.gif') || name.endsWith('.apng')
}

export function sniffAnimatedImageKind(bytes: Uint8Array): AnimatedImageKind | null {
  if (looksLikeGif(bytes)) return 'gif'
  if (looksLikeAnimatedWebp(bytes)) return 'webp'
  if (looksLikeApng(bytes)) return 'apng'
  return null
}

export function looksLikeGif(bytes: Uint8Array): boolean {
  if (bytes.length < 6) return false
  const header = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!, bytes[5]!)
  return header === 'GIF87a' || header === 'GIF89a'
}

export function looksLikeAnimatedWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false
  if (bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) return false
  if (bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50) return false

  let offset = 12
  while (offset + 8 <= bytes.length) {
    const tag = String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!)
    const size =
      bytes[offset + 4]! |
      (bytes[offset + 5]! << 8) |
      (bytes[offset + 6]! << 16) |
      (bytes[offset + 7]! << 24)
    if (tag === 'ANIM') return true
    if (tag === 'VP8X' && offset + 9 <= bytes.length && (bytes[offset + 8]! & 0x02) !== 0) {
      return true
    }
    const chunk = 8 + size + (size % 2)
    if (chunk <= 0) break
    offset += chunk
  }
  return false
}

export function looksLikeApng(bytes: Uint8Array): boolean {
  if (bytes.length < 24) return false
  const png =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  if (!png) return false

  let offset = 8
  while (offset + 12 <= bytes.length) {
    const size =
      (bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    )
    if (type === 'acTL') return true
    if (type === 'IDAT' || type === 'IEND') return false
    const chunk = 12 + size
    if (chunk <= 0) break
    offset += chunk
  }
  return false
}

/** Keep a .gif extension so WKWebView / asset protocol serve `image/gif`. */
export function fileNameForDocumentImage(file: File, sniffed?: AnimatedImageKind | null): string {
  const raw = file.name.trim() || `image-${Date.now()}`
  const kind =
    sniffed ??
    (file.type === 'image/gif' || raw.toLowerCase().endsWith('.gif')
      ? 'gif'
      : file.type === 'image/apng' || raw.toLowerCase().endsWith('.apng')
        ? 'apng'
        : null)
  if (kind === 'gif' && !raw.toLowerCase().endsWith('.gif')) {
    return `${stripExtension(raw)}.gif`
  }
  if (kind === 'apng' && !/\.(?:png|apng)$/i.test(raw)) {
    return `${stripExtension(raw)}.png`
  }
  return raw
}

function stripExtension(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').trim()
  return base || 'image'
}
