import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useNavigate } from '@tanstack/react-router'
import {
  Copy,
  FileText,
  Focus,
  FolderInput,
  FolderPlus,
  Moon,
  Plus,
  Search,
  Settings2,
  Shuffle,
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { createFolder, duplicateDocument, searchDocuments } from '@/lib/db/api'
import type { SearchHit } from '@/lib/db/api'
import { promptInput } from '@/lib/input-dialog'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import { cn, debounce } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { activeDocumentAtom, activeDocumentIdAtom, documentsAtom, focusModeAtom } from '@/store/documents'
import { commandPaletteOpenAtom, foldersAtom, moveDocumentPickerOpenAtom } from '@/store/folders'
import { templatePickerOpenAtom } from '@/store/settings'
import { cycleThemeId } from '@/lib/themes/apply'
import { generateRandomTheme } from '@/lib/themes/generate-random-theme'
import { applyThemeSettingsAtom, createCustomThemeSelection, createThemeSelection, themeSettingsAtom } from '@/store/settings'

type PaletteItem =
  | { type: 'action'; id: string; label: string; hint?: string; icon: React.ReactNode; run: () => void }
  | { type: 'document'; id: string; label: string; hint?: string; icon: React.ReactNode; run: () => void }

export function CommandPalette() {
  const [open, setOpen] = useAtom(commandPaletteOpenAtom)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const setActiveId = useSetAtom(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const setMovePickerOpen = useSetAtom(moveDocumentPickerOpenAtom)
  const setFolders = useSetAtom(foldersAtom)
  const activeDocumentId = useAtomValue(activeDocumentIdAtom)
  const documents = useAtomValue(documentsAtom)
  const setTemplatePickerOpen = useSetAtom(templatePickerOpenAtom)
  const [themeSettings] = useAtom(themeSettingsAtom)
  const applyTheme = useSetAtom(applyThemeSettingsAtom)
  const [focusMode, setFocusMode] = useAtom(focusModeAtom)

  const activeDocument = useMemo(
    () => documents.find((doc) => doc.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  )

  const actions: PaletteItem[] = useMemo(
    () => [
      {
        type: 'action',
        id: 'new',
        label: 'Nový dokument',
        hint: '⌘N',
        icon: <Plus className="h-4 w-4" />,
        run: () => setTemplatePickerOpen(true),
      },
      ...(activeDocument
        ? [
            {
              type: 'action' as const,
              id: 'focus-mode',
              label: focusMode ? 'Vypnúť režim sústredenia' : 'Zapnúť režim sústredenia',
              hint: '⌘⇧F',
              icon: <Focus className="h-4 w-4" />,
              run: () => setFocusMode((enabled) => !enabled),
            },
            {
              type: 'action' as const,
              id: 'duplicate',
              label: 'Duplikovať dokument',
              hint: activeDocument.title,
              icon: <Copy className="h-4 w-4" />,
              run: () => {
                void (async () => {
                  try {
                    const copy = await duplicateDocument(
                      activeDocument.id,
                      `${activeDocument.title} (kópia)`,
                    )
                    setDocuments((prev) => prependDocumentSummary(prev, copy))
                    setActiveId(copy.id)
                    setActiveDocument(copy)
                    toast.success('Dokument duplikovaný', copy.title)
                    navigate(ROUTES.document(copy.id))
                  } catch (error) {
                    toast.error('Duplikovanie zlyhalo', error instanceof Error ? error.message : undefined)
                  }
                })()
              },
            },
            {
              type: 'action' as const,
              id: 'move-folder',
              label: 'Presunúť do priečinka',
              hint: activeDocument.title,
              icon: <FolderInput className="h-4 w-4" />,
              run: () => {
                setOpen(false)
                setMovePickerOpen(true)
              },
            },
          ]
        : []),
      {
        type: 'action',
        id: 'settings',
        label: 'Nastavenia',
        hint: '⌘,',
        icon: <Settings2 className="h-4 w-4" />,
        run: () => navigate(ROUTES.settingsSection('appearance')),
      },
      {
        type: 'action',
        id: 'theme',
        label: 'Prepínať tému',
        hint: '⌘⇧L',
        icon: <Moon className="h-4 w-4" />,
        run: () => {
          const next = cycleThemeId(themeSettings.themeId)
          applyTheme(createThemeSelection(themeSettings, next))
        },
      },
      {
        type: 'action',
        id: 'random-theme',
        label: 'Náhodná téma',
        hint: 'Vygenerovať vlastnú paletu',
        icon: <Shuffle className="h-4 w-4" />,
        run: () => {
          applyTheme(createCustomThemeSelection(themeSettings, generateRandomTheme()))
        },
      },
      {
        type: 'action',
        id: 'folder',
        label: 'Nový priečinok',
        icon: <FolderPlus className="h-4 w-4" />,
        run: () => {
          void (async () => {
            const name = await promptInput({
              title: 'Nový priečinok',
              defaultValue: 'Nový priečinok',
              placeholder: 'Názov priečinka',
              confirmLabel: 'Vytvoriť',
            })
            if (!name) return
            const folder = await createFolder({ name })
            setFolders((prev) => [...prev, folder])
            toast.success('Priečinok vytvorený', folder.name)
          })()
        },
      },
    ],
    [activeDocument, applyTheme, focusMode, navigate, setActiveDocument, setActiveId, setDocuments, setFocusMode, setFolders, setMovePickerOpen, setOpen, setTemplatePickerOpen, themeSettings],
  )

  const documentItems: PaletteItem[] = useMemo(
    () =>
      hits.map((hit) => ({
        type: 'document' as const,
        id: hit.documentId,
        label: hit.title,
        hint: hit.snippet.replace(/<\/?mark>/g, ''),
        icon: <FileText className="h-4 w-4" />,
        run: () => {
          setActiveId(hit.documentId)
          navigate(ROUTES.document(hit.documentId))
        },
      })),
    [hits, navigate, setActiveId],
  )

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter(
      (item) => item.label.toLowerCase().includes(q) || item.hint?.toLowerCase().includes(q),
    )
  }, [actions, query])

  const items = useMemo(
    () => [...filteredActions, ...documentItems],
    [filteredActions, documentItems],
  )

  const runSearch = useMemo(
    () =>
      debounce(async (value: string) => {
        const q = value.trim()
        if (q.length < 2) {
          setHits([])
          return
        }
        try {
          const results = await searchDocuments(q, 12)
          setHits(results)
        } catch {
          setHits([])
        }
      }, 200),
    [],
  )

  useEffect(() => {
    if (!open) return
    setQuery('')
    setHits([])
    setSelected(0)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    setSelected(0)
    runSearch(query)
  }, [query, runSearch])

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelected((index) => Math.min(index + 1, Math.max(items.length - 1, 0)))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelected((index) => Math.max(index - 1, 0))
      }
      if (event.key === 'Enter' && items[selected]) {
        event.preventDefault()
        items[selected].run()
        setOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [items, open, selected, setOpen])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && (
        <DialogContent className="top-[12vh] max-w-[560px] translate-y-0 gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-4 py-3.5">
          <Search className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <input
            ref={inputRef}
            className="flex-1 border-none bg-transparent text-[15px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]"
            placeholder="Hľadať dokumenty alebo príkazy…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd className="rounded-md border border-[var(--color-border)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted-foreground)]">
            ⌘K
          </kbd>
        </div>

        <div className="max-h-[360px] overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-[var(--color-muted-foreground)]">
              Žiadne výsledky
            </p>
          ) : (
            items.map((item, index) => (
              <button
                key={`${item.type}-${item.id}`}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition-colors',
                  index === selected && 'bg-[var(--color-selection)]',
                  index !== selected && 'hover:bg-[var(--color-hover)]',
                )}
                onMouseEnter={() => setSelected(index)}
                onClick={() => {
                  item.run()
                  setOpen(false)
                }}
              >
                <span className="text-[var(--color-muted-foreground)]">{item.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-[var(--color-foreground)]">
                    {item.label}
                  </span>
                  {item.hint && (
                    <span className="block truncate text-[11px] text-[var(--color-muted-foreground)]">
                      {item.hint}
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
