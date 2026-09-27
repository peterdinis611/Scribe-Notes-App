import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import { Activity, Bot, Cable, FolderOpen, Info, Keyboard, Palette, Shield, Smartphone, Sparkles } from 'lucide-react'
export type SettingsSection =
  | 'appearance'
  | 'storage'
  | 'shortcuts'
  | 'diagnostics'
  | 'mcp'
  | 'nlp'
  | 'agent'
  | 'capture'
  | 'privacy'
  | 'about'

export function isSettingsSection(value: string | undefined): value is SettingsSection {
  return (
    value === 'appearance' ||
    value === 'storage' ||
    value === 'shortcuts' ||
    value === 'diagnostics' ||
    value === 'mcp' ||
    value === 'nlp' ||
    value === 'agent' ||
    value === 'capture' ||
    value === 'privacy' ||
    value === 'about'
  )
}

const SETTINGS_SECTION_META: {
  id: SettingsSection
  icon: LucideIcon
}[] = [
  { id: 'appearance', icon: Palette },
  { id: 'storage', icon: FolderOpen },
  { id: 'capture', icon: Smartphone },
  { id: 'shortcuts', icon: Keyboard },
  { id: 'diagnostics', icon: Activity },
  { id: 'mcp', icon: Cable },
  { id: 'nlp', icon: Sparkles },
  { id: 'agent', icon: Bot },
  { id: 'privacy', icon: Shield },
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
  mcp: '/settings/mcp',
  nlp: '/settings/nlp',
  agent: '/settings/agent',
  capture: '/settings/capture',
  privacy: '/settings/privacy',
  about: '/settings/about',
} as const satisfies Record<SettingsSection, string>

export const ROUTES = {
  home: () => ({ to: '/' as const }),
  document: (id: string) => ({
    to: '/doc/$documentId' as const,
    params: { documentId: id },
  }),
  docs: () => ({ to: '/docs' as const }),
  graph: (options?: { around?: boolean }) => ({
    to: '/graph' as const,
    search: options?.around ? { around: true as const } : {},
  }),
  settingsSection: (section: SettingsSection) => ({
    to: SETTINGS_PATHS[section],
  }),
} as const
