import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { getDocument, updateDocument } from '@/lib/db/api'
import { peekCachedDocument, cacheDocument, getCachedParsedContent } from '@/lib/cache/document-cache'
import { getEditorExtensions } from '@/lib/editor/extensions'
import { setEditorContent } from '@/lib/editor/view-ready'
import { debounce } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAppDispatch } from '@/store/hooks'
import { setSecondaryDocumentId, updateDocuments } from '@/store/documentsSlice'

type SecondaryDocumentPaneProps = {
  documentId: string
}

export function SecondaryDocumentPane({ documentId }: SecondaryDocumentPaneProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const [title, setTitle] = useState(t('common.loading'))
  const [ready, setReady] = useState(false)
  const saveRef = useRef<(json: string) => void>(() => {})

  const extensions = useMemo(() => getEditorExtensions(), [])

  const editor = useEditor({
    extensions,
    editable: true,
    editorProps: {
      attributes: {
        class: 'secondary-pane-editor prose max-w-none focus:outline-none',
      },
    },
    onUpdate: ({ editor: current }) => {
      saveRef.current(JSON.stringify(current.getJSON()))
    },
  })

  const persist = useMemo(
    () =>
      debounce(async (contentJson: string) => {
        try {
          const updated = await updateDocument({ id: documentId, contentJson })
          cacheDocument(updated)
          dispatch(
            updateDocuments((prev) =>
              prev.map((doc) =>
                doc.id === updated.id
                  ? {
                      ...doc,
                      title: updated.title,
                      updatedAt: updated.updatedAt,
                    }
                  : doc,
              ),
            ),
          )
        } catch {
          // Keep editing; primary save path surfaces errors elsewhere.
        }
      }, 700),
    [dispatch, documentId],
  )

  saveRef.current = persist

  useEffect(() => {
    let cancelled = false
    setReady(false)

    async function load() {
      try {
        const cached = peekCachedDocument(documentId)
        const doc = cached ?? (await getDocument(documentId))
        if (cancelled || !editor) return
        setTitle(doc.title || t('common.untitled'))
        setEditorContent(editor, getCachedParsedContent(doc), { emitUpdate: false })
        setReady(true)
      } catch {
        if (!cancelled) setTitle(t('common.untitled'))
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [documentId, editor, t])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-[var(--color-border)] bg-[var(--color-canvas)]">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3">
        <p className="m-0 min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--color-foreground)]">
          {title}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => dispatch(setSecondaryDocumentId(null))}
          title={t('split.close')}
          aria-label={t('split.close')}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!ready && (
          <p className="m-0 text-[12px] text-[var(--color-muted-foreground)]">{t('editor.loading')}</p>
        )}
        <EditorContent editor={editor} className={ready ? '' : 'invisible h-0'} />
      </div>
    </div>
  )
}
