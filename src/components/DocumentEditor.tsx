import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { EditorToolbar } from '@/components/editor-toolbar/EditorToolbar'
import { EditorMenus } from '@/components/editor/EditorMenus'
import { EditorHeader } from '@/components/TopBar'
import { EditorPagination } from '@/components/EditorPagination'
import { useDocumentPagination } from '@/hooks/useDocumentPagination'
import { EDITOR_PAGE } from '@/lib/editor/page-layout'
import { getEditorExtensions } from '@/lib/editor/extensions'
import { insertImagesFromFiles } from '@/lib/editor/image-utils'
import { updateDocument } from '@/lib/db/api'
import { debounce, extractTitleFromContent } from '@/lib/utils'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
  manualTitleDocumentIdsAtom,
  saveStatusAtom,
} from '@/store/documents'

export function DocumentEditor() {
  const [activeId] = useAtom(activeDocumentIdAtom)
  const [activeDocument, setActiveDocument] = useAtom(activeDocumentAtom)
  const manualTitleIds = useAtomValue(manualTitleDocumentIdsAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const setSaveStatus = useSetAtom(saveStatusAtom)
  const latestDocIdRef = useRef<string | null>(null)
  const activeDocumentRef = useRef(activeDocument)
  const manualTitleIdsRef = useRef(manualTitleIds)
  const editorRef = useRef<Editor | null>(null)

  activeDocumentRef.current = activeDocument
  manualTitleIdsRef.current = manualTitleIds

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

  const saveDocument = useMemo(
    () =>
      debounce(async (docId: string, json: JSONContent) => {
        if (latestDocIdRef.current !== docId) return

        const contentJson = JSON.stringify(json)
        const title = manualTitleIdsRef.current.has(docId)
          ? activeDocumentRef.current?.title ?? extractTitleFromContent(contentJson)
          : extractTitleFromContent(contentJson)

        try {
          setSaveStatus('saving')
          const updated = await updateDocument({
            id: docId,
            title,
            contentJson,
          })

          if (latestDocIdRef.current !== docId) return

          setActiveDocument(updated)
          setDocuments((prev) =>
            prev.map((item) =>
              item.id === updated.id
                ? {
                    ...item,
                    title: updated.title,
                    filePath: updated.filePath,
                    updatedAt: updated.updatedAt,
                  }
                : item,
            ),
          )
          setSaveStatus('saved')
        } catch {
          setSaveStatus('error')
        }
      }, 600),
    [setActiveDocument, setDocuments, setSaveStatus],
  )

  const editor = useEditor({
    extensions,
    content: activeDocument?.contentJson
      ? JSON.parse(activeDocument.contentJson)
      : undefined,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tiptap',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (!activeId) return
      saveDocument(activeId, currentEditor.getJSON())
    },
  })

  editorRef.current = editor

  const {
    scrollRef,
    canvasRef,
    pageCount,
    currentPage,
    scrollToPage,
  } = useDocumentPagination({ editor, documentId: activeId })

  useEffect(() => {
    latestDocIdRef.current = activeId

    if (!editor || !activeDocument) return

    const parsed = JSON.parse(activeDocument.contentJson) as JSONContent
    const current = editor.getJSON()

    if (JSON.stringify(current) !== JSON.stringify(parsed)) {
      editor.commands.setContent(parsed, { emitUpdate: false })
    }
  }, [activeDocument, activeId, editor])

  return (
    <div className="editor-shell">
      <EditorHeader />
      <EditorToolbar editor={editor} onInsertImages={handleInsertImages} />
      <EditorMenus editor={editor} onInsertImages={handleInsertImages} />

      <div className="editor-scroll" ref={scrollRef}>
        <div
          ref={canvasRef}
          className="editor-canvas editor-canvas--paginated"
          style={
            {
              '--page-content-height': `${EDITOR_PAGE.contentHeight}px`,
              '--page-padding-top': `${EDITOR_PAGE.paddingTop}px`,
            } as CSSProperties
          }
        >
          <div className="editor-page-label" aria-hidden="true">
            Strana {currentPage}
          </div>
          {pageCount > 1 &&
            Array.from({ length: pageCount - 1 }, (_, index) => (
              <div
                key={index}
                className="editor-page-break"
                style={{ top: EDITOR_PAGE.paddingTop + (index + 1) * EDITOR_PAGE.contentHeight }}
                aria-hidden="true"
              />
            ))}
          <EditorContent editor={editor} />
        </div>
      </div>

      <EditorPagination
        currentPage={currentPage}
        pageCount={pageCount}
        onPageChange={scrollToPage}
      />
    </div>
  )
}
