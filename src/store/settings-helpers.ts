import type { ThemeColors, ThemePresetId, ThemeSettings } from '@/lib/themes/types'
import { getDefaultCustomTheme } from '@/lib/themes/presets'

export function createThemeSelection(
  current: ThemeSettings,
  themeId: ThemePresetId,
): ThemeSettings {
  return { ...current, themeId }
}

export function createCustomThemeSelection(
  current: ThemeSettings,
  customTheme: ThemeColors,
): ThemeSettings {
  return {
    ...current,
    themeId: 'custom',
    customTheme,
  }
}

export function createResetCustomTheme(current: ThemeSettings): ThemeSettings {
  return {
    ...current,
    themeId: 'custom',
    customTheme: getDefaultCustomTheme(),
  }
}
