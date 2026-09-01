function parseRgb(color: string): { r: number; g: number; b: number; a: number } | null {
  const value = color.trim().toLowerCase()
  if (!value) return null

  if (value.startsWith('#')) {
    const hex = value.slice(1)
    if (hex.length === 3) {
      return {
        r: Number.parseInt(hex[0]! + hex[0], 16),
        g: Number.parseInt(hex[1]! + hex[1], 16),
        b: Number.parseInt(hex[2]! + hex[2], 16),
        a: 1,
      }
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
      }
    }
    return null
  }

  const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/)
  if (!rgbMatch) return null

  const parts = rgbMatch[1]!.split(',').map((part) => part.trim())
  if (parts.length < 3) return null

  const r = Number(parts[0])
  const g = Number(parts[1])
  const b = Number(parts[2])
  const a = parts[3] !== undefined ? Number(parts[3]) : 1
  if ([r, g, b, a].some((channel) => Number.isNaN(channel))) return null

  return { r, g, b, a }
}

function relativeLuminance(r: number, g: number, b: number): number {
  const channels = [r, g, b].map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Keep intentional dark colors; lift low-contrast light text saved from dark mode. */
export function colorForExport(color: string, background = '#ffffff'): string {
  const parsed = parseRgb(color)
  if (!parsed || parsed.a < 0.2) return color

  const bg = parseRgb(background) ?? { r: 255, g: 255, b: 255, a: 1 }
  const fgLum = relativeLuminance(parsed.r, parsed.g, parsed.b)
  const bgLum = relativeLuminance(bg.r, bg.g, bg.b)

  if (contrastRatio(fgLum, bgLum) >= 4.5) return color
  if (fgLum > 0.72) return '#111111'
  if (bgLum > fgLum && fgLum > 0.55) return '#111111'
  return color
}
