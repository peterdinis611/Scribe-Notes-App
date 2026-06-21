import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useNavigate } from '@tanstack/react-router'
import {
  FileText,
  FolderInput,
  FolderPlus,
  Moon,
  Plus,
  Search,
  Settings2,
} from 'lucide-react'
import { searchDocuments } from '@/lib/db/api'
import type { SearchHit } from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { cn, debounce } from '@/lib/utils'
import { activeDocumentIdAtom, documentsAtom } from '@/store/documents'
import { commandPaletteOpenAtom, moveDocumentPickerOpenAtom } from '@/store/folders'
import { templatePickerOpenAtom } from '@/store/settings'
import { cycleThemeId } from '@/lib/themes/apply'
import { applyThemeSettingsAtom, createThemeSelection, themeSettingsAtom } from '@/store/settings'

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
  const setMovePickerOpen = useSetAtom(moveDocumentPickerOpenAtom)
  const activeDocumentId = useAtomValue(activeDocumentIdAtom)
  const documents = useAtomValue(documentsAtom)
  const setTemplatePickerOpen = useSetAtom(templatePickerOpenAtom)
  const [themeSettings] = useAtom(themeSettingsAtom)
  const applyTheme = useSetAtom(applyThemeSettingsAtom)

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
        id: 'folder',
        label: 'Nový priečinok',
        icon: <FolderPlus className="h-4 w-4" />,
        run: () => {
          void (async () => {
            const { createFolder, listFolders } = await import('@/lib/db/api')
            const name = window.prompt('Názov priečinka', 'Nový priečinok')
            if (!name?.trim()) return
            await createFolder({ name: name.trim() })
            await listFolders()
          })()
        },
      },
    ],
    [activeDocument, applyTheme, navigate, setMovePickerOpen, setOpen, setTemplatePickerOpen, themeSettings],
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
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
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

  if (!open) return null

  return (
    <div className="command-palette-backdrop titlebar-no-drag" onClick={() => setOpen(false)}>
      <div className="command-palette" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Príkazová paleta">
        <div className="command-palette-input-wrap">
          <Search className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <input
            ref={inputRef}
            className="command-palette-input"
            placeholder="Hľadať dokumenty alebo príkazy…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd className="command-palette-kbd">⌘K</kbd>
        </div>

        <div className="command-palette-results">
          {items.length === 0 ? (
            <p className="command-palette-empty">Žiadne výsledky</p>
          ) : (
            items.map((item, index) => (
              <button
                key={`${item.type}-${item.id}`}
                type="button"
                className={cn('command-palette-item', index === selected && 'is-active')}
                onMouseEnter={() => setSelected(index)}
                onClick={() => {
                  item.run()
                  setOpen(false)
                }}
              >
                <span className="command-palette-item-icon">{item.icon}</span>
                <span className="command-palette-item-body">
                  <span className="command-palette-item-label">{item.label}</span>
                  {item.hint && <span className="command-palette-item-hint">{item.hint}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
