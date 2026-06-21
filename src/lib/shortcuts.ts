export interface ShortcutDef {
  label: string
  keys: string[]
  description?: string
}

export const APP_SHORTCUTS: ShortcutDef[] = [
  { label: 'Nový dokument', keys: ['⌘', 'N'], description: 'Otvorí výber šablóny' },
  { label: 'Uložiť', keys: ['⌘', 'S'], description: 'Uloží dokument na disk' },
  { label: 'Príkazová paleta', keys: ['⌘', 'K'], description: 'Vyhľadávanie dokumentov a príkazov' },
  { label: 'Späť', keys: ['⌘', 'Z'], description: 'Vráti poslednú zmenu v editore' },
  { label: 'Znovu', keys: ['⌘', '⇧', 'Z'], description: 'Opakuje zrušenú zmenu v editore' },
  { label: 'Importovať', keys: ['⌘', 'O'], description: 'Import .scribe, .pages, .md, .txt, .docx' },
  { label: 'Prepínať tému', keys: ['⌘', '⇧', 'L'], description: 'Prepína medzi témami' },
  { label: 'Nastavenia', keys: ['⌘', ','], description: 'Otvorí panel nastavení' },
]
