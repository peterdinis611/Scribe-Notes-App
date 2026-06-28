import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { DocumentOutlinePanel } from '@/components/editor/DocumentOutlinePanel'
import { RevisionHistoryPanel } from '@/components/editor/RevisionHistoryPanel'
import { EditorToolbar } from '@/components/editor-toolbar/EditorToolbar'
import { EditorMenus } from '@/components/editor/EditorMenus'
import { EditorDropZone } from '@/components/editor/EditorDropOverlay'
import { EDITOR_PAGE_GAP, EditorPageSheets, getEditorPrintStageSize } from '@/components/editor/EditorPageSheets'
import { EditorPrintLayoutBar } from '@/components/editor/EditorPrintLayoutBar'
import { PageHeaderFooterOverlays } from '@/components/editor/PageHeaderFooterOverlays'
import { PageWatermarkOverlays } from '@/components/editor/PageWatermarkOverlays'
import { MarkdownSourceEditor } from '@/components/editor/MarkdownSourceEditor'
import { EditorHeader } from '@/components/TopBar'
import { EditorPagination } from '@/components/EditorPagination'
import { useDocumentAutoSave } from '@/hooks/useDocumentAutoSave'
import { useDocumentPagination } from '@/hooks/useDocumentPagination'
import { useEditorHotkeys } from '@/hooks/useEditorHotkeys'
import {
  getCachedContentHash,
  getCachedParsedContent,
} from '@/lib/cache/document-cache'
import { resolvePageLayout } from '@/lib/editor/page-layout'
import { normalizePageSetup, PAPER_SIZES } from '@/lib/editor/page-setup'
import { getEditorExtensions } from '@/lib/editor/extensions'
import { getEditorMarkdown } from '@/lib/editor/markdown-content'
import { insertImagesFromFiles } from '@/lib/editor/image-utils'
import { printDocumentFromContent } from '@/lib/export/print-document'
import { cn } from '@/lib/utils'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentOutlineOpenAtom,
  documentsAtom,
  focusModeAtom,
  manualTitleDocumentIdsAtom,
  revisionHistoryOpenAtom,
  saveStatusAtom,
} from '@/store/documents'
import {
  editorModeActionsAtom,
  editorViewModeAtom,
  pageSetupAtom,
  printLayoutColumnsAtom,
  printLayoutEnabledAtom,
  printZoomAtom,
  setEditorViewModeAtom,
  spellCheckEnabledAtom,
} from '@/store/settings'

