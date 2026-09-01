import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  FolderOpen,
  FolderPlus,
  GitBranch,
  Heading,
  Languages,
  LayoutTemplate,
  Link2,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings2,
  Shuffle,
  Sparkles,
  StickyNote,
  Pin,
  RotateCcw,
  Tag,
} from 'lucide-react'
import { openQuickNote } from '@/lib/quick-note'
import {
  openEveningNote,
  openMorningNote,
  openThisWeekNote,
  openTodayNote,
  openTomorrowNote,
  openYesterdayNote,
} from '@/lib/journal-notes'
import { getDisplayKeysForShortcut } from '@/lib/shortcuts'
import type { AppLocale } from '@/i18n'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { createFolder, duplicateDocument, listCommentThreads, listLinkGraph, searchDocuments, setDocumentPinned } from '@/lib/db/api'
import { nlpSemanticSearch, nlpStatus, type NlpStatus } from '@/lib/db/nlp-api'
import { describeNlpSearchFailure } from '@/lib/nlp/errors'
import { toast } from '@/lib/toast'
import type { SearchHit } from '@/lib/db/api'
import { promptInput } from '@/lib/input-dialog'
import { collectHeadingOutline, focusOutlineItem } from '@/lib/editor/document-outline'
import { focusComment } from '@/lib/editor/comments'
import { collectHeadingsFromJson } from '@/lib/search/palette-headings'
import { editorRefs } from '@/store/editorRefs'
import { getCachedParsedContent, peekCachedDocument } from '@/lib/cache/document-cache'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import { cn, debounce } from '@/lib/utils'
import { sanitizeSnippet } from '@/lib/search-snippet'
import { cycleThemeId } from '@/lib/themes/apply'
import { generateRandomTheme } from '@/lib/themes/generate-random-theme'
import { useOpenDemoGuide } from '@/hooks/useOpenDemoGuide'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setActiveDocumentId,
  setActiveTagFilter,
  setCommentsPanelOpen,
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
import { setSaveCustomTemplateDialog } from '@/store/templatesSlice'

type SearchScope = 'all' | 'titles' | 'headings' | 'tags' | 'content' | 'wiki' | 'comments' | 'semantic'

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
  | {
      type: 'heading'
      id: string
      label: string
      hint?: string
      icon: React.ReactNode
      run: () => void
    }
  | {
      type: 'tag'
      id: string
      label: string
      hint?: string
      icon: React.ReactNode
      run: () => void
    }

const SEARCH_SCOPES: SearchScope[] = ['all', 'titles', 'headings', 'tags', 'content', 'semantic', 'wiki', 'comments']

