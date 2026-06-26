import type { ThemeColors } from '@/lib/themes/types'

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp(s, 0, 100) / 100
  const light = clamp(l, 0, 100) / 100

  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = light - c / 2

  let r = 0
  let g = 0
  let b = 0

  if (hue < 60) [r, g, b] = [c, x, 0]
  else if (hue < 120) [r, g, b] = [x, c, 0]
  else if (hue < 180) [r, g, b] = [0, c, x]
  else if (hue < 240) [r, g, b] = [0, x, c]
  else if (hue < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized.slice(0, 6)

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

function rgbaFromHex(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`
}

function mixHex(base: string, accent: string, amount: number) {
  const a = hexToRgb(base)
  const b = hexToRgb(accent)
  const ratio = clamp(amount, 0, 1)
  const mix = (from: number, to: number) => Math.round(from + (to - from) * ratio)
  return `#${[mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b)]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

function shiftLightness(hex: string, delta: number) {
  const { r, g, b } = hexToRgb(hex)
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r / 255:
        h = ((g - b) / 255 / d + (g < b ? 6 : 0)) * 60
        break
      case g / 255:
        h = ((b - r) / 255 / d + 2) * 60
        break
      default:
        h = ((r - g) / 255 / d + 4) * 60
    }
  }

  return hslToHex(h, s * 100, clamp(l * 100 + delta, 0, 100))
}

export function generateRandomTheme(options?: { colorScheme?: 'light' | 'dark' }): ThemeColors {
  const isDark = options?.colorScheme ?? Math.random() < 0.52
  const hue = Math.floor(Math.random() * 360)
  const tintHue = hue + randomBetween(-18, 18)

  const accentSat = randomBetween(58, 88)
  const accentLight = isDark ? randomBetween(54, 70) : randomBetween(36, 52)
  const selectionStrong = hslToHex(hue, accentSat, accentLight)
  const selection = rgbaFromHex(selectionStrong, isDark ? randomBetween(0.18, 0.26) : randomBetween(0.12, 0.2))

  const destructiveHue = randomBetween(0, 18)
  const destructive = hslToHex(destructiveHue, randomBetween(78, 92), isDark ? randomBetween(58, 66) : randomBetween(48, 56))

  if (isDark) {
    const background = hslToHex(tintHue, randomBetween(10, 24), randomBetween(8, 14))
    const foreground = hslToHex(tintHue, randomBetween(8, 18), randomBetween(90, 96))
    const mutedForeground = hslToHex(tintHue, randomBetween(6, 14), randomBetween(58, 68))
    const sidebarSolid = shiftLightness(background, randomBetween(3, 7))
    const toolbar = shiftLightness(background, randomBetween(-2, 2))
    const formatBar = shiftLightness(sidebarSolid, randomBetween(2, 5))
    const foregroundRgb = hexToRgb(foreground)

    return {
      background,
      foreground,
      mutedForeground,
      border: `rgba(${foregroundRgb.r}, ${foregroundRgb.g}, ${foregroundRgb.b}, 0.1)`,
      sidebar: rgbaFromHex(sidebarSolid, 0.88),
      sidebarSolid,
      toolbar: rgbaFromHex(toolbar, 0.9),
      selection,
      selectionStrong,
      hover: `rgba(${foregroundRgb.r}, ${foregroundRgb.g}, ${foregroundRgb.b}, 0.06)`,
      separator: `rgba(${foregroundRgb.r}, ${foregroundRgb.g}, ${foregroundRgb.b}, 0.08)`,
      formatBar: rgbaFromHex(formatBar, 0.94),
      destructive,
    }
  }

  const background = hslToHex(tintHue, randomBetween(18, 42), randomBetween(95, 99))
  const foreground = hslToHex(tintHue, randomBetween(12, 28), randomBetween(12, 22))
  const mutedForeground = hslToHex(tintHue, randomBetween(8, 18), randomBetween(42, 52))
  const sidebarSolid = shiftLightness(background, randomBetween(-4, -1))
  const toolbar = mixHex(background, '#ffffff', randomBetween(0.15, 0.35))
  const formatBar = mixHex(background, '#ffffff', randomBetween(0.35, 0.55))
  const foregroundRgb = hexToRgb(foreground)

  return {
    background,
    foreground,
    mutedForeground,
    border: `rgba(${foregroundRgb.r}, ${foregroundRgb.g}, ${foregroundRgb.b}, 0.09)`,
    sidebar: rgbaFromHex(sidebarSolid, 0.9),
    sidebarSolid,
    toolbar: rgbaFromHex(toolbar, 0.88),
    selection,
    selectionStrong,
    hover: `rgba(${foregroundRgb.r}, ${foregroundRgb.g}, ${foregroundRgb.b}, 0.04)`,
    separator: `rgba(${foregroundRgb.r}, ${foregroundRgb.g}, ${foregroundRgb.b}, 0.06)`,
    formatBar: rgbaFromHex(formatBar, 0.94),
    destructive,
  }
}