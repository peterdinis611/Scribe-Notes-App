import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  Copy,
  FileText,
  Focus,
  BookOpen,
  FolderInput,
  FolderPlus,
  Moon,
  Plus,
  Search,
  Settings2,
  Shuffle,
  Sparkles,
  StickyNote,
} from 'lucide-react'
import { openQuickNote } from '@/lib/quick-note'
import { getDisplayKeysForShortcut } from '@/lib/shortcuts'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { createFolder, duplicateDocument, searchDocuments } from '@/lib/db/api'
import type { SearchHit } from '@/lib/db/api'
import { promptInput } from '@/lib/input-dialog'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import { cn, debounce } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { cycleThemeId } from '@/lib/themes/apply'
import { generateRandomTheme } from '@/lib/themes/generate-random-theme'
import { useOpenDemoGuide } from '@/hooks/useOpenDemoGuide'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setActiveDocumentId,
  toggleFocusMode,
  toggleReadingMode,
  updateDocuments,
} from '@/store/documentsSlice'
import {
  setCommandPaletteOpen,
  setMoveDocumentPickerOpen,
  updateFolders,
} from '@/store/foldersSlice'
import { setTemplatePickerOpen, setThemeSettings } from '@/store/settingsSlice'
import {
  createCustomThemeSelection,
  createThemeSelection,
} from '@/store/settings-helpers'

type PaletteItem =
  | { type: 'action'; id: string; label: string; hint?: string; icon: React.ReactNode; run: () => void }
  | {
      type: 'document'
      id: string
      label: string
      snippetHtml?: string
      icon: React.ReactNode
      run: () => void
    }

function sanitizeSnippet(html: string): string {
  return html.replace(/<(?!\/?mark>)[^>]+>/gi, '')
}

