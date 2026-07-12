import { useHotkeys } from '@tanstack/react-hotkeys'
import type { RegisterableHotkey } from '@tanstack/react-hotkeys'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { openQuickNote } from '@/lib/quick-note'
import { pickAndImportFile } from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import { getResolvedHotkey } from '@/lib/shortcuts'
import { toast } from '@/lib/toast'
import { cycleThemeId } from '@/lib/themes/apply'
import { createThemeSelection } from '@/store/settings-helpers'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { editorRefs } from '@/store/editorRefs'
import {
  setActiveDocument,
  setActiveDocumentId,
  setFindReplaceOpen,
  setFocusMode,
  setReadingMode,
  setSaveStatus,
  toggleFocusMode,
  toggleReadingMode,
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

function hotkey(id: string, overrides: Record<string, string>): RegisterableHotkey {
  return getResolvedHotkey(id, overrides) as RegisterableHotkey
}

export function useKeyboardShortcuts() {
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const documents = useAppSelector((state) => state.documents.documents)
  const themeSettings = useAppSelector((state) => state.settings.themeSettings)
  const shortcutOverrides = useAppSelector((state) => state.settings.shortcutOverrides)
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const readingMode = useAppSelector((state) => state.documents.readingMode)
  const findReplaceOpen = useAppSelector((state) => state.documents.findReplaceOpen)
  const commandPaletteOpen = useAppSelector((state) => state.folders.commandPaletteOpen)
  const templatePickerOpen = useAppSelector((state) => state.settings.templatePickerOpen)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { t } = useTranslation()

  useHotkeys(
    [
      {
        hotkey: hotkey('commandPalette', shortcutOverrides),
        callback: () => dispatch(toggleCommandPaletteOpen()),
        options: {
          meta: { name: 'Príkazová paleta', description: 'Vyhľadávanie a príkazy' },
        },
      },
      {
        hotkey: hotkey('newDocument', shortcutOverrides),
        callback: () => dispatch(setTemplatePickerOpen(true)),
        options: {
          meta: { name: 'Nový dokument', description: 'Otvorí výber šablóny' },
        },
      },
      {
        hotkey: hotkey('quickNote', shortcutOverrides),
        callback: () => {
          void openQuickNote(documents, dispatch, navigate, (key) => t(key))
        },
        options: {
          meta: { name: 'Rýchla poznámka', description: 'Otvorí scratch dokument' },
        },
      },
      {
        hotkey: hotkey('save', shortcutOverrides),
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
        hotkey: hotkey('import', shortcutOverrides),
        callback: async () => {
          const imported = await pickAndImportFile()
          if (!imported) return
          dispatch(updateDocuments((prev) => prependDocumentSummary(prev, imported)))
          dispatch(setActiveDocumentId(imported.id))
          dispatch(setActiveDocument(imported))
          dispatch(setSaveStatus('saved'))
          toast.success(t('toasts.documentImported'), imported.title)
          navigate(ROUTES.document(imported.id))
        },
        options: {
          meta: { name: 'Importovať', description: 'Import .scribe, .pages, .md, .txt, .docx' },
        },
      },
      {
        hotkey: hotkey('toggleTheme', shortcutOverrides),
        callback: () => {
          const next = cycleThemeId(themeSettings.themeId)
          dispatch(setThemeSettings(createThemeSelection(themeSettings, next)))
        },
        options: {
          meta: { name: 'Téma', description: 'Prepína medzi témami' },
        },
      },
      {
        hotkey: hotkey('settings', shortcutOverrides),
        callback: () => navigate(ROUTES.settingsSection('appearance')),
        options: {
          meta: { name: 'Nastavenia', description: 'Otvorí stránku nastavení' },
        },
      },
      {
        hotkey: hotkey('focusMode', shortcutOverrides),
        callback: () => dispatch(toggleFocusMode()),
        options: {
          meta: { name: 'Režim sústredenia', description: 'Zapne alebo vypne režim sústredenia' },
        },
      },
      {
        hotkey: hotkey('readingMode', shortcutOverrides),
        callback: () => dispatch(toggleReadingMode()),
        options: {
          meta: { name: 'Čítací režim', description: 'Čistý náhľad bez úprav' },
        },
      },
      {
        hotkey: 'Escape',
        callback: () => {
          if (findReplaceOpen) {
            dispatch(setFindReplaceOpen(false))
            return
          }
          if (readingMode) {
            dispatch(setReadingMode(false))
            return
          }
          if (!focusMode || commandPaletteOpen || templatePickerOpen) return
          dispatch(setFocusMode(false))
        },
        options: {
          meta: { name: 'Zavrieť panel', description: 'Zavrie vyhľadávanie alebo režim' },
        },
      },
    ],
    APP_HOTKEY_OPTIONS,
  )
}
