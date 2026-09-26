import { useCallback, useEffect, useState } from 'react'
import { FileText, FolderKanban, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { IconTooltip } from '@/components/ui/tooltip'
import {
  deleteSmartFolder,
  evaluateSmartFolder,
  listSmartFolders,
  upsertSmartFolder,
  type SmartFolderMatch,
  type SmartFolderRecord,
} from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

type SmartFoldersSectionProps = {
  onNavigate?: () => void
}

export default function SmartFoldersSection({ onNavigate }: SmartFoldersSectionProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [folders, setFolders] = useState<SmartFolderRecord[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [matches, setMatches] = useState<SmartFolderMatch[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [rule, setRule] = useState('')

  const refresh = useCallback(async () => {
    try {
      setFolders(await listSmartFolders())
    } catch (error) {
      console.warn('[scribe] list smart folders failed', error)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !rule.trim() || busy) return
    setBusy(true)
    try {
      const created = await upsertSmartFolder({
        name: name.trim(),
        queryRule: rule.trim(),
      })
      setName('')
      setRule('')
      setIsOpen(false)
      await refresh()
      setActiveId(created.id)
      const evaluated = await evaluateSmartFolder({ id: created.id })
      setMatches(evaluated.matches)
    } catch (error) {
      toast.error(t('smartFolders.saveFailed'), String(error))
    } finally {
      setBusy(false)
    }
  }

  const handleSelect = async (folder: SmartFolderRecord) => {
    setActiveId(folder.id)
    setBusy(true)
    try {
      const evaluated = await evaluateSmartFolder({ id: folder.id })
      setMatches(evaluated.matches)
    } catch (error) {
      toast.error(t('smartFolders.evalFailed'), String(error))
      setMatches([])
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (folder: SmartFolderRecord) => {
    setBusy(true)
    try {
      await deleteSmartFolder(folder.id)
      if (activeId === folder.id) {
        setActiveId(null)
        setMatches(null)
      }
      await refresh()
    } catch (error) {
      toast.error(t('smartFolders.deleteFailed'), String(error))
    } finally {
      setBusy(false)
    }
  }

  const openDocument = (documentId: string) => {
    void navigate(ROUTES.document(documentId))
    onNavigate?.()
  }

  return (
    <div className="smart-folders px-1.5 pb-2 pt-1">
      <div className="flex items-center justify-between gap-1 px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
        <div className="flex items-center gap-1.5">
          <FolderKanban className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden />
          <span>{t('smartFolders.title')}</span>
        </div>
        <IconTooltip label={t('smartFolders.add')}>
          <button
            type="button"
            onClick={() => setIsOpen((value) => !value)}
            className="rounded p-0.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]"
            aria-label={t('smartFolders.add')}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </IconTooltip>
      </div>

      {isOpen && (
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="mt-1 flex flex-col gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[12px]"
        >
          <input
            type="text"
            placeholder={t('smartFolders.namePlaceholder')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1"
          />
          <input
            type="text"
            placeholder={t('smartFolders.rulePlaceholder')}
            value={rule}
            onChange={(event) => setRule(event.target.value)}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1"
          />
          <p className="m-0 text-[10.5px] text-[var(--color-muted-foreground)]">
            {t('smartFolders.ruleHint')}
          </p>
          <div className="mt-0.5 flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded px-2 py-0.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-[var(--color-accent)] px-2.5 py-0.5 font-medium text-[var(--color-accent-foreground,#fff)] disabled:opacity-50"
            >
              {t('common.create')}
            </button>
          </div>
        </form>
      )}

      <div className="mt-0.5 flex flex-col gap-0.5">
        {folders.length === 0 && !isOpen ? (
          <p className="m-0 px-1 py-1.5 text-[11px] text-[var(--color-muted-foreground)]">
            {t('smartFolders.empty')}
          </p>
        ) : (
          folders.map((folder) => {
            const isActive = activeId === folder.id
            return (
              <div
                key={folder.id}
                className={cn(
                  'group flex items-center gap-1 rounded-md',
                  isActive && 'bg-[var(--color-selection)]',
                )}
              >
                <button
                  type="button"
                  onClick={() => void handleSelect(folder)}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[12px] transition-colors',
                    isActive
                      ? 'font-medium text-[var(--color-foreground)]'
                      : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
                  )}
                >
                  <Sparkles className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />
                  <span className="truncate">{folder.name}</span>
                </button>
                <IconTooltip label={t('smartFolders.remove')}>
                  <button
                    type="button"
                    className="mr-1 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--color-hover)]"
                    aria-label={t('smartFolders.remove')}
                    disabled={busy}
                    onClick={() => void handleDelete(folder)}
                  >
                    <Trash2 className="h-3 w-3 text-[var(--color-muted-foreground)]" />
                  </button>
                </IconTooltip>
              </div>
            )
          })
        )}
      </div>

      {matches !== null && (
        <div className="smart-folders__results mt-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-2 py-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
              {t('smartFolders.results', { count: matches.length })}
            </span>
            <button
              type="button"
              className="rounded p-0.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)]"
              aria-label={t('common.close')}
              onClick={() => {
                setMatches(null)
                setActiveId(null)
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {matches.length === 0 ? (
            <p className="m-0 px-2 py-2 text-[11px] text-[var(--color-muted-foreground)]">
              {t('smartFolders.noMatches')}
            </p>
          ) : (
            <ul className="m-0 max-h-48 list-none overflow-y-auto p-1">
              {matches.map((match) => (
                <li key={match.documentId}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-[var(--color-foreground)] hover:bg-[var(--color-hover)]"
                    onClick={() => openDocument(match.documentId)}
                  >
                    <FileText className="h-3 w-3 shrink-0 text-[var(--color-muted-foreground)]" />
                    <span className="truncate">{match.title || t('common.untitled')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