export function DocumentEditor() {
  const [activeId] = useAtom(activeDocumentIdAtom)
  const [activeDocument, setActiveDocument] = useAtom(activeDocumentAtom)
  const manualTitleIds = useAtomValue(manualTitleDocumentIdsAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const setSaveStatus = useSetAtom(saveStatusAtom)
  const viewMode = useAtomValue(editorViewModeAtom)
  const persistViewMode = useSetAtom(setEditorViewModeAtom)
  const setEditorModeActions = useSetAtom(editorModeActionsAtom)
  const outlineOpen = useAtomValue(documentOutlineOpenAtom)
  const historyOpen = useAtomValue(revisionHistoryOpenAtom)
  const focusMode = useAtomValue(focusModeAtom)
  const setOutlineOpen = useSetAtom(documentOutlineOpenAtom)
  const setHistoryOpen = useSetAtom(revisionHistoryOpenAtom)
  const [markdownDraft, setMarkdownDraft] = useState('')
  const activeDocumentRef = useRef(activeDocument)
  const manualTitleIdsRef = useRef(manualTitleIds)
  const editorRef = useRef<Editor | null>(null)
  const markdownDraftRef = useRef('')
  const queueSaveRef = useRef<(docId: string) => void>(() => {})
  const activeIdRef = useRef(activeId)
  const viewModeRef = useRef(viewMode)

  activeDocumentRef.current = activeDocument
  manualTitleIdsRef.current = manualTitleIds
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

  const pageSetup = useAtomValue(pageSetupAtom)
  const spellCheckEnabled = useAtomValue(spellCheckEnabledAtom)
  const printLayoutEnabled = useAtomValue(printLayoutEnabledAtom)
  const printZoom = useAtomValue(printZoomAtom)
  const printColumns = useAtomValue(printLayoutColumnsAtom)
  const normalizedPageSetup = useMemo(() => normalizePageSetup(pageSetup), [pageSetup])
  const pageLayout = useMemo(() => resolvePageLayout(pageSetup), [pageSetup])
  const paper = PAPER_SIZES[normalizedPageSetup.paperSize]

  const editor = useEditor({
    extensions,
    content: initialContent,
    immediatelyRender: false,
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
  }, [extensions, initialContent, spellCheckEnabled, printLayoutEnabled])

  editorRef.current = editor

  const { queueSave, flushSave, editorContentHashRef, lastPersistedHashRef } = useDocumentAutoSave({
    editor,
    activeId,
    viewMode,
    markdownDraftRef,
    manualTitleIdsRef,
    activeDocumentRef,
    setActiveDocument,
    setDocuments,
    setSaveStatus,
  })

  queueSaveRef.current = queueSave

  const switchToMarkdown = useCallback(() => {
    if (!editor) return
    const markdown = getEditorMarkdown(editor)
    markdownDraftRef.current = markdown
    setMarkdownDraft(markdown)
    persistViewMode('markdown')
  }, [editor, persistViewMode])

  const switchToRich = useCallback(() => {
    if (!editor) return
    editor.commands.setContent(markdownDraftRef.current, {
      contentType: 'markdown',
      emitUpdate: false,
    })
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
    setEditorModeActions({
      viewMode,
      switchToMarkdown,
      switchToRich,
    })
    return () => setEditorModeActions(null)
  }, [setEditorModeActions, switchToMarkdown, switchToRich, viewMode])

  useEditorHotkeys(editor)

  useEffect(() => {
    if (!editor) return
    editor.view.dom.setAttribute('spellcheck', spellCheckEnabled ? 'true' : 'false')
    editor.view.dom.setAttribute('lang', 'sk')
    editor.view.dom.classList.toggle('tiptap--print-accurate', printLayoutEnabled)
  }, [editor, printLayoutEnabled, spellCheckEnabled])

  const {
    scrollRef,
    canvasRef,
    pageCount,
    currentPage,
    pageSegments,
    scrollToPage,
  } = useDocumentPagination({ editor, documentId: activeId, pageSetup, pageLayout })

  const stageSize = useMemo(
    () => getEditorPrintStageSize(pageCount, printColumns, pageSetup),
    [pageCount, printColumns, pageSetup],
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

  useEffect(() => {
    if (!editor || !activeDocument) return

    const incomingHash = getCachedContentHash(activeDocument)
    if (incomingHash === editorContentHashRef.current) return

    editor.commands.setContent(getCachedParsedContent(activeDocument), { emitUpdate: false })
    editorContentHashRef.current = incomingHash
    lastPersistedHashRef.current = incomingHash

    const markdown = getEditorMarkdown(editor)
    markdownDraftRef.current = markdown
    setMarkdownDraft(markdown)
    setSaveStatus('saved')
  }, [activeDocument, activeId, editor, editorContentHashRef, lastPersistedHashRef, setSaveStatus])

  useEffect(() => {
    editorContentHashRef.current = null
    lastPersistedHashRef.current = null
  }, [activeId, editorContentHashRef, lastPersistedHashRef])

  const isMarkdown = viewMode === 'markdown'

  return (
    <div className={cn('editor-shell', isMarkdown && 'editor-shell--markdown', focusMode && 'editor-shell--focus')}>
      <EditorHeader onPrint={!isMarkdown ? handlePrint : undefined} />
      {!isMarkdown && !focusMode && <EditorToolbar editor={editor} onInsertImages={handleInsertImages} />}
      {!isMarkdown && <EditorMenus editor={editor} onInsertImages={handleInsertImages} />}

      <div
        className={cn(
          'editor-body',
          (outlineOpen || historyOpen) && !isMarkdown && 'editor-body--with-outline',
        )}
      >
        <EditorDropZone
          className={cn('editor-scroll', printLayoutEnabled && !isMarkdown && 'editor-scroll--print-layout')}
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
                      transform: `scale(${printZoom})`,
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
                  />
                  <PageWatermarkOverlays
                    pageSetup={pageSetup}
                    pageSegments={pageSegments}
                    columns={printColumns}
                    paperWidth={paper.width}
                    paperHeight={paper.height}
                    gap={EDITOR_PAGE_GAP}
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
                              width: printColumns === 2 ? stageSize.width : pageLayout.width,
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

        {!isMarkdown && outlineOpen && (
          <DocumentOutlinePanel editor={editor} onClose={() => setOutlineOpen(false)} />
        )}
        {!isMarkdown && historyOpen && (
          <RevisionHistoryPanel onClose={() => setHistoryOpen(false)} />
        )}
      </div>

      {!isMarkdown && !focusMode && (
        <>
          <EditorPrintLayoutBar onPrint={handlePrint} />
          <EditorPagination
            currentPage={currentPage}
            pageCount={pageCount}
            onPageChange={scrollToPage}
          />
        </>
      )}
    </div>
  )
}
