import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { DocumentOutlinePanel } from '@/components/editor/DocumentOutlinePanel'
import { DocumentTocRail } from '@/components/editor/DocumentTocRail'
import { OutlineReturnButton } from '@/components/editor/OutlineReturnButton'
import { RevisionHistoryPanel } from '@/components/editor/RevisionHistoryPanel'
import { CommentsPanel } from '@/components/editor/CommentsPanel'
import { ClipboardHistoryPanel } from '@/components/editor/ClipboardHistoryPanel'
import { BacklinksPanel } from '@/components/editor/BacklinksPanel'
import { DocumentInsightsPanel } from '@/components/editor/DocumentInsightsPanel'
import { WikiLinkHoverCard } from '@/components/editor/WikiLinkHoverCard'
import {
  UnresolvedWikiLinkPopover,
  type UnresolvedWikiPopoverState,
} from '@/components/editor/UnresolvedWikiLinkPopover'
import { StatsPanel } from '@/components/editor/StatsPanel'
import { FlashcardsPanel } from '@/components/editor/FlashcardsPanel'
import { FindReplaceBar } from '@/components/editor/FindReplaceBar'
import { EditorToolbar } from '@/components/editor-toolbar/EditorToolbar'
import { EditorMenus } from '@/components/editor/EditorMenus'
import { EditorDropZone } from '@/components/editor/EditorDropOverlay'
import { EDITOR_PAGE_GAP, EditorPageSheets, getEditorPrintStageSize } from '@/components/editor/EditorPageSheets'
import { EditorPanelRail } from '@/components/editor/EditorPanelRail'
import { EditorStatusBar } from '@/components/editor/EditorStatusBar'
import { PageSetupDialog } from '@/components/editor/PageSetupDialog'
import { PageHeaderFooterOverlays } from '@/components/editor/PageHeaderFooterOverlays'
import { PageWatermarkOverlays } from '@/components/editor/PageWatermarkOverlays'
import { MarkdownSourceEditor } from '@/components/editor/MarkdownSourceEditor'
import { PrintEmptyHero } from '@/components/editor/PrintEmptyHero'
import { useDocumentAutoSave } from '@/hooks/useDocumentAutoSave'
import { useDocumentPagination } from '@/hooks/useDocumentPagination'
import { useActiveScrollHeading } from '@/hooks/useActiveScrollHeading'
import { useActiveHeadingHighlight } from '@/hooks/useActiveHeadingHighlight'
import { useEditorHotkeys } from '@/hooks/useEditorHotkeys'
import {
  getCachedContentHash,
  getCachedParsedContent,
} from '@/lib/cache/document-cache'
import { useEditorViewEffect, setEditorContent, useEditorReady, isEditorViewReady } from '@/lib/editor/view-ready'
import { resolvePageLayout } from '@/lib/editor/page-layout'
import { normalizePageSetup, PAPER_SIZES } from '@/lib/editor/page-setup'
import { resolveDocumentTypography } from '@/lib/editor/document-style-presets'
import { getEditorExtensions } from '@/lib/editor/extensions'
import { listGoogleFontFamilies, loadGoogleFontsForDocument } from '@/lib/editor/google-fonts'
import { ensureAllCustomFontsLoaded, loadCustomFontsForDocument } from '@/lib/editor/custom-fonts'
import { getEditorMarkdown, parseMarkdownToContentJson } from '@/lib/editor/markdown-content'
import type { DocumentOutlineItem } from '@/lib/editor/document-outline'
import { jumpToMarkdownOutlineItem } from '@/lib/editor/markdown-outline'
import { recallEditorSession } from '@/lib/editor/editor-session'
import { insertDocumentMediaFromFiles } from '@/lib/editor/image-utils'
import { printDocumentFromContent } from '@/lib/export/print-document'
import { navigateViaWikiLink } from '@/lib/navigation'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { editorRefs } from '@/store/editorRefs'
import {
  setBacklinksPanelOpen,
  setClipboardHistoryPanelOpen,
  setCommentsPanelOpen,
  setDocumentOutlineOpen,
  setDocumentTocLeftOpen,
  setFindReplaceOpen,
  setFlashcardsPanelOpen,
  setPendingEditorSearch,
  setInsightsPanelOpen,
  setRevisionHistoryOpen,
  setSaveStatus,
  setStatsPanelOpen,
} from '@/store/documentsSlice'
import { setEditorViewMode } from '@/store/settingsSlice'