export function CommandPalette() {
  const open = useAppSelector((state) => state.folders.commandPaletteOpen)
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [semanticHits, setSemanticHits] = useState<SearchHit[]>([])
  const [nlpEnabled, setNlpEnabled] = useState(false)
  const [nlpStatusState, setNlpStatusState] = useState<NlpStatus | null>(null)
  const [semanticError, setSemanticError] = useState<string | null>(null)
  const [selected, setSelected] = useState(0)
  const [searchScope, setSearchScope] = useState<SearchScope>('all')
  const [folderOnly, setFolderOnly] = useState(false)
  const [linkedTargetIds, setLinkedTargetIds] = useState<Set<string>>(new Set())
  const [commentHits, setCommentHits] = useState<
    Array<{ id: string; body: string; quote: string; documentId: string; documentTitle: string }>
  >([])
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const activeDocumentId = useAppSelector((state) => state.documents.activeDocumentId)
  const activeDocumentRecord = useAppSelector((state) => state.documents.activeDocument)
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
  const openDemoGuide = useOpenDemoGuide()

  const activeDocument = useMemo(
    () => documents.find((doc) => doc.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  )

  const journalArgs = useMemo(
    () => ({
      documents,
      folders,
      dispatch,
      navigate,
      t: (key: string, options?: Record<string, unknown>) => t(key, options),
    }),
    [dispatch, documents, folders, navigate, t],
  )

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void listLinkGraph()
      .then((graph) => {
        if (cancelled) return
        const ids = new Set<string>()
        for (const edge of graph.edges) ids.add(edge.targetId)
        setLinkedTargetIds(ids)
      })
      .catch(() => {
        if (!cancelled) setLinkedTargetIds(new Set())
      })
    return () => {
      cancelled = true
    }
  }, [open, documents.length])

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
      ...(activeDocument
        ? [
            {
              type: 'action' as const,
              id: 'save-as-template',
              label: t('fileMenu.saveAsTemplate'),
              icon: <LayoutTemplate className="h-4 w-4" />,
              run: () => {
                const doc =
                  activeDocumentRecord ??
                  (activeDocument ? peekCachedDocument(activeDocument.id) : null)
                if (!doc) return
                dispatch(
                  setSaveCustomTemplateDialog({
                    open: true,
                    content: getCachedParsedContent(doc),
                    suggestedName: activeDocument.title,
                    suggestedTitle: activeDocument.title,
                  }),
                )
              },
            },
          ]
        : []),
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
          void openTodayNote(journalArgs).catch((error) => toast.error(t('journal.openError'), String(error)))
        },
      },
      {
        type: 'action',
        id: 'yesterday-note',
        label: t('commandPalette.yesterdayNote'),
        icon: <CalendarDays className="h-4 w-4" />,
        run: () => {
          void openYesterdayNote(journalArgs).catch((error) => toast.error(t('journal.openError'), String(error)))
        },
      },
      {
        type: 'action',
        id: 'tomorrow-note',
        label: t('commandPalette.tomorrowNote'),
        icon: <CalendarDays className="h-4 w-4" />,
        run: () => {
          void openTomorrowNote(journalArgs).catch((error) => toast.error(t('journal.openError'), String(error)))
        },
      },
      {
        type: 'action',
        id: 'morning-note',
        label: t('commandPalette.morningNote'),
        icon: <CalendarDays className="h-4 w-4" />,
        run: () => {
          void openMorningNote(journalArgs).catch((error) => toast.error(t('journal.openError'), String(error)))
        },
      },
      {
        type: 'action',
        id: 'evening-note',
        label: t('commandPalette.eveningNote'),
        icon: <CalendarDays className="h-4 w-4" />,
        run: () => {
          void openEveningNote(journalArgs).catch((error) => toast.error(t('journal.openError'), String(error)))
        },
      },
      {
        type: 'action',
        id: 'week-note',
        label: t('commandPalette.weekNote'),
        icon: <CalendarDays className="h-4 w-4" />,
        run: () => {
          void openThisWeekNote(journalArgs).catch((error) => toast.error(t('journal.openError'), String(error)))
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
        id: 'link-graph',
        label: t('commandPalette.linkGraph'),
        icon: <GitBranch className="h-4 w-4" />,
        run: () => navigate(ROUTES.graph()),
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
      activeDocument,
      activeDocumentRecord,
      dispatch,
      documents,
      folders,
      focusMode,
      journalArgs,
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

  const folderFilterId = folderOnly ? activeDocument?.folderId ?? '__none__' : null

  const matchesFolder = useCallback(
    (doc: { folderId: string | null }) => {
      if (!folderFilterId) return true
      if (folderFilterId === '__none__') return false
      return doc.folderId === folderFilterId
    },
    [folderFilterId],
  )

  const headingItems: PaletteItem[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || (searchScope !== 'all' && searchScope !== 'headings')) return []
    if (!activeDocumentRecord && !activeDocument) return []

    const editor = editorRefs.editor
    const headings =
      editor && !editor.isDestroyed
        ? collectHeadingOutline(editor).map((item) => item.preview || item.label)
        : collectHeadingsFromJson(activeDocumentRecord?.contentJson ?? '')

    return headings
      .filter((label) => label.toLowerCase().includes(q))
      .slice(0, 8)
      .map((label) => ({
        type: 'heading' as const,
        id: `heading:${label}`,
        label,
        hint: activeDocument?.title,
        icon: <Heading className="h-4 w-4" />,
        run: () => {
          const currentEditor = editorRefs.editor
          if (!currentEditor || currentEditor.isDestroyed) {
            dispatch(setPendingEditorSearch(label))
            return
          }
          const item = collectHeadingOutline(currentEditor).find(
            (entry) => (entry.preview || entry.label) === label,
          )
          if (item) {
            focusOutlineItem(currentEditor, item)
          } else {
            dispatch(setPendingEditorSearch(label))
          }
        },
      }))
  }, [activeDocument, activeDocumentRecord, dispatch, query, searchScope])

  const tagItems: PaletteItem[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || (searchScope !== 'all' && searchScope !== 'tags')) return []
    const tags = new Set<string>()
    for (const doc of documents) {
      if (doc.deletedAt != null) continue
      if (!matchesFolder(doc)) continue
      for (const tag of doc.tags) tags.add(tag)
    }
    return [...tags]
      .filter((tag) => tag.toLowerCase().includes(q))
      .sort()
      .slice(0, 8)
      .map((tag) => ({
        type: 'tag' as const,
        id: `tag:${tag}`,
        label: tag,
        hint: t('commandPalette.filterTags'),
        icon: <Tag className="h-4 w-4" />,
        run: () => {
          dispatch(setActiveTagFilter(tag))
          dispatch(setCommandPaletteOpen(false))
        },
      }))
  }, [dispatch, documents, matchesFolder, query, searchScope, t])

  const commentItems: PaletteItem[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || (searchScope !== 'all' && searchScope !== 'comments')) return []
    return commentHits
      .filter((hit) => hit.body.toLowerCase().includes(q) || hit.quote.toLowerCase().includes(q))
      .slice(0, 8)
      .map((hit) => ({
        type: 'action' as const,
        id: `comment:${hit.id}`,
        label: hit.body.slice(0, 80) || hit.quote.slice(0, 80),
        hint: hit.documentTitle,
        icon: <MessageSquare className="h-4 w-4" />,
        run: () => {
          dispatch(setActiveDocumentId(hit.documentId))
          const cached = peekCachedDocument(hit.documentId)
          if (cached) dispatch(setActiveDocument(cached))
          navigate(ROUTES.document(hit.documentId))
          window.setTimeout(() => {
            const editor = editorRefs.editor
            if (editor && !editor.isDestroyed) {
              focusComment(editor, hit.id)
              dispatch(setCommentsPanelOpen(true))
            }
          }, 120)
        },
      }))
  }, [commentHits, dispatch, navigate, query, searchScope])

  useEffect(() => {
    if (!open) return
    void nlpStatus()
      .then((status) => {
        setNlpStatusState(status)
        setNlpEnabled(status.enabled && status.sidecarOk)
      })
      .catch(() => {
        setNlpStatusState(null)
        setNlpEnabled(false)
      })
  }, [open, documents.length])

  const documentItems: PaletteItem[] = useMemo(() => {
    if (searchScope === 'headings' || searchScope === 'tags' || searchScope === 'comments') {
      return []
    }

    const byId = new Map(
      documents
        .filter((doc) => doc.deletedAt == null && matchesFolder(doc))
        .map((doc) => [doc.id, doc]),
    )

    const mapHit = (hit: SearchHit, icon: React.ReactNode): PaletteItem => ({
      type: 'document' as const,
      id: hit.documentId,
      label: hit.title,
      snippetHtml: hit.snippet,
      icon,
      run: () => {
        const q = query.trim()
        if (q) dispatch(setPendingEditorSearch(q))
        dispatch(setActiveDocumentId(hit.documentId))
        const cached = peekCachedDocument(hit.documentId)
        if (cached) dispatch(setActiveDocument(cached))
        navigate(ROUTES.document(hit.documentId))
      },
    })

    if (searchScope === 'semantic') {
      return semanticHits
        .filter((hit) => byId.has(hit.documentId))
        .map((hit) => mapHit(hit, <Sparkles className="h-4 w-4" />))
    }

    const merged = new Map<string, PaletteItem>()
    if (hits.length > 0 && (searchScope === 'all' || searchScope === 'content')) {
      for (const hit of hits.filter((item) => byId.has(item.documentId))) {
        merged.set(hit.documentId, mapHit(hit, <FileText className="h-4 w-4" />))
      }
    }
    if (semanticHits.length > 0 && (searchScope === 'all' || searchScope === 'content')) {
      for (const hit of semanticHits.filter((item) => byId.has(item.documentId))) {
        if (!merged.has(hit.documentId)) {
          merged.set(hit.documentId, mapHit(hit, <Sparkles className="h-4 w-4" />))
        }
      }
    }
    if (merged.size > 0) {
      return [...merged.values()]
    }

    const q = query.trim().toLowerCase()
    if (q.length > 0) {
      if (searchScope === 'wiki') {
        return [...byId.values()]
          .filter((doc) => linkedTargetIds.has(doc.id) && doc.title.toLowerCase().includes(q))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 10)
          .map((doc) => ({
            type: 'document' as const,
            id: doc.id,
            label: doc.title,
            icon: <Link2 className="h-4 w-4" />,
            run: () => {
              dispatch(setActiveDocumentId(doc.id))
              const cached = peekCachedDocument(doc.id)
              if (cached) dispatch(setActiveDocument(cached))
              navigate(ROUTES.document(doc.id))
            },
          }))
      }

      if (searchScope === 'all' || searchScope === 'titles') {
        return [...byId.values()]
          .map((doc) => {
            const title = doc.title.toLowerCase()
            let points = 0
            if (title === q) points = 100
            else if (title.startsWith(q)) points = 80
            else if (title.includes(q)) points = 50
            else if (q.split(/\s+/).every((token) => title.includes(token))) points = 30
            return { doc, points }
          })
          .filter((entry) => entry.points > 0)
          .sort((a, b) => b.points - a.points || b.doc.updatedAt - a.doc.updatedAt)
          .slice(0, 10)
          .map(({ doc }) => ({
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
      }

      return []
    }

    if (searchScope !== 'all' && searchScope !== 'titles') return []

    const recent = recentDocumentIds
      .map((id) => byId.get(id))
      .filter((doc): doc is NonNullable<typeof doc> => doc != null)
      .slice(0, 8)

    return recent.map((doc) => ({
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
  }, [
    dispatch,
    documents,
    hits,
    linkedTargetIds,
    matchesFolder,
    navigate,
    query,
    recentDocumentIds,
    searchScope,
    semanticHits,
  ])

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    const tokens = q.split(/\s+/).filter(Boolean)
    function score(label: string, hint?: string) {
      const hay = `${label} ${hint ?? ''}`.toLowerCase()
      if (hay.includes(q)) return 100 - hay.indexOf(q)
      let points = 0
      for (const token of tokens) {
        if (hay.includes(token)) points += 20
        else if (label.toLowerCase().split(/\s+/).some((part) => part.startsWith(token))) points += 12
      }
      return points
    }
    return actions
      .map((item) => {
        const hint = item.type === 'action' ? item.hint : undefined
        return { item, points: score(item.label, hint) }
      })
      .filter((entry) => entry.points > 0)
      .sort((a, b) => b.points - a.points)
      .map((entry) => entry.item)
  }, [actions, query])

  const searchItems = useMemo(
    () => [...headingItems, ...tagItems, ...commentItems],
    [commentItems, headingItems, tagItems],
  )

  const items = useMemo(
    () => [...filteredActions, ...searchItems, ...documentItems],
    [documentItems, filteredActions, searchItems],
  )

  const runSearch = useMemo(
    () =>
      debounce(async (value: string, scope: SearchScope) => {
        const q = value.trim()
        if (q.length < 2 || scope === 'headings' || scope === 'tags' || scope === 'wiki' || scope === 'titles') {
          setHits([])
          setSemanticHits([])
          return
        }

        const runSemantic =
          scope === 'semantic' || (scope === 'all' || scope === 'content')
        if (runSemantic && nlpEnabled) {
          try {
            setSemanticHits(await nlpSemanticSearch(q, 8))
            setSemanticError(null)
          } catch (error) {
            setSemanticHits([])
            const message = describeNlpSearchFailure(nlpStatusState, error)
            setSemanticError(message)
            if (searchScope === 'semantic') {
              toast.error(
                message.startsWith('nlp.')
                  ? t(message)
                  : t('commandPalette.semanticSearchError', { detail: message }),
              )
            }
          }
        } else {
          setSemanticHits([])
          if (runSemantic && nlpStatusState?.enabled && !nlpStatusState.sidecarOk) {
            setSemanticError('nlp.sidecarUnavailable')
          } else {
            setSemanticError(null)
          }
        }

        if (scope === 'semantic') {
          setHits([])
          setCommentHits([])
          return
        }

        if (scope === 'comments') {
          const docs = documents.filter((doc) => doc.deletedAt == null)
          const rows: Array<{
            id: string
            body: string
            quote: string
            documentId: string
            documentTitle: string
          }> = []
          for (const doc of docs.slice(0, 24)) {
            try {
              const threads = await listCommentThreads(doc.id)
              for (const thread of threads) {
                const body = thread.comments.map((comment) => comment.body).join(' ')
                rows.push({
                  id: thread.id,
                  body,
                  quote: thread.quote,
                  documentId: doc.id,
                  documentTitle: doc.title,
                })
              }
            } catch {
              // skip
            }
          }
          setCommentHits(rows)
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
    [documents, nlpEnabled, nlpStatusState, searchScope, t],
  )

  useEffect(() => {
    if (!open) return
    setQuery('')
    setHits([])
    setSemanticHits([])
    setCommentHits([])
    setSelected(0)
    setSearchScope('all')
    setFolderOnly(false)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    setSelected(0)
    runSearch(query, searchScope)
  }, [query, runSearch, searchScope])

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
        <DialogContent className="command-palette-dialog top-[12vh] max-w-[560px] translate-y-0 gap-0 overflow-hidden p-0 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
        <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-4 py-3.5 shadow-[inset_3px_0_0_0_var(--color-accent)]">
          <Search className="h-4 w-4 text-[var(--color-accent)]" />
          <input
            ref={inputRef}
            className="flex-1 border-none bg-transparent font-[family-name:var(--font-display)] text-[16px] font-semibold tracking-[-0.02em] text-[var(--color-foreground)] outline-none placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-[var(--color-muted-foreground)]"
            placeholder={t('commandPalette.placeholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-muted-foreground)]">
            ⌘K
          </kbd>
        </div>

        <div className="command-palette-filters titlebar-no-drag">
          <div className="command-palette-filter-row">
            {SEARCH_SCOPES.map((scope) => (
              <button
                key={scope}
                type="button"
                className={cn('command-palette-filter-chip', searchScope === scope && 'is-active')}
                onClick={() => setSearchScope(scope)}
              >
                {t(`commandPalette.scope.${scope}`)}
              </button>
            ))}
          </div>
          {activeDocument && (
            <button
              type="button"
              className={cn('command-palette-filter-chip', folderOnly && 'is-active')}
              onClick={() => setFolderOnly((value) => !value)}
            >
              <FolderOpen className="h-3 w-3" />
              {t('commandPalette.filterFolder')}
            </button>
          )}
        </div>

        {semanticError &&
          (searchScope === 'semantic' || searchScope === 'all' || searchScope === 'content') && (
            <p className="border-t border-[var(--color-border)] px-4 py-2 text-[12px] leading-relaxed text-[var(--color-destructive)]">
              {semanticError.startsWith('nlp.') ? t(semanticError) : semanticError}
            </p>
          )}

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
              {searchItems.length > 0 && (
                <>
                  <p className="command-palette-section-label">{t('commandPalette.sectionSearch')}</p>
                  {searchItems.map((item, index) => {
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
              {documentItems.length > 0 && (
                <>
                  <p className="command-palette-section-label">
                    {hits.length > 0
                      ? t('commandPalette.sectionDocuments')
                      : t('commandPalette.sectionRecent')}
                  </p>
                  {documentItems.map((item, index) => {
                    const flatIndex = filteredActions.length + searchItems.length + index
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
        'flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border border-transparent px-3 py-2.5 text-left transition-colors',
        selected &&
          'border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] shadow-[inset_2px_0_0_0_var(--color-accent)]',
        !selected && 'hover:bg-[var(--color-hover)]',
      )}
      onMouseEnter={onSelect}
      onClick={onRun}
    >
      <span className={cn(selected ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted-foreground)]')}>
        {item.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold tracking-[-0.01em] text-[var(--color-foreground)]">
          {item.label}
        </span>
        {item.type === 'document' && item.snippetHtml ? (
          <span
            className="command-palette-snippet block truncate font-mono text-[10px] text-[var(--color-muted-foreground)]"
            dangerouslySetInnerHTML={{ __html: sanitizeSnippet(item.snippetHtml) }}
          />
        ) : item.type === 'action' && item.hint ? (
          <span className="block truncate font-mono text-[10px] text-[var(--color-muted-foreground)]">
            {item.hint}
          </span>
        ) : (item.type === 'heading' || item.type === 'tag') && item.hint ? (
          <span className="block truncate font-mono text-[10px] text-[var(--color-muted-foreground)]">
            {item.hint}
          </span>
        ) : null}
      </span>
    </button>
  )
}
