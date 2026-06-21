export interface ShortcutDef {
  label: string
  keys: string[]
  description?: string
}

export const APP_SHORTCUTS: ShortcutDef[] = [
  { label: 'Nový dokument', keys: ['⌘', 'N'], description: 'Otvorí výber šablóny' },
  { label: 'Uložiť', keys: ['⌘', 'S'], description: 'Uloží dokument na disk' },
  { label: 'Importovať', keys: ['⌘', 'O'], description: 'Import .scribe alebo .pages' },
  { label: 'Prepínať tému', keys: ['⌘', '⇧', 'L'], description: 'Prepína medzi témami' },
  { label: 'Nastavenia', keys: ['⌘', ','], description: 'Otvorí panel nastavení' },
]
