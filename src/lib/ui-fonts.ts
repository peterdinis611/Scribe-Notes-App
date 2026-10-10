import { kvGet, kvSet } from '@/lib/storage/kv'
import { ensureCustomFontLoaded, isCustomFontFamily } from '@/lib/editor/custom-fonts'
import {
  ensureGoogleFontLoaded,
  ensureGoogleFontLoadedAsync,
  isKnownGoogleFont,
} from '@/lib/editor/google-fonts'

/** Preset catalog keep in sync with `crates/scribe-ui/src/ui_fonts.rs`. */

const UI_FONTS_KEY = 'scribe-ui-fonts-v1'

export type UiFontRole = 'sans' | 'display'

export type UiFontPresetId =
  | 'default'
  | 'system'
  | 'serif'
  | 'mono'
  | 'readable'
  | 'literary'

export type UiFontSettings = {
  sans: UiFontPresetId | string
  display: UiFontPresetId | string
}

export type UiFontPreset = {
  id: UiFontPresetId
  /** Short Aa / sample shown on the option card. */
  sample: string
  sans: string
  display: string
  /** Optional Google family to load when this preset is active. */
  google?: string[]
}

/** Curated UI typography pairs — stacks stay local-first; Google only for readable/literary. */
export const UI_FONT_PRESETS: UiFontPreset[] = [
  {
    id: 'default',
    sample: 'Aa',
    sans: '"Figtree", "Avenir Next", "Segoe UI", sans-serif',
    display: '"Fraunces", "Iowan Old Style", "Palatino Linotype", serif',
  },
  {
    id: 'system',
    sample: 'Aa',
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    display: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  },
  {
    id: 'serif',
    sample: 'Aa',
    sans: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
    display: '"Iowan Old Style", Georgia, "Palatino Linotype", serif',
  },
  {
    id: 'mono',
    sample: 'Aa',
    sans: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
    display: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
  },
  {
    id: 'readable',
    sample: 'Aa',
    sans: '"Lexend", "Figtree", "Avenir Next", sans-serif',
    display: '"Lexend", "Fraunces", "Iowan Old Style", serif',
    google: ['Lexend'],
  },
  {
    id: 'literary',
    sample: 'Aa',
    sans: '"Source Serif 4", Georgia, serif',
    display: '"Playfair Display", "Fraunces", Georgia, serif',
    google: ['Source Serif 4', 'Playfair Display'],
  },
]

export const DEFAULT_UI_FONT_SETTINGS: UiFontSettings = {
  sans: 'default',
  display: 'default',
}

function isPresetId(value: string): value is UiFontPresetId {
  return UI_FONT_PRESETS.some((preset) => preset.id === value)
}

export function readUiFontSettings(): UiFontSettings {
  try {
    const raw = kvGet(UI_FONTS_KEY)
    if (!raw) return { ...DEFAULT_UI_FONT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<UiFontSettings>
    return {
      sans: typeof parsed.sans === 'string' && parsed.sans ? parsed.sans : 'default',
      display: typeof parsed.display === 'string' && parsed.display ? parsed.display : 'default',
    }
  } catch {
    return { ...DEFAULT_UI_FONT_SETTINGS }
  }
}

export function persistUiFontSettings(settings: UiFontSettings) {
  kvSet(UI_FONTS_KEY, JSON.stringify(settings))
}

function familyFromChoice(choice: string): { kind: 'preset' | 'custom' | 'google'; family: string } {
  if (isPresetId(choice)) return { kind: 'preset', family: choice }
  if (choice.startsWith('google:')) return { kind: 'google', family: choice.slice('google:'.length).trim() }
  if (choice.startsWith('custom:')) return { kind: 'custom', family: choice.slice('custom:'.length).trim() }
  return { kind: 'custom', family: choice.trim() }
}

function stackForChoice(choice: string, role: UiFontRole): string {
  const parsed = familyFromChoice(choice)
  if (parsed.kind === 'preset' && isPresetId(parsed.family)) {
    const preset = UI_FONT_PRESETS.find((item) => item.id === parsed.family)!
    return role === 'sans' ? preset.sans : preset.display
  }
  const family = parsed.family
  if (!family) {
    return role === 'sans' ? UI_FONT_PRESETS[0]!.sans : UI_FONT_PRESETS[0]!.display
  }
  const quoted = family.includes(' ') ? `"${family.replaceAll('"', '')}"` : family
  return role === 'sans'
    ? `${quoted}, "Figtree", "Avenir Next", sans-serif`
    : `${quoted}, "Fraunces", "Iowan Old Style", serif`
}

function googleFamiliesForSettings(settings: UiFontSettings): string[] {
  const out = new Set<string>()
  for (const choice of [settings.sans, settings.display]) {
    const parsed = familyFromChoice(choice)
    if (parsed.kind === 'preset' && isPresetId(parsed.family)) {
      const preset = UI_FONT_PRESETS.find((item) => item.id === parsed.family)
      for (const family of preset?.google ?? []) out.add(family)
    } else if (parsed.kind === 'google' && parsed.family) {
      out.add(parsed.family)
    } else if (parsed.family && isKnownGoogleFont(parsed.family)) {
      out.add(parsed.family)
    }
  }
  return [...out]
}

function writeCssVars(settings: UiFontSettings) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--font-sans', stackForChoice(settings.sans, 'sans'))
  root.style.setProperty('--font-display', stackForChoice(settings.display, 'display'))
  root.dataset.uiFontSans = settings.sans
  root.dataset.uiFontDisplay = settings.display
}

/** Sync apply for boot / theme — injects Google links without waiting. */
export function applyUiFontSettings(settings: UiFontSettings = readUiFontSettings()) {
  writeCssVars(settings)
  for (const family of googleFamiliesForSettings(settings)) {
    ensureGoogleFontLoaded(family, { force: true })
  }
  for (const choice of [settings.sans, settings.display]) {
    const parsed = familyFromChoice(choice)
    if (parsed.kind === 'custom' && parsed.family && isCustomFontFamily(parsed.family)) {
      void ensureCustomFontLoaded(parsed.family)
    }
  }
}

/**
 * Smooth apply for settings UI: wait for Google CSS, then swap vars in one frame
 * so the whole chrome doesn't thrash mid-download.
 */
export async function applyUiFontSettingsSmooth(settings: UiFontSettings) {
  const google = googleFamiliesForSettings(settings)
  if (google.length) {
    await Promise.all(google.map((family) => ensureGoogleFontLoadedAsync(family, { force: true })))
  }
  for (const choice of [settings.sans, settings.display]) {
    const parsed = familyFromChoice(choice)
    if (parsed.kind === 'custom' && parsed.family) {
      await ensureCustomFontLoaded(parsed.family)
    }
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      writeCssVars(settings)
      resolve()
    })
  })
}

export function patchUiFontSettings(
  patch: Partial<UiFontSettings>,
  current: UiFontSettings = readUiFontSettings(),
): UiFontSettings {
  const next = { ...current, ...patch }
  persistUiFontSettings(next)
  // Fire-and-forget smooth apply — callers should not await in the click path.
  void applyUiFontSettingsSmooth(next)
  return next
}

export function uiFontChoiceLabel(choice: string): string {
  const parsed = familyFromChoice(choice)
  if (parsed.kind === 'preset') return parsed.family
  return parsed.family
}

export function customUiFontChoice(family: string) {
  return `custom:${family.trim()}`
}

export function googleUiFontChoice(family: string) {
  return `google:${family.trim()}`
}
