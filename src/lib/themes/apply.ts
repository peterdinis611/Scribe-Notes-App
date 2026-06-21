import {
  CYCLE_THEME_ORDER,
  getDefaultCustomTheme,
  getPresetById,
} from '@/lib/themes/presets'
import type { ThemeColors, ThemePresetId, ThemeSettings } from '@/lib/themes/types'

const CSS_VAR_MAP: Record<keyof ThemeColors, string> = {
  background: '--color-background',
  foreground: '--color-foreground',
  mutedForeground: '--color-muted-foreground',
  border: '--color-border',
  sidebar: '--color-sidebar',
  sidebarSolid: '--color-sidebar-solid',
  toolbar: '--color-toolbar',
  selection: '--color-selection',
  selectionStrong: '--color-selection-strong',
  hover: '--color-hover',
  separator: '--color-separator',
  formatBar: '--color-format-bar',
  destructive: '--color-destructive',
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveThemeId(themeId: ThemePresetId): Exclude<ThemePresetId, 'system'> {
  if (themeId === 'system') {
    return prefersDark() ? 'dark' : 'light'
  }
  return themeId
}

export function resolveThemeColors(settings: ThemeSettings): {
  colors: ThemeColors
  colorScheme: 'light' | 'dark'
  resolvedId: Exclude<ThemePresetId, 'system'>
} {
  if (settings.themeId === 'custom' && settings.customTheme) {
    return {
      colors: settings.customTheme,
      colorScheme: isDarkColor(settings.customTheme.background) ? 'dark' : 'light',
      resolvedId: 'custom',
    }
  }

  const resolvedId = resolveThemeId(settings.themeId)
  if (resolvedId === 'custom') {
    const fallback = settings.customTheme ?? getDefaultCustomTheme()
    return {
      colors: fallback,
      colorScheme: isDarkColor(fallback.background) ? 'dark' : 'light',
      resolvedId: 'custom',
    }
  }

  const preset = getPresetById(resolvedId)
  if (!preset) {
    const light = getPresetById('light')!
    return { colors: light.colors, colorScheme: 'light', resolvedId: 'light' }
  }

  return {
    colors: preset.colors,
    colorScheme: preset.colorScheme,
    resolvedId: preset.id,
  }
}

function isDarkColor(hex: string): boolean {
  const normalized = hex.trim()
  if (normalized.startsWith('rgba') || normalized.startsWith('rgb')) {
    const match = normalized.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (!match) return false
    const [, r, g, b] = match.map(Number)
    return relativeLuminance(r, g, b) < 0.5
  }

  const hexValue = normalized.replace('#', '')
  const full =
    hexValue.length === 3
      ? hexValue
          .split('')
          .map((c) => c + c)
          .join('')
      : hexValue.slice(0, 6)

  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return relativeLuminance(r, g, b) < 0.5
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

export function applyThemeSettings(settings: ThemeSettings) {
  const { colors, colorScheme, resolvedId } = resolveThemeColors(settings)
  const root = document.documentElement

  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP) as Array<
    [keyof ThemeColors, string]
  >) {
    root.style.setProperty(cssVar, colors[key])
  }

  root.style.setProperty('--color-accent', colors.selectionStrong)
  root.style.setProperty('--color-surface', colors.sidebarSolid)
  root.style.setProperty('--color-surface-elevated', colors.background)
  root.style.setProperty('--color-canvas', colors.sidebarSolid)

  root.dataset.theme = settings.themeId === 'system' ? 'system' : resolvedId
  root.classList.toggle('dark', colorScheme === 'dark')
  root.style.colorScheme = colorScheme
}

export function cycleThemeId(current: ThemePresetId): ThemePresetId {
  const index = CYCLE_THEME_ORDER.indexOf(current as (typeof CYCLE_THEME_ORDER)[number])
  if (index === -1) return 'system'
  return CYCLE_THEME_ORDER[(index + 1) % CYCLE_THEME_ORDER.length]
}
