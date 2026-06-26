import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useHotkeys } from '@tanstack/react-hotkeys'
import { useNavigate } from '@tanstack/react-router'
import {
  pickAndImportFile,
} from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import { cycleThemeId } from '@/lib/themes/apply'
import {
  applyThemeSettingsAtom,
  createThemeSelection,
  templatePickerOpenAtom,
  themeSettingsAtom,
} from '@/store/settings'
import { commandPaletteOpenAtom } from '@/store/folders'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
  flushAutoSaveAtom,
  focusModeAtom,
  saveStatusAtom,
} from '@/store/documents'

const APP_HOTKEY_OPTIONS = {
  preventDefault: true,
  ignoreInputs: false,
} as const

export function useKeyboardShortcuts() {
  const [activeId, setActiveId] = useAtom(activeDocumentIdAtom)
  const [themeSettings] = useAtom(themeSettingsAtom)
  const applyTheme = useSetAtom(applyThemeSettingsAtom)
  const navigate = useNavigate()
  const setTemplatePickerOpen = useSetAtom(templatePickerOpenAtom)
  const activeDocument = useAtomValue(activeDocumentAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const setSaveStatus = useSetAtom(saveStatusAtom)
  const setCommandPaletteOpen = useSetAtom(commandPaletteOpenAtom)
  const flushAutoSave = useAtomValue(flushAutoSaveAtom)
  const [focusMode, setFocusMode] = useAtom(focusModeAtom)
  const commandPaletteOpen = useAtomValue(commandPaletteOpenAtom)
  const templatePickerOpen = useAtomValue(templatePickerOpenAtom)

  useHotkeys(
    [
      {
        hotkey: 'Mod+K',
        callback: () => setCommandPaletteOpen((open) => !open),
        options: {
          meta: { name: 'Príkazová paleta', description: 'Vyhľadávanie a príkazy' },
        },
      },
      {
        hotkey: 'Mod+N',
        callback: () => setTemplatePickerOpen(true),
        options: {
          meta: { name: 'Nový dokument', description: 'Otvorí výber šablóny' },
        },
      },
      {
        hotkey: 'Mod+S',
        callback: async () => {
          if (!activeId || !activeDocument) return
          if (!flushAutoSave) return
          try {
            await flushAutoSave()
          } catch {
            setSaveStatus('error')
          }
        },
        options: {
          meta: { name: 'Uložiť', description: 'Okamžite uloží aktuálny obsah dokumentu' },
        },
      },
      {
        hotkey: 'Mod+O',
        callback: async () => {
          const imported = await pickAndImportFile()
          if (!imported) return
          setDocuments((prev) => prependDocumentSummary(prev, imported))
          setActiveId(imported.id)
          setActiveDocument(imported)
          setSaveStatus('saved')
          navigate(ROUTES.document(imported.id))
        },
        options: {
          meta: { name: 'Importovať', description: 'Import .scribe, .pages, .md, .txt, .docx' },
        },
      },
      {
        hotkey: 'Mod+Shift+L',
        callback: () => {
          const next = cycleThemeId(themeSettings.themeId)
          applyTheme(createThemeSelection(themeSettings, next))
        },
        options: {
          meta: { name: 'Téma', description: 'Prepína medzi témami' },
        },
      },
      {
        hotkey: 'Mod+,',
        callback: () => navigate(ROUTES.settingsSection('appearance')),
        options: {
          meta: { name: 'Nastavenia', description: 'Otvorí stránku nastavení' },
        },
      },
      {
        hotkey: 'Mod+Shift+F',
        callback: () => setFocusMode((enabled) => !enabled),
        options: {
          meta: { name: 'Režim sústredenia', description: 'Zapne alebo vypne režim sústredenia' },
        },
      },
      {
        hotkey: 'Escape',
        callback: () => {
          if (!focusMode || commandPaletteOpen || templatePickerOpen) return
          setFocusMode(false)
        },
        options: {
          meta: { name: 'Ukončiť sústredenie', description: 'Vypne režim sústredenia' },
        },
      },
    ],
    APP_HOTKEY_OPTIONS,
  )
}
