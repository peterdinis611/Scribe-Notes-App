export interface ShortcutDef {
  id:
    | 'newDocument'
    | 'save'
    | 'commandPalette'
    | 'undo'
    | 'redo'
    | 'find'
    | 'findReplace'
    | 'import'
    | 'toggleTheme'
    | 'settings'
  keys: string[]
}

export const APP_SHORTCUTS: ShortcutDef[] = [
  { id: 'newDocument', keys: ['⌘', 'N'] },
  { id: 'save', keys: ['⌘', 'S'] },
  { id: 'commandPalette', keys: ['⌘', 'K'] },
  { id: 'undo', keys: ['⌘', 'Z'] },
  { id: 'redo', keys: ['⌘', '⇧', 'Z'] },
  { id: 'find', keys: ['⌘', 'F'] },
  { id: 'findReplace', keys: ['⌘', 'H'] },
  { id: 'import', keys: ['⌘', 'O'] },
  { id: 'toggleTheme', keys: ['⌘', '⇧', 'L'] },
  { id: 'settings', keys: ['⌘', ','] },
]
