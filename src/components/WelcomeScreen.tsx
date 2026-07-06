import { useMemo } from 'react'
import { ArrowRight, Clock, FileText, FolderInput, Plus, Sparkles } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { APP_SHORTCUTS } from '@/lib/shortcuts'
import { pickAndImportFile } from '@/lib/db/api'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { toast } from '@/lib/toast'
import { ROUTES } from '@/lib/routes'
import { formatRelativeTime } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'
import { setTemplatePickerOpen } from '@/store/settingsSlice'

export function WelcomeScreen() {
  const documents = useAppSelector((state) => state.documents.documents)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const recentDocuments = useMemo(
    () => [...documents].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8),
    [documents],
  )

  async function handleImport() {
    const doc = await pickAndImportFile()
    if (!doc) return
    dispatch(updateDocuments((prev) => prependDocumentSummary(prev, doc)))
    dispatch(setActiveDocumentId(doc.id))
    dispatch(setActiveDocument(doc))
    dispatch(setSaveStatus('saved'))
    toast.success('Dokument importovaný', doc.title)
    navigate(ROUTES.document(doc.id))
  }

  function openDocument(id: string) {
    dispatch(setActiveDocumentId(id))
    const cached = peekCachedDocument(id)
    if (cached) dispatch(setActiveDocument(cached))
    navigate(ROUTES.document(id))
  }

  return (
    <div className="titlebar-no-drag flex min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-[1080px] gap-8 p-8 max-[900px]:p-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-[11px] font-medium text-[var(--color-muted-foreground)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            Lokálny editor dokumentov
          </div>

          <div>
            <h1 className="m-0 text-[clamp(28px,4vw,40px)] font-bold leading-[1.05] tracking-[-0.04em] text-[var(--color-foreground)]">
              Píšte, organizujte a exportujte na jednom mieste.
            </h1>
            <p className="mt-3 max-w-[48ch] text-[15px] leading-relaxed text-[var(--color-muted-foreground)]">
              Vytvorte nový dokument zo šablóny, importujte existujúci súbor alebo pokračujte tam, kde ste prestali.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Button variant="default" size="default" onClick={() => dispatch(setTemplatePickerOpen(true))}>
              <Plus className="h-4 w-4" />
              Nový dokument
            </Button>
            <Button variant="outline" size="default" onClick={() => void handleImport()}>
              <FolderInput className="h-4 w-4" />
              Importovať
            </Button>
          </div>

          <Card className="grid gap-2 p-4 sm:grid-cols-2">
            {APP_SHORTCUTS.slice(0, 4).map((shortcut) => (
              <Shortcut key={shortcut.label} label={shortcut.label} keys={shortcut.keys} />
            ))}
          </Card>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--color-muted-foreground)]">
              Nedávne dokumenty
            </h2>
            <span className="text-[11px] text-[var(--color-muted-foreground)]">
              {documents.length} celkom
            </span>
          </div>

          {recentDocuments.length > 0 ? (
            <Card className="overflow-hidden">
              <ul className="m-0 list-none divide-y divide-[var(--color-border)] p-0">
                {recentDocuments.map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      className="group flex w-full items-center gap-3 bg-transparent px-4 py-3 text-left transition-colors hover:bg-[var(--color-hover)]"
                      onClick={() => openDocument(doc.id)}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--color-border)] bg-[var(--color-canvas)] text-[var(--color-accent)]">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="m-0 truncate text-[13px] font-semibold text-[var(--color-foreground)]">
                          {doc.title}
                        </p>
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(doc.updatedAt)}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-[16px] border border-[var(--color-border)] bg-[var(--color-canvas)] text-[var(--color-accent)]">
                <FileText className="h-7 w-7 stroke-[1.25]" />
              </div>
              <div>
                <p className="m-0 text-[14px] font-semibold text-[var(--color-foreground)]">
                  Zatiaľ žiadne dokumenty
                </p>
                <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
                  Začnite novým dokumentom alebo importom.
                </p>
              </div>
            </Card>
          )}
        </section>
      </div>
    </div>
  )
}

function Shortcut({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] px-1 py-1">
      <span className="text-[12px] text-[var(--color-muted-foreground)]">{label}</span>
      <span className="flex gap-1">
        {keys.map((key) => (
          <kbd
            key={key}
            className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 font-sans text-[11px] text-[var(--color-foreground)] shadow-[0_1px_0_rgba(0,0,0,0.04)]"
          >
            {key}
          </kbd>
        ))}
      </span>
    </div>
  )
}
