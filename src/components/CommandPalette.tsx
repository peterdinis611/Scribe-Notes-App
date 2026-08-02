import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  Columns2,
  CalendarDays,
  Copy,
  FileText,
  Focus,
  BookOpen,
  FolderInput,
  FolderPlus,
  Languages,
  Moon,
  Plus,
  Search,
  Settings2,
  Shuffle,
  Sparkles,
  StickyNote,
  Pin,
  RotateCcw,
} from 'lucide-react'
import { AI_ACTION_IDS } from '@/lib/ai/actions'
import { isAiAvailable } from '@/lib/ai/config'
import { DOCUMENT_AI_ACTION_IDS } from '@/lib/ai/types'
import { runAiEditorAction } from '@/lib/ai/run-action'
import { editorRefs } from '@/store/editorRefs'
import { openQuickNote } from '@/lib/quick-note'
import { openTodayNote, openThisWeekNote } from '@/lib/journal-notes'
import { getDisplayKeysForShortcut } from '@/lib/shortcuts'
import type { AppLocale } from '@/i18n'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { createFolder, duplicateDocument, searchDocuments, setDocumentPinned } from '@/lib/db/api'
import type { SearchHit } from '@/lib/db/api'
import { promptInput } from '@/lib/input-dialog'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import { cn, debounce } from '@/lib/utils'
import { sanitizeSnippet } from '@/lib/search-snippet'
import { toast } from '@/lib/toast'
import { cycleThemeId } from '@/lib/themes/apply'
import { generateRandomTheme } from '@/lib/themes/generate-random-theme'
import { useOpenDemoGuide } from '@/hooks/useOpenDemoGuide'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setActiveDocumentId,
  setPendingEditorSearch,
  setSecondaryDocumentId,
  toggleFocusMode,
  toggleReadingMode,
  updateDocuments,
} from '@/store/documentsSlice'
import {
  setCommandPaletteOpen,
  setMoveDocumentPickerOpen,
  updateFolders,
} from '@/store/foldersSlice'
import { setTemplatePickerOpen, setThemeSettings, setLocale } from '@/store/settingsSlice'
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
  const recentDocumentIds = useAppSelector((state) => state.documents.recentDocumentIds)
  const recentlyClosedIds = useAppSelector((state) => state.documents.recentlyClosedIds)
  const secondaryDocumentId = useAppSelector((state) => state.documents.secondaryDocumentId)
  const openDocumentIds = useAppSelector((state) => state.documents.openDocumentIds)
  const folders = useAppSelector((state) => state.folders.folders)
  const themeSettings = useAppSelector((state) => state.settings.themeSettings)
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const readingMode = useAppSelector((state) => state.documents.readingMode)
  const shortcutOverrides = useAppSelector((state) => state.settings.shortcutOverrides)
  const locale = useAppSelector((state) => state.settings.locale)
  const aiSettings = useAppSelector((state) => state.settings.aiSettings)
  const openDemoGuide = useOpenDemoGuide()
  const aiEnabled = isAiAvailable(aiSettings)

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
      ...(aiEnabled
        ? AI_ACTION_IDS.map(
            (action): PaletteItem => ({
              type: 'action',
              id: `ai-${action}`,
              label: t(`commandPalette.ai.${action}`, { defaultValue: t(`ai.actions.${action}`) }),
              hint: DOCUMENT_AI_ACTION_IDS.includes(action)
                ? t('commandPalette.aiDocumentHint')
                : t('commandPalette.aiHint'),
              icon: <Sparkles className="h-4 w-4" />,
              run: () => {
                void runAiEditorAction(editorRefs.editor, action)
              },
            }),
          )
        : []),
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
      ...(recentlyClosedIds[0]
        ? [
            {
              type: 'action' as const,
              id: 'reopen-closed',
              label: t('commandPalette.reopenClosed'),
              hint:
                documents.find((doc) => doc.id === recentlyClosedIds[0])?.title ??
                t('commandPalette.reopenClosedHint'),
              icon: <RotateCcw className="h-4 w-4" />,
              run: () => {
                const id = recentlyClosedIds[0]
                if (!id) return
                dispatch(setActiveDocumentId(id))
                const cached = peekCachedDocument(id)
                if (cached) dispatch(setActiveDocument(cached))
                navigate(ROUTES.document(id))
              },
            },
          ]
        : []),
      {
        type: 'action',
        id: 'today-note',
        label: t('commandPalette.todayNote'),
        hint: getDisplayKeysForShortcut('todayNote', shortcutOverrides).join(''),
        icon: <CalendarDays className="h-4 w-4" />,
        run: () => {
          void openTodayNote({
            documents,
            folders,
            dispatch,
            navigate,
            t: (key, options) => t(key, options),
          }).catch((error) => toast.error(t('journal.openError'), String(error)))
        },
      },
      {
        type: 'action',
        id: 'week-note',
        label: t('commandPalette.weekNote'),
        icon: <CalendarDays className="h-4 w-4" />,
        run: () => {
          void openThisWeekNote({
            documents,
            folders,
            dispatch,
            navigate,
            t: (key, options) => t(key, options),
          }).catch((error) => toast.error(t('journal.openError'), String(error)))
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
            ...(secondaryDocumentId
              ? [
                  {
                    type: 'action' as const,
                    id: 'close-split',
                    label: t('commandPalette.closeSplit'),
                    icon: <Columns2 className="h-4 w-4" />,
                    run: () => dispatch(setSecondaryDocumentId(null)),
                  },
                ]
              : (() => {
                  const candidateId =
                    openDocumentIds.find((id) => id !== activeDocument.id) ??
                    recentDocumentIds.find((id) => id !== activeDocument.id) ??
                    null
                  if (!candidateId) return []
                  return [
                    {
                      type: 'action' as const,
                      id: 'open-split',
                      label: t('commandPalette.openSplit'),
                      hint: documents.find((doc) => doc.id === candidateId)?.title,
                      icon: <Columns2 className="h-4 w-4" />,
                      run: () => dispatch(setSecondaryDocumentId(candidateId)),
                    },
                  ]
                })()),
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
            {
              type: 'action' as const,
              id: 'pin-document',
              label: activeDocument.isPinned
                ? t('commandPalette.unpinDocument')
                : t('commandPalette.pinDocument'),
              hint: activeDocument.title,
              icon: <Pin className="h-4 w-4" />,
              run: () => {
                const id = activeDocument.id
                const next = !activeDocument.isPinned
                dispatch(
                  updateDocuments((prev) =>
                    prev.map((doc) => (doc.id === id ? { ...doc, isPinned: next } : doc)),
                  ),
                )
                void setDocumentPinned(id, next).catch((error) => {
                  dispatch(
                    updateDocuments((prev) =>
                      prev.map((doc) => (doc.id === id ? { ...doc, isPinned: !next } : doc)),
                    ),
                  )
                  toast.error(t('toasts.pinError'), String(error))
                })
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
        id: 'docs',
        label: t('commandPalette.docs'),
        icon: <BookOpen className="h-4 w-4" />,
        run: () => navigate(ROUTES.docs()),
      },
      {
        type: 'action',
        id: 'language',
        label:
          locale === 'sk'
            ? t('commandPalette.switchToEnglish')
            : t('commandPalette.switchToSlovak'),
        hint: locale === 'sk' ? 'EN' : 'SK',
        icon: <Languages className="h-4 w-4" />,
        run: () => {
          const next: AppLocale = locale === 'sk' ? 'en' : 'sk'
          dispatch(setLocale(next))
          toast.success(t('toasts.localeChanged'), t(`settings.language.${next}`))
        },
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
      aiEnabled,
      activeDocument,
      dispatch,
      documents,
      folders,
      focusMode,
      navigate,
      openDemoGuide,
      readingMode,
      recentlyClosedIds,
      recentDocumentIds,
      secondaryDocumentId,
      openDocumentIds,
      locale,
      shortcutOverrides,
      t,
      themeSettings,
    ],
  )

  const documentItems: PaletteItem[] = useMemo(() => {
    if (hits.length > 0) {
      return hits.map((hit) => ({
        type: 'document' as const,
        id: hit.documentId,
        label: hit.title,
        snippetHtml: hit.snippet,
        icon: <FileText className="h-4 w-4" />,
        run: () => {
          const q = query.trim()
          if (q) dispatch(setPendingEditorSearch(q))
          dispatch(setActiveDocumentId(hit.documentId))
          navigate(ROUTES.document(hit.documentId))
        },
      }))
    }

    if (query.trim().length > 0) return []

    const byId = new Map(
      documents.filter((doc) => doc.deletedAt == null).map((doc) => [doc.id, doc]),
    )
    return recentDocumentIds
      .map((id) => byId.get(id))
      .filter((doc): doc is NonNullable<typeof doc> => doc != null)
      .slice(0, 8)
      .map((doc) => ({
        type: 'document' as const,
        id: doc.id,
        label: doc.title,
        icon: <FileText className="h-4 w-4" />,
        run: () => {
          dispatch(setActiveDocumentId(doc.id))
          const cached = peekCachedDocument(doc.id)
          if (cached) dispatch(setActiveDocument(cached))
          navigate(ROUTES.document(doc.id))
        },
      }))
  }, [dispatch, documents, hits, navigate, query, recentDocumentIds])

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
                  <p className="command-palette-section-label">
                    {hits.length > 0
                      ? t('commandPalette.sectionDocuments')
                      : t('commandPalette.sectionRecent')}
                  </p>
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
