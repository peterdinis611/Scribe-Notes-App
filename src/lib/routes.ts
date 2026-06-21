import type { LucideIcon } from 'lucide-react'
import { FolderOpen, Info, Keyboard, Palette } from 'lucide-react'

export type SettingsSection = 'appearance' | 'storage' | 'shortcuts' | 'about'

export function isSettingsSection(value: string | undefined): value is SettingsSection {
  return value === 'appearance' || value === 'storage' || value === 'shortcuts' || value === 'about'
}

export const SETTINGS_SECTIONS: {
  id: SettingsSection
  label: string
  description: string
  icon: LucideIcon
}[] = [
  { id: 'appearance', label: 'Vzhľad', description: 'Témy a farby', icon: Palette },
  { id: 'storage', label: 'Úložisko', description: 'Súbory a priečinky', icon: FolderOpen },
  { id: 'shortcuts', label: 'Skratky', description: 'Klávesové skratky', icon: Keyboard },
  { id: 'about', label: 'O aplikácii', description: 'Verzia a info', icon: Info },
]

const SETTINGS_PATHS = {
  appearance: '/settings/appearance',
  storage: '/settings/storage',
  shortcuts: '/settings/shortcuts',
  about: '/settings/about',
} as const satisfies Record<SettingsSection, string>

export const ROUTES = {
  home: () => ({ to: '/' as const }),
  document: (id: string) => ({
    to: '/doc/$documentId' as const,
    params: { documentId: id },
  }),
  settingsSection: (section: SettingsSection) => ({
    to: SETTINGS_PATHS[section],
  }),
} as const
