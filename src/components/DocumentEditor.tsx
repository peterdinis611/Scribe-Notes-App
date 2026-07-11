import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { useNavigate } from '@tanstack/react-router'
import { DocumentOutlinePanel } from '@/components/editor/DocumentOutlinePanel'
import { RevisionHistoryPanel } from '@/components/editor/RevisionHistoryPanel'
import { CommentsPanel } from '@/components/editor/CommentsPanel'
import { BacklinksPanel } from '@/components/editor/BacklinksPanel'
import { WikiLinkHoverCard } from '@/components/editor/WikiLinkHoverCard'
import { StatsPanel } from '@/components/editor/StatsPanel'
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
import { useDocumentAutoSave } from '@/hooks/useDocumentAutoSave'
import { useDocumentPagination } from '@/hooks/useDocumentPagination'
import { useEditorHotkeys } from '@/hooks/useEditorHotkeys'
import {
  getCachedContentHash,
  getCachedParsedContent,
} from '@/lib/cache/document-cache'
import { useEditorViewEffect, setEditorContent, useEditorReady } from '@/lib/editor/view-ready'
import { resolvePageLayout } from '@/lib/editor/page-layout'
import { normalizePageSetup, PAPER_SIZES } from '@/lib/editor/page-setup'
import { getEditorExtensions } from '@/lib/editor/extensions'
import { getEditorMarkdown } from '@/lib/editor/markdown-content'
import { insertImagesFromFiles } from '@/lib/editor/image-utils'
import { printDocumentFromContent } from '@/lib/export/print-document'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { editorRefs } from '@/store/editorRefs'
import {
  setActiveDocumentId,
  setBacklinksPanelOpen,
  setCommentsPanelOpen,
  setDocumentOutlineOpen,
  setFindReplaceOpen,
  setRevisionHistoryOpen,
  setSaveStatus,
  setStatsPanelOpen,
} from '@/store/documentsSlice'
import { setEditorViewMode } from '@/store/settingsSlice'

