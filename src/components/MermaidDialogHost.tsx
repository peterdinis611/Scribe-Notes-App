import { useEffect, useId, useMemo, useState } from 'react'
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
import { resolveMermaidDialog } from '@/lib/mermaid-dialog'
import {
  MERMAID_DEFAULT_SOURCE,
  MERMAID_TEMPLATE_IDS,
  MERMAID_TEMPLATES,
  type MermaidTemplateId,
} from '@/lib/editor/mermaid'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store/hooks'

function matchTemplate(source: string): MermaidTemplateId | null {
  const trimmed = source.trim()
  for (const id of MERMAID_TEMPLATE_IDS) {
    if (MERMAID_TEMPLATES[id].source.trim() === trimmed) return id
  }
  return null
}

export function MermaidDialogHost() {
  const { t } = useTranslation()
  const dialog = useAppSelector((state) => state.ui.mermaidDialog)
  const open = dialog.open
  const fieldId = useId()
  const [templateId, setTemplateId] = useState<MermaidTemplateId | null>('flowchart')
  const [source, setSource] = useState(MERMAID_DEFAULT_SOURCE)

  useEffect(() => {
    if (!open || !dialog.open) return
    const seed = dialog.initialSource.trim() || MERMAID_DEFAULT_SOURCE
    setSource(seed)
    setTemplateId(matchTemplate(seed))
  }, [dialog, open])

  const canSubmit = useMemo(() => source.trim().length > 0, [source])

  function close(result: Parameters<typeof resolveMermaidDialog>[0]) {
    resolveMermaidDialog(result)
  }

  function applyTemplate(id: MermaidTemplateId) {
    setTemplateId(id)
    setSource(MERMAID_TEMPLATES[id].source)
  }

  function submit() {
    if (!canSubmit) return
    close({ source: source.trim(), clear: false })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close(null)
      }}
    >
      {open ? (
        <DialogContent className="titlebar-no-drag max-w-xl gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-[var(--color-border)] px-5 py-4">
            <DialogTitle>
              {dialog.open && dialog.intent === 'edit'
                ? t('mermaid.builder.editTitle')
                : t('mermaid.builder.insertTitle')}
            </DialogTitle>
            <DialogDescription>{t('mermaid.builder.description')}</DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[min(68vh,640px)] gap-4 overflow-y-auto px-5 py-4">
            <div className="flex flex-wrap gap-1.5">
              {MERMAID_TEMPLATE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                    templateId === id
                      ? 'border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
                  )}
                  onClick={() => applyTemplate(id)}
                >
                  {t(`mermaid.templates.${id}`)}
                </button>
              ))}
            </div>

            <label className="grid gap-1.5 text-[12px] text-[var(--color-muted-foreground)]" htmlFor={fieldId}>
              {t('mermaid.builder.sourceLabel')}
              <textarea
                id={fieldId}
                className="min-h-[200px] w-full resize-y rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono text-[12px] leading-relaxed text-[var(--color-foreground)] outline-none focus-visible:border-[var(--color-accent)]"
                value={source}
                spellCheck={false}
                onChange={(event) => {
                  setSource(event.target.value)
                  setTemplateId(matchTemplate(event.target.value))
                }}
              />
            </label>
          </div>

          <DialogFooter className="border-t border-[var(--color-border)] px-5 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => close(null)}>
              {t('common.cancel')}
            </Button>
            {dialog.open && dialog.intent === 'edit' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => close({ source: '', clear: true })}
              >
                {t('mermaid.builder.remove')}
              </Button>
            ) : null}
            <Button type="button" size="sm" disabled={!canSubmit} onClick={submit}>
              {dialog.open && dialog.intent === 'edit' ? t('common.save') : t('mermaid.builder.insert')}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
