import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { mergeTagsAcrossLibrary, renameTagAcrossLibrary } from '@/lib/library/tag-ops'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { updateDocuments } from '@/store/documentsSlice'
import type { DocumentSummary } from '@/lib/db/api'

type TagManageDialogProps = {
  open: boolean
  onClose: () => void
  tags: string[]
}

function applyTagChangeLocally(
  documents: DocumentSummary[],
  mapper: (tags: string[]) => string[],
): DocumentSummary[] {
  return documents.map((doc) => {
    if (doc.deletedAt != null) return doc
    const next = [...new Set(mapper(doc.tags))]
    if (next.length === doc.tags.length && next.every((tag, i) => tag === doc.tags[i])) {
      return doc
    }
    return { ...doc, tags: next }
  })
}

export function TagManageDialog({ open, onClose, tags }: TagManageDialogProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const documents = useAppSelector((state) => state.documents.documents)
  const [selected, setSelected] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [mergeTarget, setMergeTarget] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleRename() {
    if (!selected || !renameTo.trim()) return
    setBusy(true)
    try {
      const count = await renameTagAcrossLibrary(documents, selected, renameTo.trim())
      dispatch(
        updateDocuments((prev) =>
          applyTagChangeLocally(prev, (docTags) =>
            docTags.map((tag) => (tag === selected ? renameTo.trim() : tag)),
          ),
        ),
      )
      toast.success(t('library.tags.renamed', { count }))
      setSelected(null)
      setRenameTo('')
    } catch (error) {
      toast.error(t('library.tags.renameError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleMerge() {
    if (!selected || !mergeTarget.trim()) return
    setBusy(true)
    try {
      const count = await mergeTagsAcrossLibrary(documents, [selected], mergeTarget.trim())
      dispatch(
        updateDocuments((prev) =>
          applyTagChangeLocally(prev, (docTags) => {
            const without = docTags.filter((tag) => tag !== selected)
            return without.includes(mergeTarget.trim()) ? without : [...without, mergeTarget.trim()]
          }),
        ),
      )
      toast.success(t('library.tags.merged', { count }))
      setSelected(null)
      setMergeTarget('')
    } catch (error) {
      toast.error(t('library.tags.mergeError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-[420px]" showClose>
        <DialogHeader>
          <DialogTitle>{t('library.tags.manageTitle')}</DialogTitle>
        </DialogHeader>
        <p className="m-0 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
          {t('library.tags.manageHint')}
        </p>
        <div className="max-h-40 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] p-1">
          {tags.length === 0 ? (
            <p className="m-0 px-2 py-3 text-[12px] text-[var(--color-muted-foreground)]">
              {t('library.tags.empty')}
            </p>
          ) : (
            tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`flex w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12px] ${
                  selected === tag ? 'bg-[var(--color-selection)] text-[var(--color-accent)]' : 'hover:bg-[var(--color-hover)]'
                }`}
                onClick={() => {
                  setSelected(tag)
                  setRenameTo(tag)
                  setMergeTarget(tag)
                }}
              >
                {tag}
              </button>
            ))
          )}
        </div>
        {selected && (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-[var(--color-muted-foreground)]">
                {t('library.tags.renameLabel')}
              </span>
              <Input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} className="h-8 text-[12px]" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-[var(--color-muted-foreground)]">
                {t('library.tags.mergeInto')}
              </span>
              <Input value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} className="h-8 text-[12px]" />
            </label>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
          {selected && (
            <>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void handleMerge()}>
                {t('library.tags.merge')}
              </Button>
              <Button type="button" variant="default" size="sm" disabled={busy} onClick={() => void handleRename()}>
                {t('library.tags.rename')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