export function DocumentEditor() {
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const manualTitleIds = useAppSelector((state) => state.documents.manualTitleDocumentIds)
  const viewMode = useAppSelector((state) => state.settings.editorViewMode)
  const outlineOpen = useAppSelector((state) => state.documents.documentOutlineOpen)
  const tocLeftOpen = useAppSelector((state) => state.documents.documentTocLeftOpen)
  const historyOpen = useAppSelector((state) => state.documents.revisionHistoryOpen)
  const commentsOpen = useAppSelector((state) => state.documents.commentsPanelOpen)
  const statsOpen = useAppSelector((state) => state.documents.statsPanelOpen)
  const backlinksOpen = useAppSelector((state) => state.documents.backlinksPanelOpen)
  const insightsOpen = useAppSelector((state) => state.documents.insightsPanelOpen)
  const clipboardOpen = useAppSelector((state) => state.documents.clipboardHistoryPanelOpen)
  const flashcardsOpen = useAppSelector((state) => state.documents.flashcardsPanelOpen)
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const readingMode = useAppSelector((state) => state.documents.readingMode)
  const [markdownDraft, setMarkdownDraft] = useState('')
  const [pageSetupOpen, setPageSetupOpen] = useState(false)
  const [unresolvedPopover, setUnresolvedPopover] = useState<UnresolvedWikiPopoverState | null>(null)
  const activeDocumentRef = useRef(activeDocument)
  const manualTitleIdsRef = useRef(new Set(manualTitleIds))
  const editorRef = useRef<Editor | null>(null)
  const markdownDraftRef = useRef('')
  const markdownTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const queueSaveRef = useRef<(docId: string) => void>(() => {})
  const activeIdRef = useRef(activeId)
  const viewModeRef = useRef(viewMode)

  activeDocumentRef.current = activeDocument
  manualTitleIdsRef.current = new Set(manualTitleIds)
  activeIdRef.current = activeId
  viewModeRef.current = viewMode

  const initialContent = useMemo(() => {
    if (!activeDocument) return undefined
    return getCachedParsedContent(activeDocument)
  }, [activeDocument?.id])

  const handleInsertImages = useCallback(
    async (files: File[], pos?: number) => {
      if (!editorRef.current || !activeId) return
      await insertDocumentMediaFromFiles(editorRef.current, activeId, files, pos)
    },
    [activeId],
  )

  const insertImagesRef = useRef(handleInsertImages)
  insertImagesRef.current = handleInsertImages

  // Bump when extension set changes so HMR recreates the editor (useMemo [] is sticky).
  const EDITOR_EXTENSIONS_REV = 7
  const extensions = useMemo(
    () =>
      getEditorExtensions({
        onInsertImages: (files, pos) => {
          void insertImagesRef.current(files, pos)
        },
      }),
    [EDITOR_EXTENSIONS_REV],
  )

  const pageSetup = useAppSelector((state) => state.settings.pageSetup)
  const spellCheckEnabled = useAppSelector((state) => state.settings.spellCheckEnabled)
  const locale = useAppSelector((state) => state.settings.locale)
  const printLayoutEnabled = useAppSelector((state) => state.settings.printLayoutEnabled)
  const printZoom = useAppSelector((state) => state.settings.printZoom)
  const printColumns = useAppSelector((state) => state.settings.printLayoutColumns)
  const normalizedPageSetup = useMemo(() => normalizePageSetup(pageSetup), [pageSetup])
  const pageLayout = useMemo(() => resolvePageLayout(pageSetup), [pageSetup])
  const documentTypography = useMemo(
    () => resolveDocumentTypography(normalizedPageSetup),
    [normalizedPageSetup],
  )
  const paper = PAPER_SIZES[normalizedPageSetup.paperSize]

  const editorAttributes = useMemo(
    () => ({
      class: cn('tiptap', printLayoutEnabled && 'tiptap--print-accurate'),
      spellcheck: spellCheckEnabled ? 'true' : 'false',
      lang: locale,
      'data-gramm': 'false',
      'data-gramm_editor': 'false',
      'data-enable-grammarly': 'false',
    }),
    [printLayoutEnabled, spellCheckEnabled, locale],
  )

  const editor = useEditor({
    extensions,
    content: initialContent,
    editable: !readingMode && viewMode === 'rich',
    autofocus: false,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: editorAttributes,
    },
    onUpdate: () => {
      if (!activeIdRef.current || viewModeRef.current !== 'rich') return
      queueSaveRef.current(activeIdRef.current)
    },
  }, [extensions])

  editorRef.current = editor
  editorRefs.editor = editor
  const editorReady = useEditorReady(editor)

  // Sync editable + DOM attributes when settings change. Key handling stays in TauriInputFix.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setOptions({
      editable: !readingMode && viewMode === 'rich',
      editorProps: {
        attributes: editorAttributes,
      },
    })
  }, [editor, editorAttributes, readingMode, viewMode])

  const { queueSave, flushSave, editorContentHashRef, lastPersistedHashRef } = useDocumentAutoSave({
    editor,
    activeId,
    viewMode,
    markdownDraftRef,
    manualTitleIdsRef,
    activeDocumentRef,
  })

  queueSaveRef.current = queueSave

  const persistViewMode = useCallback(
    (mode: 'rich' | 'markdown') => dispatch(setEditorViewMode(mode)),
    [dispatch],
  )

  const switchToMarkdown = useCallback(() => {
    if (!editor) return
    const markdown = getEditorMarkdown(editor)
    markdownDraftRef.current = markdown
    setMarkdownDraft(markdown)
    persistViewMode('markdown')
  }, [editor, persistViewMode])

  const switchToRich = useCallback(async () => {
    if (!editor) return

    const markdown = markdownDraftRef.current

    const applyMarkdown = (): boolean => {
      if (
        setEditorContent(editor, markdown, {
          contentType: 'markdown',
          emitUpdate: false,
        })
      ) {
        return true
      }

      try {
        const contentJson = parseMarkdownToContentJson(markdown)
        return setEditorContent(editor, JSON.parse(contentJson) as object, { emitUpdate: false })
      } catch {
        return false
      }
    }

    let ready = isEditorViewReady(editor)
    for (let attempt = 0; !ready && attempt < 24; attempt += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      ready = isEditorViewReady(editor)
    }

    if (!applyMarkdown()) {
      toast.error(t('editor.markdownSwitchError'))
      return
    }

    if (activeId) {
      await flushSave()
    }
    persistViewMode('rich')
  }, [activeId, editor, flushSave, persistViewMode, t])

  const handleMarkdownChange = useCallback(
    (value: string) => {
      markdownDraftRef.current = value
      setMarkdownDraft(value)
      if (!activeId) return
      queueSave(activeId)
    },
    [activeId, queueSave],
  )

  useEffect(() => {
    editorRefs.modeActions = {
      viewMode,
      switchToMarkdown,
      switchToRich,
    }
    return () => {
      editorRefs.modeActions = null
    }
  }, [switchToMarkdown, switchToRich, viewMode])

  useEffect(() => {
    return () => {
      editorRefs.editor = null
    }
  }, [])

  useEffect(() => {
    if (!activeDocument) return

    const contentJson = activeDocument.contentJson
    const pageFont = pageSetup.typography.fontFamily
    let cancelled = false
    let idleId = 0

    const run = () => {
      if (cancelled) return
      void listGoogleFontFamilies().then(() => {
        if (cancelled) return
        loadGoogleFontsForDocument(contentJson, pageFont)
      })
      void ensureAllCustomFontsLoaded().then(() => {
        if (cancelled) return
        loadCustomFontsForDocument(contentJson, pageFont)
      })
    }

    // Defer font discovery until after first paint — large docs parse marks off the critical path.
    if (typeof requestIdleCallback === 'function') {
      idleId = requestIdleCallback(run, { timeout: 1200 })
    } else {
      idleId = window.setTimeout(run, 0) as unknown as number
    }

    return () => {
      cancelled = true
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId)
      else window.clearTimeout(idleId)
    }
  }, [activeDocument?.id, pageSetup.typography.fontFamily])

  useEditorHotkeys(editor)

  const insertClipboardPlain = useCallback(
    (text: string) => {
      const el = markdownTextareaRef.current
      const current = markdownDraftRef.current
      if (!el) {
        handleMarkdownChange(current + text)
        return
      }
      const start = el.selectionStart
      const end = el.selectionEnd
      const next = `${current.slice(0, start)}${text}${current.slice(end)}`
      handleMarkdownChange(next)
      requestAnimationFrame(() => {
        el.focus()
        const pos = start + text.length
        el.setSelectionRange(pos, pos)
      })
    },
    [handleMarkdownChange],
  )

  const [printDocEmpty, setPrintDocEmpty] = useState(true)

  useEffect(() => {
    if (!editor) return
    const syncEmpty = () => setPrintDocEmpty(editor.isEmpty)
    syncEmpty()
    editor.on('update', syncEmpty)
    editor.on('selectionUpdate', syncEmpty)
    return () => {
      editor.off('update', syncEmpty)
      editor.off('selectionUpdate', syncEmpty)
    }
  }, [editor])

  useEffect(() => {
    document.documentElement.classList.toggle('scribe-print-layout', printLayoutEnabled)
    return () => {
      document.documentElement.classList.remove('scribe-print-layout')
    }
  }, [printLayoutEnabled])

  useEditorViewEffect(
    editor,
    (_editor, dom) => {
      dom.setAttribute('spellcheck', spellCheckEnabled ? 'true' : 'false')
      dom.setAttribute('lang', locale)
      dom.classList.toggle('tiptap--print-accurate', printLayoutEnabled)
    },
    [locale, printLayoutEnabled, spellCheckEnabled],
  )

  useEditorViewEffect(
    editor,
    (_editor, dom) => {
      const handleClick = (event: MouseEvent) => {
        const anchor = (event.target as HTMLElement | null)?.closest?.('a[data-wiki-link]') as
          | HTMLElement
          | null
        if (!anchor) return
        event.preventDefault()
        const targetId = anchor.getAttribute('data-target-id')
        if (targetId) {
          setUnresolvedPopover(null)
          navigateViaWikiLink({
            fromId: activeId,
            targetId,
            dispatch,
            navigate: (route) => void navigate(route),
          })
          const heading = anchor.getAttribute('data-heading')?.trim()
          if (heading) {
            dispatch(setFindReplaceOpen(true))
            dispatch(setPendingEditorSearch(heading))
          }
          return
        }
        const label = (anchor.getAttribute('data-label') || anchor.textContent || '').trim()
        if (!label) return
        const linkTitle = (anchor.getAttribute('data-link-title') || label).trim()
        const rect = anchor.getBoundingClientRect()
        setUnresolvedPopover({
          label,
          linkTitle,
          x: rect.left,
          y: rect.bottom + 6,
        })
      }
      dom.addEventListener('click', handleClick)
      return () => dom.removeEventListener('click', handleClick)
    },
    [activeId, dispatch, navigate],
  )

  const {
    scrollRef,
    canvasRef,
    pageCount,
    currentPage,
    pageSegments,
    scrollToPage,
  } = useDocumentPagination({ editor, documentId: activeId, pageSetup, pageLayout })

  const stageSize = useMemo(
    () =>
      getEditorPrintStageSize(
        pageCount,
        printColumns,
        pageSetup,
        pageSegments,
        pageLayout.paddingTop,
        pageLayout.paddingBottom,
      ),
    [pageCount, pageSegments, pageLayout.paddingBottom, pageLayout.paddingTop, pageSetup, printColumns],
  )

  const printLayoutConfig = useMemo(
    () =>
      printLayoutEnabled
        ? {
            enabled: true as const,
            columns: printColumns,
            paperWidth: paper.width,
            paperHeight: paper.height,
            gap: EDITOR_PAGE_GAP,
          }
        : undefined,
    [paper.height, paper.width, printColumns, printLayoutEnabled],
  )

  const handlePrint = useCallback(() => {
    if (!activeDocument) return
    void printDocumentFromContent(activeDocument.contentJson, activeDocument.title, {
      pageSetup,
      includeTitleHeading: true,
    }).catch((error) => {
      console.error(error)
    })
  }, [activeDocument, pageSetup])

  const saveStatus = useAppSelector((state) => state.documents.saveStatus)

  // Clear content hashes before syncing so a later effect cannot wipe in-progress edits.
  useEffect(() => {
    editorContentHashRef.current = null
    lastPersistedHashRef.current = null
  }, [activeId, editorContentHashRef, lastPersistedHashRef])

  useEffect(() => {
    dispatch(setFindReplaceOpen(false))
  }, [activeId, dispatch])

  useEditorViewEffect(
    editor,
    (currentEditor) => {
      if (!activeDocument) return

      const incomingHash = getCachedContentHash(activeDocument)
      if (incomingHash === editorContentHashRef.current) return

      // Never replace live document content while the user is typing in it.
      if (currentEditor.isFocused) return

      // Local edits already tracked for this session — don't clobber them.
      if (
        editorContentHashRef.current != null &&
        (saveStatus === 'dirty' || saveStatus === 'saving')
      ) {
        return
      }

      if (
        !setEditorContent(currentEditor, getCachedParsedContent(activeDocument), {
          emitUpdate: false,
        })
      ) {
        return
      }

      editorContentHashRef.current = incomingHash
      lastPersistedHashRef.current = incomingHash

      // Markdown draft is built lazily when switching to markdown mode (see effect below).
      dispatch(setSaveStatus('saved'))

      const session = recallEditorSession(activeId)
      if (session) {
        const size = currentEditor.state.doc.content.size
        const from = Math.min(session.from, size)
        const to = Math.min(session.to, size)
        if (from >= 1 && to >= from) {
          currentEditor.commands.setTextSelection({ from, to })
        }
      }

      if (currentEditor.isEmpty) {
        currentEditor.commands.focus('start')
      }
    },
    [activeDocument, activeId, dispatch, editorContentHashRef, lastPersistedHashRef, saveStatus],
  )

  const handleMarkdownOutlineJump = useCallback(
    (item: DocumentOutlineItem) => {
      const textarea = markdownTextareaRef.current
      if (!textarea) return
      jumpToMarkdownOutlineItem(textarea, scrollRef, item)
    },
    [scrollRef],
  )

  useEffect(() => {
    if (viewMode !== 'markdown' || !editor || !editorReady || !activeDocument) return

    const syncMarkdownFromEditor = () => {
      const markdown = getEditorMarkdown(editor)
      if (markdown === markdownDraftRef.current) return
      markdownDraftRef.current = markdown
      setMarkdownDraft(markdown)
    }

    syncMarkdownFromEditor()
  }, [activeDocument?.id, activeDocument?.updatedAt, editor, editorReady, viewMode])

  const isMarkdown = viewMode === 'markdown'

  const { activeHeading, headingCount } = useActiveScrollHeading({
    editor: editorReady ? editor : null,
    scrollRef,
    enabled: !isMarkdown && !readingMode,
  })

  useActiveHeadingHighlight(
    editorReady ? editor : null,
    activeHeading,
    !isMarkdown && !readingMode && headingCount > 0,
  )

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!readingMode && viewMode === 'rich')
  }, [editor, readingMode, viewMode])

  useEffect(() => {
    if (!editor || !editorReady || readingMode || viewMode !== 'rich') return
    if (!editor.isEmpty) return
    const frame = requestAnimationFrame(() => {
      if (!editor.isDestroyed && !editor.isFocused) {
        editor.commands.focus('start')
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [editor, editorReady, readingMode, viewMode])

  useEffect(() => {
    if (isMarkdown || focusMode || readingMode) {
      editorRefs.printHandler = null
      return
    }
    editorRefs.printHandler = handlePrint
    return () => {
      editorRefs.printHandler = null
    }
  }, [focusMode, handlePrint, isMarkdown, readingMode])

  return (
    <div
      className={cn(
        'editor-shell',
        isMarkdown && 'editor-shell--markdown',
        focusMode && 'editor-shell--focus',
        readingMode && 'editor-shell--reading',
      )}
    >
      {!isMarkdown && !focusMode && !readingMode && editorReady && (
        <EditorToolbar
          editor={editor}
          onInsertImages={handleInsertImages}
        />
      )}
      {!isMarkdown && !readingMode && editorReady && (
        <EditorMenus editor={editor} />
      )}

      {!isMarkdown && !focusMode && !readingMode && editorReady && (
        <FindReplaceBar editor={editor} />
      )}

      <div className="editor-workspace">
        <div className="editor-main">
          <div
            className={cn(
              'editor-body',
              (outlineOpen ||
                historyOpen ||
                commentsOpen ||
                statsOpen ||
                backlinksOpen ||
                insightsOpen ||
                clipboardOpen ||
                flashcardsOpen) &&
                'editor-body--with-outline',
              tocLeftOpen && !isMarkdown && headingCount > 0 && 'editor-body--with-toc-left',
            )}
          >
            {!isMarkdown && editorReady && !readingMode && tocLeftOpen && headingCount > 0 && (
              <DocumentTocRail
                editor={editor}
                scrollRef={scrollRef}
                scrollActiveId={activeHeading?.id ?? null}
              />
            )}
            <div className="editor-body-main">
            {!isMarkdown && !focusMode && !readingMode && editorReady && (
              <OutlineReturnButton scrollRef={scrollRef} />
            )}
            <EditorDropZone
              className={cn(
                'editor-scroll editor-stage',
                printLayoutEnabled && !isMarkdown && 'editor-scroll--print-layout',
              )}
              ref={scrollRef}
            >
          <div
            className={cn('editor-print-host', printLayoutEnabled && !isMarkdown && 'editor-print-host--active')}
            style={
              printLayoutEnabled && !isMarkdown
                ? ({
                    ['--print-zoom' as string]: String(printZoom),
                  } as CSSProperties)
                : undefined
            }
          >
            <div
              className={cn(
                'editor-print-stage-wrap',
                printLayoutEnabled && !isMarkdown && 'editor-print-stage-wrap--active',
              )}
              style={
                printLayoutEnabled && !isMarkdown
                  ? {
                      width: Math.round(stageSize.width * printZoom),
                      minHeight: Math.round(stageSize.height * printZoom),
                    }
                  : undefined
              }
            >
            <div
              className="editor-print-stage"
              style={
                printLayoutEnabled && !isMarkdown
                  ? {
                      width: stageSize.width,
                      minHeight: stageSize.height,
                      transform: `translateX(-50%) scale(${printZoom})`,
                    }
                  : undefined
              }
            >
              {!isMarkdown && printLayoutEnabled && (
                <>
                  <EditorPageSheets
                    pageSetup={pageSetup}
                    pageSegments={pageSegments}
                    columns={printColumns}
                    paddingTop={pageLayout.paddingTop}
                  />
                  <PageWatermarkOverlays
                    pageSetup={pageSetup}
                    pageSegments={pageSegments}
                    columns={printColumns}
                    paperWidth={paper.width}
                    paperHeight={paper.height}
                    gap={EDITOR_PAGE_GAP}
                    paddingTop={pageLayout.paddingTop}
                    printLayout
                  />
                </>
              )}

              <div
                ref={canvasRef}
                data-tour="editor-canvas"
                className={cn(
                  'editor-canvas',
                  !isMarkdown && 'editor-canvas--paginated',
                  !isMarkdown && printLayoutEnabled && 'editor-canvas--print-layout',
                  !isMarkdown && printLayoutEnabled && printDocEmpty && 'editor-canvas--print-empty',
                  isMarkdown && 'editor-canvas--markdown',
                )}
                style={
                  !isMarkdown
                    ? ({
                        '--page-width': `${pageLayout.width}px`,
                        '--page-content-height': `${pageLayout.contentHeight}px`,
                        '--page-padding-top': `${pageLayout.paddingTop}px`,
                        '--page-padding-bottom': `${pageLayout.paddingBottom}px`,
                        '--page-padding-left': `${pageLayout.paddingLeft}px`,
                        '--page-padding-right': `${pageLayout.paddingRight}px`,
                        '--page-paper-height': `${pageLayout.paperHeight}px`,
                        '--doc-font-family': documentTypography.fontFamily || 'inherit',
                        '--doc-font-size': `${documentTypography.fontSize}px`,
                        '--doc-line-height': String(documentTypography.lineHeight),
                        ...(printLayoutEnabled
                          ? {
                              width: pageLayout.width,
                              minWidth: pageLayout.width,
                              maxWidth: pageLayout.width,
                              paddingBottom: `${pageLayout.paddingBottom + Math.max(0, pageCount - 1) * EDITOR_PAGE_GAP}px`,
                            }
                          : {
                              maxWidth: pageLayout.width,
                            }),
                      } as unknown as CSSProperties)
                    : undefined
                }
              >
                {!isMarkdown && (
                  <>
                    {!printLayoutEnabled && (
                      <div className="editor-page-label" aria-hidden="true">
                        {t('editor.page', { page: currentPage })}
                      </div>
                    )}
                    {!printLayoutEnabled &&
                      pageSegments.slice(1).map((segment) => (
                        <div
                          key={segment.pageNumber}
                          className="editor-page-break"
                          style={{ top: pageLayout.paddingTop + segment.start }}
                          aria-hidden="true"
                        />
                      ))}
                    {printLayoutEnabled &&
                      pageSegments.slice(1).map((segment, index) => (
                        <div
                          key={`gap-${segment.pageNumber}`}
                          className="editor-print-page-gap"
                          style={{
                            top:
                              pageLayout.paddingTop +
                              pageSegments[index]!.start +
                              pageSegments[index]!.height,
                          }}
                          aria-hidden="true"
                        />
                      ))}
                    {(!printLayoutEnabled || !printDocEmpty) && (
                      <PageHeaderFooterOverlays
                        pageSetup={pageSetup}
                        pageSegments={pageSegments}
                        documentTitle={activeDocument?.title ?? t('common.document')}
                        paddingTop={pageLayout.paddingTop}
                        printLayout={printLayoutConfig}
                      />
                    )}
                    {printLayoutEnabled && printDocEmpty && <PrintEmptyHero />}
                    {!printLayoutEnabled && (
                      <PageWatermarkOverlays
                        pageSetup={pageSetup}
                        pageSegments={pageSegments}
                        columns={1}
                        paperWidth={paper.width}
                        paperHeight={paper.height}
                        gap={0}
                        paddingTop={pageLayout.paddingTop}
                      />
                    )}
                  </>
                )}

                {isMarkdown && (
                  <MarkdownSourceEditor
                    ref={markdownTextareaRef}
                    value={markdownDraft}
                    onChange={handleMarkdownChange}
                    spellCheck={spellCheckEnabled}
                  />
                )}

                <div
                  className={cn('editor-content-host', isMarkdown && 'editor-content-host--hidden')}
                  aria-hidden={isMarkdown}
                >
                  <EditorContent editor={editor} />
                </div>
              </div>
            </div>
          </div>
          </div>
        </EditorDropZone>
            </div>

        {editorReady && !readingMode && outlineOpen && (
          <DocumentOutlinePanel
            editor={editor}
            scrollRef={scrollRef}
            scrollActiveId={activeHeading?.id ?? null}
            markdownSource={isMarkdown ? markdownDraft : undefined}
            onMarkdownJump={isMarkdown ? handleMarkdownOutlineJump : undefined}
            onClose={() => dispatch(setDocumentOutlineOpen(false))}
          />
        )}
        {!isMarkdown && editorReady && !readingMode && historyOpen && (
          <RevisionHistoryPanel onClose={() => dispatch(setRevisionHistoryOpen(false))} />
        )}
        {!isMarkdown && editorReady && !readingMode && commentsOpen && (
          <CommentsPanel editor={editor} onClose={() => dispatch(setCommentsPanelOpen(false))} />
        )}
        {!isMarkdown && editorReady && !readingMode && statsOpen && (
          <StatsPanel editor={editor} onClose={() => dispatch(setStatsPanelOpen(false))} />
        )}
        {!isMarkdown && !readingMode && backlinksOpen && (
          <BacklinksPanel onClose={() => dispatch(setBacklinksPanelOpen(false))} />
        )}
        {!isMarkdown && !readingMode && insightsOpen && (
          <DocumentInsightsPanel onClose={() => dispatch(setInsightsPanelOpen(false))} />
        )}
        {!isMarkdown && !readingMode && flashcardsOpen && (
          <FlashcardsPanel onClose={() => dispatch(setFlashcardsPanelOpen(false))} />
        )}
        {!readingMode && clipboardOpen && (
          <ClipboardHistoryPanel
            editor={isMarkdown ? null : editor}
            onInsertPlain={isMarkdown ? insertClipboardPlain : undefined}
            onClose={() => dispatch(setClipboardHistoryPanelOpen(false))}
          />
        )}
          </div>

          {!isMarkdown && !focusMode && !readingMode && (
            <EditorStatusBar
              currentPage={currentPage}
              pageCount={pageCount}
              onPageChange={scrollToPage}
              onPrint={handlePrint}
              onOpenPageSetup={() => setPageSetupOpen(true)}
              sectionLabel={activeHeading?.preview || activeHeading?.label || null}
              onOpenOutline={() => dispatch(setDocumentTocLeftOpen(true))}
            />
          )}
        </div>

        {!focusMode && !readingMode && <EditorPanelRail />}
      </div>

      <PageSetupDialog open={pageSetupOpen} onClose={() => setPageSetupOpen(false)} />
      {!isMarkdown && editorReady && <WikiLinkHoverCard editor={editor} />}
      <UnresolvedWikiLinkPopover
        state={unresolvedPopover}
        documentId={activeId}
        onClose={() => setUnresolvedPopover(null)}
      />
    </div>
  )
}
