import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import { Activity, FolderOpen, Info, Keyboard, Palette } from 'lucide-react'
export type SettingsSection = 'appearance' | 'storage' | 'shortcuts' | 'diagnostics' | 'about'

export function isSettingsSection(value: string | undefined): value is SettingsSection {
  return (
    value === 'appearance' ||
    value === 'storage' ||
    value === 'shortcuts' ||
    value === 'diagnostics' ||
    value === 'about'
  )
}

const SETTINGS_SECTION_META: {
  id: SettingsSection
  icon: LucideIcon
}[] = [
  { id: 'appearance', icon: Palette },
  { id: 'storage', icon: FolderOpen },
  { id: 'shortcuts', icon: Keyboard },
  { id: 'diagnostics', icon: Activity },
  { id: 'about', icon: Info },
]

export function useSettingsSections() {
  const { t } = useTranslation()

  return useMemo(
    () =>
      SETTINGS_SECTION_META.map(({ id, icon }) => ({
        id,
        icon,
        label: t(`settings.sections.${id}.label`),
        description: t(`settings.sections.${id}.description`),
      })),
    [t],
  )
}

const SETTINGS_PATHS = {
  appearance: '/settings/appearance',
  storage: '/settings/storage',
  shortcuts: '/settings/shortcuts',
  diagnostics: '/settings/diagnostics',
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
