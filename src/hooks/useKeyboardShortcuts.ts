import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useHotkeys } from '@tanstack/react-hotkeys'
import { useNavigate } from '@tanstack/react-router'
import {
  forceSaveDocument,
  listDocuments,
  pickAndImportFile,
} from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { cycleThemeId } from '@/lib/themes/apply'
import {
  applyThemeSettingsAtom,
  createThemeSelection,
  templatePickerOpenAtom,
  themeSettingsAtom,
} from '@/store/settings'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
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

  useHotkeys(
    [
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
          try {
            setSaveStatus('saving')
            const saved = await forceSaveDocument(activeId)
            setActiveDocument(saved)
            setDocuments((prev) =>
              prev.map((item) =>
                item.id === saved.id
                  ? {
                      ...item,
                      title: saved.title,
                      filePath: saved.filePath,
                      updatedAt: saved.updatedAt,
                    }
                  : item,
              ),
            )
            setSaveStatus('saved')
          } catch {
            setSaveStatus('error')
          }
        },
        options: {
          meta: { name: 'Uložiť', description: 'Uloží dokument na disk' },
        },
      },
      {
        hotkey: 'Mod+O',
        callback: async () => {
          const imported = await pickAndImportFile()
          if (!imported) return
          const items = await listDocuments()
          setDocuments(items)
          setActiveId(imported.id)
          setActiveDocument(imported)
          setSaveStatus('saved')
          navigate(ROUTES.document(imported.id))
        },
        options: {
          meta: { name: 'Importovať', description: 'Import .scribe alebo .pages' },
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
    ],
    APP_HOTKEY_OPTIONS,
  )
}
