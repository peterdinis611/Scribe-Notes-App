import { useHotkeys } from '@tanstack/react-hotkeys'
import { useNavigate } from '@tanstack/react-router'
import { pickAndImportFile } from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { cycleThemeId } from '@/lib/themes/apply'
import { createThemeSelection } from '@/store/settings-helpers'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { editorRefs } from '@/store/editorRefs'
import {
  setActiveDocument,
  setActiveDocumentId,
  setFocusMode,
  setSaveStatus,
  toggleFocusMode,
  updateDocuments,
} from '@/store/documentsSlice'
import {
  setTemplatePickerOpen,
  setThemeSettings,
} from '@/store/settingsSlice'
import { toggleCommandPaletteOpen } from '@/store/foldersSlice'

const APP_HOTKEY_OPTIONS = {
  preventDefault: true,
  ignoreInputs: false,
} as const

export function useKeyboardShortcuts() {
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const themeSettings = useAppSelector((state) => state.settings.themeSettings)
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const commandPaletteOpen = useAppSelector((state) => state.folders.commandPaletteOpen)
  const templatePickerOpen = useAppSelector((state) => state.settings.templatePickerOpen)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  useHotkeys(
    [
      {
        hotkey: 'Mod+K',
        callback: () => dispatch(toggleCommandPaletteOpen()),
        options: {
          meta: { name: 'Príkazová paleta', description: 'Vyhľadávanie a príkazy' },
        },
      },
      {
        hotkey: 'Mod+N',
        callback: () => dispatch(setTemplatePickerOpen(true)),
        options: {
          meta: { name: 'Nový dokument', description: 'Otvorí výber šablóny' },
        },
      },
      {
        hotkey: 'Mod+S',
        callback: async () => {
          if (!activeId || !activeDocument) return
          if (!editorRefs.flushAutoSave) return
          try {
            await editorRefs.flushAutoSave()
          } catch {
            dispatch(setSaveStatus('error'))
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
          dispatch(updateDocuments((prev) => prependDocumentSummary(prev, imported)))
          dispatch(setActiveDocumentId(imported.id))
          dispatch(setActiveDocument(imported))
          dispatch(setSaveStatus('saved'))
          toast.success('Dokument importovaný', imported.title)
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
          dispatch(setThemeSettings(createThemeSelection(themeSettings, next)))
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
        callback: () => dispatch(toggleFocusMode()),
        options: {
          meta: { name: 'Režim sústredenia', description: 'Zapne alebo vypne režim sústredenia' },
        },
      },
      {
        hotkey: 'Escape',
        callback: () => {
          if (!focusMode || commandPaletteOpen || templatePickerOpen) return
          dispatch(setFocusMode(false))
        },
        options: {
          meta: { name: 'Ukončiť sústredenie', description: 'Vypne režim sústredenia' },
        },
      },
    ],
    APP_HOTKEY_OPTIONS,
  )
}