export function DocumentEditor() {
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const manualTitleIds = useAppSelector((state) => state.documents.manualTitleDocumentIds)
  const viewMode = useAppSelector((state) => state.settings.editorViewMode)
  const outlineOpen = useAppSelector((state) => state.documents.documentOutlineOpen)
  const historyOpen = useAppSelector((state) => state.documents.revisionHistoryOpen)
  const commentsOpen = useAppSelector((state) => state.documents.commentsPanelOpen)
  const statsOpen = useAppSelector((state) => state.documents.statsPanelOpen)
  const backlinksOpen = useAppSelector((state) => state.documents.backlinksPanelOpen)
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const [markdownDraft, setMarkdownDraft] = useState('')
  const [pageSetupOpen, setPageSetupOpen] = useState(false)
  const activeDocumentRef = useRef(activeDocument)
  const manualTitleIdsRef = useRef(new Set(manualTitleIds))
  const editorRef = useRef<Editor | null>(null)
  const markdownDraftRef = useRef('')
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
      await insertImagesFromFiles(editorRef.current, activeId, files, pos)
    },
    [activeId],
  )

  const insertImagesRef = useRef(handleInsertImages)
  insertImagesRef.current = handleInsertImages

  const extensions = useMemo(
    () =>
      getEditorExtensions({
        onInsertImages: (files, pos) => {
          void insertImagesRef.current(files, pos)
        },
      }),
    [],
  )

  const pageSetup = useAppSelector((state) => state.settings.pageSetup)
  const spellCheckEnabled = useAppSelector((state) => state.settings.spellCheckEnabled)
  const printLayoutEnabled = useAppSelector((state) => state.settings.printLayoutEnabled)
  const printZoom = useAppSelector((state) => state.settings.printZoom)
  const printColumns = useAppSelector((state) => state.settings.printLayoutColumns)
  const normalizedPageSetup = useMemo(() => normalizePageSetup(pageSetup), [pageSetup])
  const pageLayout = useMemo(() => resolvePageLayout(pageSetup), [pageSetup])
  const paper = PAPER_SIZES[normalizedPageSetup.paperSize]

  const editor = useEditor({
    extensions,
    content: initialContent,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: cn('tiptap', printLayoutEnabled && 'tiptap--print-accurate'),
        spellcheck: spellCheckEnabled ? 'true' : 'false',
        lang: 'sk',
      },
    },
    onUpdate: () => {
      if (!activeIdRef.current || viewModeRef.current !== 'rich') return
      queueSaveRef.current(activeIdRef.current)
    },
  }, [extensions])

  editorRef.current = editor
  const editorReady = useEditorReady(editor)

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

  const switchToRich = useCallback(() => {
    if (!editor) return
    if (
      !setEditorContent(editor, markdownDraftRef.current, {
        contentType: 'markdown',
        emitUpdate: false,
      })
    ) {
      return
    }
    if (activeId) {
      void flushSave()
    }
    persistViewMode('rich')
  }, [activeId, editor, flushSave, persistViewMode])

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

  useEditorHotkeys(editor)

  useEditorViewEffect(
    editor,
    (_editor, dom) => {
      dom.setAttribute('spellcheck', spellCheckEnabled ? 'true' : 'false')
      dom.setAttribute('lang', 'sk')
      dom.classList.toggle('tiptap--print-accurate', printLayoutEnabled)
    },
    [printLayoutEnabled, spellCheckEnabled],
  )

  useEditorViewEffect(
    editor,
    (_editor, dom) => {
      const handleClick = (event: MouseEvent) => {
        const anchor = (event.target as HTMLElement | null)?.closest?.('a[data-wiki-link]')
        if (!anchor) return
        event.preventDefault()
        const targetId = anchor.getAttribute('data-target-id')
        if (!targetId) return
        dispatch(setActiveDocumentId(targetId))
        navigate(ROUTES.document(targetId))
      }
      dom.addEventListener('click', handleClick)
      return () => dom.removeEventListener('click', handleClick)
    },
    [dispatch, navigate],
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
    printDocumentFromContent(activeDocument.contentJson, activeDocument.title, {
      pageSetup,
      includeTitleHeading: true,
    })
  }, [activeDocument, pageSetup])

  useEditorViewEffect(
    editor,
    (currentEditor) => {
      if (!activeDocument) return

      const incomingHash = getCachedContentHash(activeDocument)
      if (incomingHash === editorContentHashRef.current) return

      if (
        !setEditorContent(currentEditor, getCachedParsedContent(activeDocument), {
          emitUpdate: false,
        })
      ) {
        return
      }

      editorContentHashRef.current = incomingHash
      lastPersistedHashRef.current = incomingHash

      const markdown = getEditorMarkdown(currentEditor)
      markdownDraftRef.current = markdown
      setMarkdownDraft(markdown)
      dispatch(setSaveStatus('saved'))
    },
    [activeDocument, activeId, dispatch, editorContentHashRef, lastPersistedHashRef],
  )

  useEffect(() => {
    dispatch(setFindReplaceOpen(false))
  }, [activeId, dispatch])

  useEffect(() => {
    editorContentHashRef.current = null
    lastPersistedHashRef.current = null
  }, [activeId, editorContentHashRef, lastPersistedHashRef])

  const isMarkdown = viewMode === 'markdown'

  useEffect(() => {
    if (isMarkdown || focusMode) {
      editorRefs.printHandler = null
      return
    }
    editorRefs.printHandler = handlePrint
    return () => {
      editorRefs.printHandler = null
    }
  }, [focusMode, handlePrint, isMarkdown])

  return (
    <div className={cn('editor-shell', isMarkdown && 'editor-shell--markdown', focusMode && 'editor-shell--focus')}>
      {!isMarkdown && !focusMode && editorReady && (
        <EditorToolbar editor={editor} onInsertImages={handleInsertImages} />
      )}
      {!isMarkdown && editorReady && (
        <EditorMenus editor={editor} onInsertImages={handleInsertImages} />
      )}

      {!isMarkdown && editorReady && <FindReplaceBar editor={editor} />}

      <div className="editor-workspace">
        <div className="editor-main">
          <div
            className={cn(
              'editor-body',
              (outlineOpen || historyOpen || commentsOpen || statsOpen || backlinksOpen) &&
                !isMarkdown &&
                'editor-body--with-outline',
            )}
          >
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
              className="editor-print-stage"
              style={
                printLayoutEnabled && !isMarkdown
                  ? {
                      width: stageSize.width,
                      minHeight: stageSize.height,
                      zoom: printZoom,
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
                className={cn(
                  'editor-canvas',
                  !isMarkdown && 'editor-canvas--paginated',
                  !isMarkdown && printLayoutEnabled && 'editor-canvas--print-layout',
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
                        ...(printLayoutEnabled
                          ? {
                              width: pageLayout.width,
                              maxWidth: '100%',
                              paddingBottom: `${pageLayout.paddingBottom + Math.max(0, pageCount - 1) * EDITOR_PAGE_GAP}px`,
                            }
                          : {}),
                      } as CSSProperties)
                    : undefined
                }
              >
                {!isMarkdown && (
                  <>
                    {!printLayoutEnabled && (
                      <div className="editor-page-label" aria-hidden="true">
                        Strana {currentPage}
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
                    <PageHeaderFooterOverlays
                      pageSetup={pageSetup}
                      pageSegments={pageSegments}
                      documentTitle={activeDocument?.title ?? 'Dokument'}
                      paddingTop={pageLayout.paddingTop}
                      printLayout={printLayoutConfig}
                    />
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

                {isMarkdown ? (
                  <MarkdownSourceEditor
                    value={markdownDraft}
                    onChange={handleMarkdownChange}
                    spellCheck={spellCheckEnabled}
                  />
                ) : (
                  <EditorContent editor={editor} />
                )}

                {isMarkdown && editor && (
                  <div className="editor-markdown-hidden" aria-hidden="true">
                    <EditorContent editor={editor} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </EditorDropZone>

        {!isMarkdown && editorReady && outlineOpen && (
          <DocumentOutlinePanel editor={editor} onClose={() => dispatch(setDocumentOutlineOpen(false))} />
        )}
        {!isMarkdown && editorReady && historyOpen && (
          <RevisionHistoryPanel onClose={() => dispatch(setRevisionHistoryOpen(false))} />
        )}
        {!isMarkdown && editorReady && commentsOpen && (
          <CommentsPanel editor={editor} onClose={() => dispatch(setCommentsPanelOpen(false))} />
        )}
        {!isMarkdown && editorReady && statsOpen && (
          <StatsPanel editor={editor} onClose={() => dispatch(setStatsPanelOpen(false))} />
        )}
        {!isMarkdown && backlinksOpen && (
          <BacklinksPanel onClose={() => dispatch(setBacklinksPanelOpen(false))} />
        )}
          </div>

          {!isMarkdown && !focusMode && (
            <EditorStatusBar
              currentPage={currentPage}
              pageCount={pageCount}
              onPageChange={scrollToPage}
              onPrint={handlePrint}
              onOpenPageSetup={() => setPageSetupOpen(true)}
            />
          )}
        </div>

        {!isMarkdown && !focusMode && <EditorPanelRail />}
      </div>

      <PageSetupDialog open={pageSetupOpen} onClose={() => setPageSetupOpen(false)} />
      {!isMarkdown && editorReady && <WikiLinkHoverCard editor={editor} />}
    </div>
  )
}
