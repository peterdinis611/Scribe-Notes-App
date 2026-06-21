export interface ThemeColors {
  background: string
  foreground: string
  mutedForeground: string
  border: string
  sidebar: string
  sidebarSolid: string
  toolbar: string
  selection: string
  selectionStrong: string
  hover: string
  separator: string
  formatBar: string
  destructive: string
}

export type ThemePresetId =
  | 'system'
  | 'light'
  | 'dark'
  | 'sepia'
  | 'paper'
  | 'nord'
  | 'midnight'
  | 'forest'
  | 'rose'
  | 'custom'

export interface ThemePreset {
  id: Exclude<ThemePresetId, 'system' | 'custom'>
  name: string
  description: string
  colorScheme: 'light' | 'dark'
  colors: ThemeColors
}

export interface ThemeSettings {
  themeId: ThemePresetId
  customTheme?: ThemeColors
}

export const THEME_COLOR_FIELDS: Array<{
  key: keyof ThemeColors
  label: string
}> = [
  { key: 'background', label: 'Pozadie' },
  { key: 'foreground', label: 'Text' },
  { key: 'mutedForeground', label: 'Sekundárny text' },
  { key: 'border', label: 'Okraje' },
  { key: 'sidebar', label: 'Sidebar' },
  { key: 'sidebarSolid', label: 'Sidebar plný' },
  { key: 'toolbar', label: 'Panel nástrojov' },
  { key: 'selection', label: 'Výber' },
  { key: 'selectionStrong', label: 'Akcent' },
  { key: 'hover', label: 'Hover' },
  { key: 'formatBar', label: 'Formátovací panel' },
  { key: 'destructive', label: 'Chyba / zmazať' },
]
