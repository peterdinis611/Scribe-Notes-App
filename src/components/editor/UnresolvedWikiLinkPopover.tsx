import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FilePlus2, Link2, LoaderCircle } from 'lucide-react'
import {
  createDocument,
  findDocumentsByTitle,
  resolveWikiLink,
  type TitleMatch,
} from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { toast } from '@/lib/toast'
import { requireOpenEditor } from '@/lib/editor/insert-ai-answer'
import { store } from '@/store/index'
import { updateDocuments } from '@/store/documentsSlice'
import { cn } from '@/lib/utils'

export type UnresolvedWikiPopoverState = {
  label: string
  /** Note title used for resolution (without `#heading` / `|alias`). */
  linkTitle: string
  x: number
  y: number
}

type UnresolvedWikiLinkPopoverProps = {
  state: UnresolvedWikiPopoverState | null
  documentId: string | null
  onClose: () => void
}

export function UnresolvedWikiLinkPopover({
  state,
  documentId,
  onClose,
}: UnresolvedWikiLinkPopoverProps) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const [suggestions, setSuggestions] = useState<TitleMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!state) {
      setSuggestions([])
      return
    }
    let cancelled = false
    setLoading(true)
    void findDocumentsByTitle(state.linkTitle, 6)
      .then((hits) => {
        if (!cancelled) setSuggestions(hits.filter((hit) => hit.score >= 0.55))
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [state])

  useEffect(() => {
    if (!state) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
    }
  }, [onClose, state])

  if (!state) return null

  const left = Math.min(state.x, window.innerWidth - 280)
  const top = Math.min(state.y, window.innerHeight - 220)

  async function applyTarget(targetId: string, title: string) {
    if (!documentId || busy) return
    const editor = requireOpenEditor()
    if (!editor) return
    setBusy(true)
    try {
      editor
        .chain()
        .focus()
        .resolveWikiLinkLabel({ label: state!.label, linkTitle: state!.linkTitle, targetId })
        .run()
      await resolveWikiLink(documentId, state!.label, targetId)
      toast.success(t('wikiLink.resolvedToast', { label: state!.label, title }))
      onClose()
    } catch (error) {
      toast.error(t('wikiLink.resolveError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  async function createNote() {
    if (!documentId || busy) return
    const editor = requireOpenEditor()
    if (!editor) return
    setBusy(true)
    try {
      const doc = await createDocument({ title: state!.linkTitle })
      store.dispatch(updateDocuments((prev) => prependDocumentSummary(prev, doc)))
      editor
        .chain()
        .focus()
        .resolveWikiLinkLabel({
          label: state!.label,
          linkTitle: state!.linkTitle,
          targetId: doc.id,
        })
        .run()
      await resolveWikiLink(documentId, state!.label, doc.id)
      toast.success(t('wikiLink.createdToast', { title: doc.title }))
      onClose()
    } catch (error) {
      toast.error(t('wikiLink.createError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      ref={rootRef}
      className="wiki-unresolved-popover"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      role="dialog"
      aria-label={t('wikiLink.unresolvedTitle')}
    >
      <p className="wiki-unresolved-popover__title">
        <Link2 className="h-3.5 w-3.5 opacity-70" aria-hidden />
        [[{state.label}]]
      </p>
      <p className="wiki-unresolved-popover__hint">{t('wikiLink.unresolvedHint')}</p>

      {loading ? (
        <p className="wiki-unresolved-popover__status">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {t('common.loading')}
        </p>
      ) : suggestions.length > 0 ? (
        <ul className="wiki-unresolved-popover__list">
          {suggestions.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="wiki-unresolved-popover__item"
                disabled={busy}
                onClick={() => void applyTarget(hit.id, hit.title)}
              >
                <span className="wiki-unresolved-popover__item-title">{hit.title}</span>
                <span className="wiki-unresolved-popover__item-score">
                  {Math.round(hit.score * 100)}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="wiki-unresolved-popover__status">{t('wikiLink.noSuggestions')}</p>
      )}

      <button
        type="button"
        className={cn('wiki-unresolved-popover__create', busy && 'is-busy')}
        disabled={busy}
        onClick={() => void createNote()}
      >
        <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
        {t('wikiLink.createNote', { title: state.linkTitle })}
      </button>
    </div>
  )
}
