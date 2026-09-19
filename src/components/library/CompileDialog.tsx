import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { createDocument, getDocument } from '@/lib/db/api'
import { upsertManuscript } from '@/lib/db/libraries-api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { visibleLibraryDocuments } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId, updateDocuments } from '@/store/documentsSlice'
import { setCompileDialogOpen } from '@/store/uiSlice'

type TipTapDoc = { type?: string; content?: unknown[] }

function mergeChapters(chapters: { title: string; contentJson: string }[]): string {
  const content: unknown[] = []
  for (const chapter of chapters) {
    content.push({
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: chapter.title }],
    })
    try {
      const parsed = JSON.parse(chapter.contentJson) as TipTapDoc
      if (Array.isArray(parsed.content)) content.push(...parsed.content)
    } catch {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: chapter.contentJson }],
      })
    }
  }
  return JSON.stringify({ type: 'doc', content })
}

export function CompileDialog() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const open = useAppSelector((state) => state.ui.compileDialogOpen)
  const documents = useAppSelector((state) => state.documents.documents)
  const visible = useMemo(() => visibleLibraryDocuments(documents), [documents])
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  function close() {
    dispatch(setCompileDialogOpen(false))
    setSelected([])
    setTitle('')
  }

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  async function compile() {
    if (selected.length === 0) return
    setBusy(true)
    try {
      const chapters = []
      for (const id of selected) {
        const doc = await getDocument(id)
        chapters.push({ title: doc.title, contentJson: doc.contentJson })
      }
      const compiledTitle = title.trim() || t('compile.untitled')
      await upsertManuscript({ title: compiledTitle, chapterIds: selected })
      const created = await createDocument({
        title: compiledTitle,
        contentJson: mergeChapters(chapters),
      })
      dispatch(updateDocuments((prev) => prependDocumentSummary(prev, created)))
      dispatch(setActiveDocumentId(created.id))
      void navigate(ROUTES.document(created.id))
      toast.success(t('compile.doneTitle'), t('compile.doneHint', { count: selected.length }))
      close()
    } catch (error) {
      toast.error(t('compile.error'), String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      {open && (
        <DialogContent className="titlebar-no-drag compile-dialog">
          <DialogHeader>
            <DialogTitle>{t('compile.title')}</DialogTitle>
            <DialogDescription>{t('compile.hint')}</DialogDescription>
          </DialogHeader>
          <Input
            value={title}
            placeholder={t('compile.titlePlaceholder')}
            onChange={(event) => setTitle(event.target.value)}
          />
          <ol className="compile-chapter-list">
            {visible.map((doc) => (
              <li key={doc.id}>
                <label className="compile-chapter-row">
                  <input
                    type="checkbox"
                    checked={selected.includes(doc.id)}
                    onChange={() => toggle(doc.id)}
                  />
                  <span>{doc.title}</span>
                </label>
              </li>
            ))}
          </ol>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || selected.length === 0}
              onClick={() => void compile()}
            >
              {t('compile.action')}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