export function CommandPalette() {
  const open = useAppSelector((state) => state.folders.commandPaletteOpen)
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const activeDocumentId = useAppSelector((state) => state.documents.activeDocumentId)
  const documents = useAppSelector((state) => state.documents.documents)
  const themeSettings = useAppSelector((state) => state.settings.themeSettings)
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const readingMode = useAppSelector((state) => state.documents.readingMode)
  const shortcutOverrides = useAppSelector((state) => state.settings.shortcutOverrides)
  const openDemoGuide = useOpenDemoGuide()

  const activeDocument = useMemo(
    () => documents.find((doc) => doc.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  )

  const actions: PaletteItem[] = useMemo(
    () => [
      {
        type: 'action',
        id: 'new',
        label: t('commandPalette.newDocument'),
        hint: getDisplayKeysForShortcut('newDocument', shortcutOverrides).join(''),
        icon: <Plus className="h-4 w-4" />,
        run: () => dispatch(setTemplatePickerOpen(true)),
      },
      {
        type: 'action',
        id: 'quick-note',
        label: t('commandPalette.quickNote'),
        hint: getDisplayKeysForShortcut('quickNote', shortcutOverrides).join(''),
        icon: <StickyNote className="h-4 w-4" />,
        run: () => {
          void openQuickNote(documents, dispatch, navigate, (key) => t(key))
        },
      },
      {
        type: 'action',
        id: 'demo-guide',
        label: t('commandPalette.demoDocument'),
        hint: t('commandPalette.demoHint'),
        icon: <Sparkles className="h-4 w-4" />,
        run: () => void openDemoGuide(),
      },
      ...(activeDocument
        ? [
            {
              type: 'action' as const,
              id: 'focus-mode',
              label: focusMode ? t('commandPalette.focusOff') : t('commandPalette.focusOn'),
              hint: getDisplayKeysForShortcut('focusMode', shortcutOverrides).join(''),
              icon: <Focus className="h-4 w-4" />,
              run: () => dispatch(toggleFocusMode()),
            },
            {
              type: 'action' as const,
              id: 'reading-mode',
              label: readingMode ? t('commandPalette.readingOff') : t('commandPalette.readingOn'),
              hint: getDisplayKeysForShortcut('readingMode', shortcutOverrides).join(''),
              icon: <BookOpen className="h-4 w-4" />,
              run: () => dispatch(toggleReadingMode()),
            },
            {
              type: 'action' as const,
              id: 'duplicate',
              label: t('commandPalette.duplicate'),
              hint: activeDocument.title,
              icon: <Copy className="h-4 w-4" />,
              run: () => {
                void (async () => {
                  try {
                    const copy = await duplicateDocument(
                      activeDocument.id,
                      `${activeDocument.title} ${t('common.copySuffix')}`,
                    )
                    dispatch(updateDocuments((prev) => prependDocumentSummary(prev, copy)))
                    dispatch(setActiveDocumentId(copy.id))
                    dispatch(setActiveDocument(copy))
                    toast.success(t('toasts.documentDuplicated'), copy.title)
                    navigate(ROUTES.document(copy.id))
                  } catch (error) {
                    toast.error(
                      t('toasts.duplicateError'),
                      error instanceof Error ? error.message : undefined,
                    )
                  }
                })()
              },
            },
            {
              type: 'action' as const,
              id: 'move-folder',
              label: t('commandPalette.moveToFolder'),
              hint: activeDocument.title,
              icon: <FolderInput className="h-4 w-4" />,
              run: () => {
                dispatch(setCommandPaletteOpen(false))
                dispatch(setMoveDocumentPickerOpen(true))
              },
            },
          ]
        : []),
      {
        type: 'action',
        id: 'settings',
        label: t('commandPalette.settings'),
        hint: getDisplayKeysForShortcut('settings', shortcutOverrides).join(''),
        icon: <Settings2 className="h-4 w-4" />,
        run: () => navigate(ROUTES.settingsSection('appearance')),
      },
      {
        type: 'action',
        id: 'theme',
        label: t('commandPalette.toggleTheme'),
        hint: getDisplayKeysForShortcut('toggleTheme', shortcutOverrides).join(''),
        icon: <Moon className="h-4 w-4" />,
        run: () => {
          const next = cycleThemeId(themeSettings.themeId)
          dispatch(setThemeSettings(createThemeSelection(themeSettings, next)))
        },
      },
      {
        type: 'action',
        id: 'random-theme',
        label: t('commandPalette.randomTheme'),
        hint: t('commandPalette.randomThemeHint'),
        icon: <Shuffle className="h-4 w-4" />,
        run: () => {
          dispatch(setThemeSettings(createCustomThemeSelection(themeSettings, generateRandomTheme())))
        },
      },
      {
        type: 'action',
        id: 'folder',
        label: t('commandPalette.newFolder'),
        icon: <FolderPlus className="h-4 w-4" />,
        run: () => {
          void (async () => {
            const name = await promptInput({
              title: t('commandPalette.newFolderTitle'),
              defaultValue: t('commandPalette.newFolderTitle'),
              placeholder: t('commandPalette.newFolderPlaceholder'),
              confirmLabel: t('common.create'),
            })
            if (!name) return
            const folder = await createFolder({ name })
            dispatch(updateFolders((prev) => [...prev, folder]))
            toast.success(t('toasts.folderCreated'), folder.name)
          })()
        },
      },
    ],
    [
      activeDocument,
      dispatch,
      documents,
      focusMode,
      navigate,
      openDemoGuide,
      readingMode,
      shortcutOverrides,
      t,
      themeSettings,
    ],
  )

  const documentItems: PaletteItem[] = useMemo(
    () =>
      hits.map((hit) => ({
        type: 'document' as const,
        id: hit.documentId,
        label: hit.title,
        snippetHtml: hit.snippet,
        icon: <FileText className="h-4 w-4" />,
        run: () => {
          dispatch(setActiveDocumentId(hit.documentId))
          navigate(ROUTES.document(hit.documentId))
        },
      })),
    [dispatch, hits, navigate],
  )

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter((item) => {
      const hint = item.type === 'action' ? item.hint : undefined
      return item.label.toLowerCase().includes(q) || hint?.toLowerCase().includes(q)
    })
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
        dispatch(setCommandPaletteOpen(false))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, items, open, selected])

  return (
    <Dialog open={open} onOpenChange={(next) => dispatch(setCommandPaletteOpen(next))}>
      {open && (
        <DialogContent className="top-[12vh] max-w-[560px] translate-y-0 gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-4 py-3.5">
          <Search className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <input
            ref={inputRef}
            className="flex-1 border-none bg-transparent text-[15px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]"
            placeholder={t('commandPalette.placeholder')}
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
              {t('commandPalette.noResults')}
            </p>
          ) : (
            <>
              {filteredActions.length > 0 && (
                <>
                  <p className="command-palette-section-label">{t('commandPalette.sectionActions')}</p>
                  {filteredActions.map((item, index) => (
                    <PaletteRow
                      key={`${item.type}-${item.id}`}
                      item={item}
                      selected={selected === index}
                      onSelect={() => setSelected(index)}
                      onRun={() => {
                        item.run()
                        dispatch(setCommandPaletteOpen(false))
                      }}
                    />
                  ))}
                </>
              )}
              {documentItems.length > 0 && (
                <>
                  <p className="command-palette-section-label">{t('commandPalette.sectionDocuments')}</p>
                  {documentItems.map((item, index) => {
                    const flatIndex = filteredActions.length + index
                    return (
                      <PaletteRow
                        key={`${item.type}-${item.id}`}
                        item={item}
                        selected={selected === flatIndex}
                        onSelect={() => setSelected(flatIndex)}
                        onRun={() => {
                          item.run()
                          dispatch(setCommandPaletteOpen(false))
                        }}
                      />
                    )
                  })}
                </>
              )}
            </>
          )}
        </div>
        </DialogContent>
      )}
    </Dialog>
  )
}

function PaletteRow({
  item,
  selected,
  onSelect,
  onRun,
}: {
  item: PaletteItem
  selected: boolean
  onSelect: () => void
  onRun: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition-colors',
        selected && 'bg-[var(--color-selection)]',
        !selected && 'hover:bg-[var(--color-hover)]',
      )}
      onMouseEnter={onSelect}
      onClick={onRun}
    >
      <span className="text-[var(--color-muted-foreground)]">{item.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-[var(--color-foreground)]">
          {item.label}
        </span>
        {item.type === 'document' && item.snippetHtml ? (
          <span
            className="command-palette-snippet block truncate text-[11px] text-[var(--color-muted-foreground)]"
            dangerouslySetInnerHTML={{ __html: sanitizeSnippet(item.snippetHtml) }}
          />
        ) : item.type === 'action' && item.hint ? (
          <span className="block truncate text-[11px] text-[var(--color-muted-foreground)]">
            {item.hint}
          </span>
        ) : null}
      </span>
    </button>
  )
}
