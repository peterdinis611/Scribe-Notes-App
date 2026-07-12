export type ShortcutScope = 'app'

export interface AppShortcutBinding {
  id: string
  scope: ShortcutScope
  defaultHotkey: string
  labelKey: string
  descriptionKey: string
}

export const APP_SHORTCUT_BINDINGS: AppShortcutBinding[] = [
  {
    id: 'commandPalette',
    scope: 'app',
    defaultHotkey: 'Mod+K',
    labelKey: 'shortcuts.commandPalette.label',
    descriptionKey: 'shortcuts.commandPalette.description',
  },
  {
    id: 'newDocument',
    scope: 'app',
    defaultHotkey: 'Mod+N',
    labelKey: 'shortcuts.newDocument.label',
    descriptionKey: 'shortcuts.newDocument.description',
  },
  {
    id: 'quickNote',
    scope: 'app',
    defaultHotkey: 'Mod+Shift+N',
    labelKey: 'shortcuts.quickNote.label',
    descriptionKey: 'shortcuts.quickNote.description',
  },
  {
    id: 'save',
    scope: 'app',
    defaultHotkey: 'Mod+S',
    labelKey: 'shortcuts.save.label',
    descriptionKey: 'shortcuts.save.description',
  },
  {
    id: 'import',
    scope: 'app',
    defaultHotkey: 'Mod+O',
    labelKey: 'shortcuts.import.label',
    descriptionKey: 'shortcuts.import.description',
  },
  {
    id: 'toggleTheme',
    scope: 'app',
    defaultHotkey: 'Mod+Shift+L',
    labelKey: 'shortcuts.toggleTheme.label',
    descriptionKey: 'shortcuts.toggleTheme.description',
  },
  {
    id: 'settings',
    scope: 'app',
    defaultHotkey: 'Mod+,',
    labelKey: 'shortcuts.settings.label',
    descriptionKey: 'shortcuts.settings.description',
  },
  {
    id: 'focusMode',
    scope: 'app',
    defaultHotkey: 'Mod+Shift+F',
    labelKey: 'shortcuts.focusMode.label',
    descriptionKey: 'shortcuts.focusMode.description',
  },
  {
    id: 'readingMode',
    scope: 'app',
    defaultHotkey: 'Mod+Shift+R',
    labelKey: 'shortcuts.readingMode.label',
    descriptionKey: 'shortcuts.readingMode.description',
  },
]

export interface ShortcutDef {
  id:
    | 'newDocument'
    | 'quickNote'
    | 'save'
    | 'commandPalette'
    | 'undo'
    | 'redo'
    | 'find'
    | 'findReplace'
    | 'import'
    | 'toggleTheme'
    | 'settings'
    | 'focusMode'
    | 'readingMode'
  keys: string[]
}

export const APP_SHORTCUTS: ShortcutDef[] = [
  { id: 'newDocument', keys: ['⌘', 'N'] },
  { id: 'quickNote', keys: ['⌘', '⇧', 'N'] },
  { id: 'save', keys: ['⌘', 'S'] },
  { id: 'commandPalette', keys: ['⌘', 'K'] },
  { id: 'undo', keys: ['⌘', 'Z'] },
  { id: 'redo', keys: ['⌘', '⇧', 'Z'] },
  { id: 'find', keys: ['⌘', 'F'] },
  { id: 'findReplace', keys: ['⌘', 'H'] },
  { id: 'import', keys: ['⌘', 'O'] },
  { id: 'toggleTheme', keys: ['⌘', '⇧', 'L'] },
  { id: 'settings', keys: ['⌘', ','] },
  { id: 'focusMode', keys: ['⌘', '⇧', 'F'] },
  { id: 'readingMode', keys: ['⌘', '⇧', 'R'] },
]

import type { ShortcutOverrides } from '@/store/persistence'

export function getResolvedHotkey(id: string, overrides: ShortcutOverrides): string {
  const override = overrides[id]
  if (override) return override
  const binding = APP_SHORTCUT_BINDINGS.find((entry) => entry.id === id)
  return binding?.defaultHotkey ?? ''
}

export function getDisplayKeysForShortcut(id: string, overrides: ShortcutOverrides): string[] {
  return hotkeyToDisplayKeys(getResolvedHotkey(id, overrides))
}

export function hotkeyToDisplayKeys(hotkey: string): string[] {
  return hotkey
    .split('+')
    .map((part) => {
      if (part === 'Mod') return '⌘'
      if (part === 'Shift') return '⇧'
      if (part === 'Alt') return '⌥'
      if (part === 'Control') return '⌃'
      return part.length === 1 ? part.toUpperCase() : part
    })
}

export function eventToHotkey(event: KeyboardEvent): string | null {
  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) parts.push('Mod')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push('Alt')

  const key = event.key
  if (['Meta', 'Control', 'Shift', 'Alt'].includes(key)) return null
  if (key === ' ') parts.push('Space')
  else if (key === ',') parts.push(',')
  else parts.push(key.length === 1 ? key.toUpperCase() : key)

  return parts.join('+')
}
