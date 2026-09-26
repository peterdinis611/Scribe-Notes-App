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
import {
  compileDocuments,
  exportDocument,
  revealInFinder,
} from '@/lib/db/api'
import { upsertManuscript } from '@/lib/db/libraries-api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { visibleLibraryDocuments } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId, updateDocuments } from '@/store/documentsSlice'
import { setCompileDialogOpen } from '@/store/uiSlice'

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
  const [exportFormat, setExportFormat] = useState<'none' | 'pdf' | 'docx'>('none')

  function close() {
    dispatch(setCompileDialogOpen(false))
    setSelected([])
    setTitle('')
    setExportFormat('none')
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
      const compiledTitle = title.trim() || t('compile.untitled')
      await upsertManuscript({ title: compiledTitle, chapterIds: selected })
      // Merge + create runs entirely in Rust (no TipTap blobs through IPC).
      const created = await compileDocuments(compiledTitle, selected)
      dispatch(updateDocuments((prev) => prependDocumentSummary(prev, created)))
      dispatch(setActiveDocumentId(created.id))
      void navigate(ROUTES.document(created.id))
      if (exportFormat !== 'none') {
        if (exportFormat === 'pdf' || exportFormat === 'docx') {
          const { tiptapJsonToHtmlAsync } = await import('@/lib/export/html')
          const { tiptapToPlainText } = await import('@/lib/export/plain-text')
          const html = await tiptapJsonToHtmlAsync(created.contentJson, created.title, {
            forPrint: true,
          })
          const result = await exportDocument(
            html,
            tiptapToPlainText(created.contentJson),
            created.title,
            exportFormat,
          )
          if (result?.path) {
            toast.success(
              t('compile.exportedTitle'),
              t('compile.exportedHint', {
                count: selected.length,
                format: exportFormat.toUpperCase(),
              }),
            )
            await revealInFinder(result.path)
          } else {
            toast.success(t('compile.doneTitle'), t('compile.doneHint', { count: selected.length }))
          }
        }
      } else {
        toast.success(t('compile.doneTitle'), t('compile.doneHint', { count: selected.length }))
      }
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
        <DialogContent className="max-w-[440px] titlebar-no-drag">
          <DialogHeader>
            <DialogTitle>{t('compile.title')}</DialogTitle>
            <DialogDescription>{t('compile.hint')}</DialogDescription>
          </DialogHeader>
          <Input
            value={title}
            placeholder={t('compile.titlePlaceholder')}
            onChange={(event) => setTitle(event.target.value)}
          />
          <ol className="mt-3 mb-0 max-h-60 list-none overflow-auto p-0">
            {visible.map((doc) => (
              <li key={doc.id}>
                <label className="flex min-h-7 items-center gap-2 text-[13px]">
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
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1 font-[family-name:var(--font-mono)] text-[10px] font-[650] uppercase tracking-[0.08em] text-[var(--color-muted-foreground)]">
              {t('compile.exportLabel')}
            </legend>
            <label className="flex items-center gap-2 text-[13px] text-[var(--color-foreground)]">
              <input
                type="radio"
                name="compile-export"
                checked={exportFormat === 'none'}
                onChange={() => setExportFormat('none')}
              />
              {t('compile.exportOpen')}
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[var(--color-foreground)]">
              <input
                type="radio"
                name="compile-export"
                checked={exportFormat === 'pdf'}
                onChange={() => setExportFormat('pdf')}
              />
              PDF
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[var(--color-foreground)]">
              <input
                type="radio"
                name="compile-export"
                checked={exportFormat === 'docx'}
                onChange={() => setExportFormat('docx')}
              />
              DOCX
            </label>
          </fieldset>
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
              {exportFormat === 'none' ? t('compile.action') : t('compile.actionExport')}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
