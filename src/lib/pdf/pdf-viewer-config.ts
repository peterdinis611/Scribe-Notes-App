import type { ThemeConfig } from '@embedpdf/snippet'
import { ZoomMode } from '@embedpdf/snippet'
import type { ThemeSettings } from '@/lib/themes/types'
import { resolveThemeColors } from '@/lib/themes/apply'

export function base64ToPdfUrl(dataBase64: string): string {
  const bytes = Uint8Array.from(atob(dataBase64), (char) => char.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return URL.createObjectURL(blob)
}

function readCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function resolveViewerThemePreference(settings?: ThemeSettings): 'light' | 'dark' {
  if (settings) {
    return resolveThemeColors(settings).colorScheme
  }
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function buildScribeThemeColorOverrides() {
  const accent = readCssVar('--color-accent', '#007aff')

  return {
    background: {
      app: readCssVar('--color-canvas', '#f5f5f7'),
      surface: readCssVar('--color-toolbar', '#ffffff'),
      surfaceAlt: readCssVar('--color-sidebar', '#f2f2f7'),
      elevated: readCssVar('--color-surface-elevated', '#ffffff'),
      overlay: 'rgba(0, 0, 0, 0.45)',
      input: readCssVar('--color-background', '#ffffff'),
    },
    foreground: {
      primary: readCssVar('--color-foreground', '#111111'),
      secondary: readCssVar('--color-muted-foreground', '#6b7280'),
      muted: readCssVar('--color-muted-foreground', '#6b7280'),
      disabled: readCssVar('--color-muted-foreground', '#9ca3af'),
      onAccent: '#ffffff',
    },
    border: {
      default: readCssVar('--color-border', '#e5e7eb'),
      subtle: readCssVar('--color-separator', '#f3f4f6'),
      strong: readCssVar('--color-border', '#d1d5db'),
    },
    accent: {
      primary: accent,
      primaryHover: accent,
      primaryActive: accent,
      primaryLight: readCssVar('--color-selection', 'rgba(0, 122, 255, 0.12)'),
      primaryForeground: '#ffffff',
    },
    interactive: {
      hover: readCssVar('--color-hover', 'rgba(0, 0, 0, 0.05)'),
      active: readCssVar('--color-hover', 'rgba(0, 0, 0, 0.08)'),
      selected: readCssVar('--color-selection', 'rgba(0, 122, 255, 0.12)'),
      focus: accent,
      focusRing: accent,
    },
  }
}

export function buildEmbedPdfThemeConfig(settings?: ThemeSettings): ThemeConfig {
  const preference = resolveViewerThemePreference(settings)
  const colors = buildScribeThemeColorOverrides()

  return {
    preference,
    light: preference === 'light' ? colors : {},
    dark: preference === 'dark' ? colors : {},
  }
}

export function createPdfViewerConfig(src: string, settings?: ThemeSettings) {
  return {
    src,
    tabBar: 'never' as const,
    theme: buildEmbedPdfThemeConfig(settings),
    zoom: {
      defaultZoomLevel: ZoomMode.FitWidth,
    },
    disabledCategories: [
      'annotation',
      'redaction',
      'export',
      'document-print',
      'document-open',
    ],
    permissions: {
      overrides: {
        print: false,
        copy: true,
      },
    },
  }
}
