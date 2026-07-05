import { useMemo } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Clock, FileText, FolderInput, Plus } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { APP_SHORTCUTS } from '@/lib/shortcuts'
import { pickAndImportFile } from '@/lib/db/api'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { toast } from '@/lib/toast'
import { ROUTES } from '@/lib/routes'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
  saveStatusAtom,
} from '@/store/documents'
import { templatePickerOpenAtom } from '@/store/settings'

export function WelcomeScreen() {
  const documents = useAtomValue(documentsAtom)
  const setTemplatePickerOpen = useSetAtom(templatePickerOpenAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const setActiveId = useSetAtom(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setSaveStatus = useSetAtom(saveStatusAtom)
  const navigate = useNavigate()

  const recentDocuments = useMemo(
    () => [...documents].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6),
    [documents],
  )

  async function handleImport() {
    const doc = await pickAndImportFile()
    if (!doc) return
    setDocuments((prev) => prependDocumentSummary(prev, doc))
    setActiveId(doc.id)
    setActiveDocument(doc)
    setSaveStatus('saved')
    toast.success('Dokument importovaný', doc.title)
    navigate(ROUTES.document(doc.id))
  }

  function openDocument(id: string) {
    setActiveId(id)
    const cached = peekCachedDocument(id)
    if (cached) setActiveDocument(cached)
    navigate(ROUTES.document(id))
  }

  return (
    <div className="titlebar-no-drag flex flex-1 items-center justify-center p-8 max-[1100px]:px-4 max-[1100px]:py-6">
      <div className="max-w-[420px] text-center">
        <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-accent)] shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
          <FileText className="h-8 w-8 stroke-[1.25]" />
        </div>
        <h1 className="mb-2 text-2xl font-bold tracking-[-0.03em] text-[var(--color-foreground)]">
          Vitajte v Scribe
        </h1>
        <p className="mb-6 text-[14px] leading-relaxed text-[var(--color-muted-foreground)]">
          Vytvorte nový dokument, importujte existujúci súbor alebo pokračujte v písaní.
        </p>

        <div className="titlebar-no-drag mb-6 flex justify-center gap-2.5">
          <Button variant="default" onClick={() => setTemplatePickerOpen(true)}>
            <Plus className="h-4 w-4" />
            Nový dokument
          </Button>
          <Button variant="outline" onClick={() => void handleImport()}>
            <FolderInput className="h-4 w-4" />
            Importovať
          </Button>
        </div>

        {recentDocuments.length > 0 && (
          <div className="mb-6 w-full text-left">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
              Nedávne dokumenty
            </h2>
            <Card className="overflow-hidden">
              <ul className="m-0 list-none p-0">
                {recentDocuments.map((doc, index) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2.5 border-b border-[var(--color-border)] bg-transparent px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-hover)]',
                        index === recentDocuments.length - 1 && 'border-b-0',
                      )}
                      onClick={() => openDocument(doc.id)}
                    >
                      <FileText className="h-4 w-4 shrink-0 opacity-50" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {doc.title}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(doc.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

        <div className="grid gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 text-left">
          {APP_SHORTCUTS.slice(0, 4).map((shortcut) => (
            <Shortcut key={shortcut.label} label={shortcut.label} keys={shortcut.keys} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Shortcut({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between gap-3">
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
