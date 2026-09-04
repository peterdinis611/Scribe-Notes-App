import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { confirm } from '@tauri-apps/plugin-dialog'
import { CaseSensitive, Replace } from 'lucide-react'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  fetchDocumentFresh,
  libraryFindReplace,
  listDocuments,
  type LibraryFindReplaceHit,
} from '@/lib/db/api'
import { invalidateDocumentCache } from '@/lib/cache/document-cache'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setDocuments,
  setLibraryFindReplaceOpen,
  updateDocuments,
} from '@/store/documentsSlice'

export function LibraryFindReplaceDialog() {
  const { t } = useTranslation()
  const open = useAppSelector((state) => state.documents.libraryFindReplaceOpen)
  const activeDocumentId = useAppSelector((state) => state.documents.activeDocumentId)
  const dispatch = useAppDispatch()

  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [preview, setPreview] = useState<LibraryFindReplaceHit[]>([])
  const [loading, setLoading] = useState(false)
  const [replacing, setReplacing] = useState(false)

  const totalMatches = preview.reduce((sum, hit) => sum + hit.matchCount, 0)

  const reset = useCallback(() => {
    setQuery('')
    setReplacement('')
    setMatchCase(false)
    setPreview([])
    setLoading(false)
    setReplacing(false)
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const runPreview = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed) {
      setPreview([])
      return
    }
    setLoading(true)
    try {
      const hits = await libraryFindReplace({
        query: trimmed,
        replacement,
        dryRun: true,
        matchCase,
      })
      setPreview(hits)
    } catch (error) {
      toast.error(t('libraryFindReplace.previewError'), String(error))
    } finally {
      setLoading(false)
    }
  }, [matchCase, query, replacement, t])

  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => {
      void runPreview()
    }, 280)
    return () => window.clearTimeout(handle)
  }, [open, query, matchCase, runPreview])

  const handleReplaceAll = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed || preview.length === 0) return

    const confirmed = await confirm(
      t('libraryFindReplace.confirmMessage', {
        matches: totalMatches,
        documents: preview.length,
        query: trimmed,
      }),
      {
        title: t('libraryFindReplace.confirmTitle'),
        kind: 'warning',
        okLabel: t('libraryFindReplace.replaceAll'),
        cancelLabel: t('common.cancel'),
      },
    )
    if (!confirmed) return

    setReplacing(true)
    try {
      const hits = await libraryFindReplace({
        query: trimmed,
        replacement,
        dryRun: false,
        matchCase,
      })

      for (const hit of hits) {
        invalidateDocumentCache(hit.documentId)
      }

      const docs = await listDocuments()
      dispatch(setDocuments(docs))

      if (activeDocumentId && hits.some((hit) => hit.documentId === activeDocumentId)) {
        const fresh = await fetchDocumentFresh(activeDocumentId)
        dispatch(setActiveDocument(fresh))
        dispatch(
          updateDocuments((prev) =>
            prev.map((doc) =>
              doc.id === fresh.id
                ? { ...doc, title: fresh.title, updatedAt: fresh.updatedAt }
                : doc,
            ),
          ),
        )
      }

      const replacedMatches = hits.reduce((sum, hit) => sum + hit.matchCount, 0)
      toast.success(
        t('libraryFindReplace.replacedToast', {
          matches: replacedMatches,
          documents: hits.length,
        }),
      )
      dispatch(setLibraryFindReplaceOpen(false))
    } catch (error) {
      toast.error(t('libraryFindReplace.replaceError'), String(error))
    } finally {
      setReplacing(false)
    }
  }, [
    activeDocumentId,
    dispatch,
    matchCase,
    preview.length,
    query,
    replacement,
    t,
    totalMatches,
  ])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => dispatch(setLibraryFindReplaceOpen(next))}
    >
      <DialogContent className="max-w-[520px]" showClose>
        <DialogHeader>
          <DialogTitle>{t('libraryFindReplace.title')}</DialogTitle>
          <DialogDescription>{t('libraryFindReplace.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              className="h-9 flex-1 text-[13px]"
              placeholder={t('libraryFindReplace.findPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void runPreview()
                }
              }}
            />
            <button
              type="button"
              className={cn(
                'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)]',
                matchCase &&
                  'border-[color-mix(in_srgb,var(--color-accent)_40%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-[var(--color-accent)]',
              )}
              title={t('libraryFindReplace.matchCase')}
              aria-pressed={matchCase}
              onClick={() => setMatchCase((value) => !value)}
            >
              <CaseSensitive className="h-4 w-4" />
            </button>
          </div>

          <Input
            className="h-9 text-[13px]"
            placeholder={t('libraryFindReplace.replacePlaceholder')}
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
          />

          <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--color-muted-foreground)]">
            <span>
              {loading
                ? t('libraryFindReplace.scanning')
                : query.trim()
                  ? t('libraryFindReplace.previewSummary', {
                      matches: totalMatches,
                      documents: preview.length,
                    })
                  : t('libraryFindReplace.previewHint')}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              disabled={!query.trim() || loading}
              onClick={() => void runPreview()}
            >
              {t('libraryFindReplace.preview')}
            </Button>
          </div>

          <ScrollArea className="h-[220px] rounded-lg border border-[var(--color-border)]">
            {preview.length === 0 ? (
              <p className="m-0 px-3 py-8 text-center text-[12px] text-[var(--color-muted-foreground)]">
                {query.trim()
                  ? t('libraryFindReplace.noMatches')
                  : t('libraryFindReplace.previewHint')}
              </p>
            ) : (
              <ul className="m-0 list-none space-y-0 p-0">
                {preview.map((hit) => (
                  <li
                    key={hit.documentId}
                    className="border-b border-[var(--color-border)] px-3 py-2.5 last:border-b-0"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-[var(--color-foreground)]">
                        {hit.title.trim() || t('common.untitled')}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
                        {t('libraryFindReplace.matchCount', { count: hit.matchCount })}
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--color-muted-foreground)]">
                      {hit.preview}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="mt-1 gap-2 sm:justify-between">
          <p className="m-0 flex-1 text-[11px] leading-snug text-[var(--color-muted-foreground)]">
            {t('libraryFindReplace.scopeHint')}
          </p>
          <Button
            type="button"
            disabled={replacing || preview.length === 0 || !query.trim()}
            onClick={() => void handleReplaceAll()}
          >
            <Replace className="mr-1.5 h-3.5 w-3.5" />
            {replacing
              ? t('libraryFindReplace.replacing')
              : t('libraryFindReplace.replaceAll')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
