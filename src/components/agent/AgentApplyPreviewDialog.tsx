import { useMemo } from 'react'
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
import type { AgentApplyMode } from '@/lib/editor/insert-ai-answer'
import { stripAnswerMarkdown } from '@/lib/editor/insert-ai-answer'
import { cn } from '@/lib/utils'

export type AgentApplyPreviewKind =
  | { type: 'insert'; mode: AgentApplyMode; text: string }
  | { type: 'organize'; tags: string[]; folderSuggestion?: string | null }
  | { type: 'wiki'; phrase: string; title: string; documentId: string }

type AgentApplyPreviewDialogProps = {
  open: boolean
  preview: AgentApplyPreviewKind | null
  busy?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

function previewLines(text: string, mode: AgentApplyMode): string[] {
  const body = stripAnswerMarkdown(text)
  if (mode === 'checklist') {
    return body
      .split(/\n+/)
      .map((line) => line.replace(/^#{1,6}\s+/, '').replace(/^[•*\-\d.)\s]+/, '').trim())
      .filter((line) => line.length >= 2)
      .slice(0, 16)
  }
  return body.split(/\n+/).filter(Boolean).slice(0, 20)
}

export function AgentApplyPreviewDialog({
  open,
  preview,
  busy = false,
  onOpenChange,
  onConfirm,
}: AgentApplyPreviewDialogProps) {
  const { t } = useTranslation()

  const title = useMemo(() => {
    if (!preview) return t('agent.applyPreviewTitle')
    if (preview.type === 'organize') return t('agent.applyPreviewOrganize')
    if (preview.type === 'wiki') return t('agent.applyPreviewWiki')
    if (preview.mode === 'checklist') return t('agent.applyPreviewChecklist')
    if (preview.mode === 'frontmatter') return t('agent.applyPreviewFrontmatter')
    return t('agent.applyPreviewCallout')
  }, [preview, t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && preview ? (
        <DialogContent className="titlebar-no-drag max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{t('agent.applyPreviewHint')}</DialogDescription>
          </DialogHeader>

          <div className="agent-apply-preview mt-2 max-h-[40vh] overflow-auto rounded-lg border border-[color-mix(in_srgb,var(--color-border)_80%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_92%,transparent)] p-3">
            {preview.type === 'organize' ? (
              <ul className="m-0 list-none space-y-1.5 p-0 text-[13px]">
                {preview.tags.length ? (
                  <li>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                      {t('agent.applyPreviewTags')}
                    </span>
                    <p className="m-0 mt-1">{preview.tags.join(', ')}</p>
                  </li>
                ) : (
                  <li className="text-[var(--color-muted-foreground)]">
                    {t('agent.applyOrganizeNone')}
                  </li>
                )}
                {preview.folderSuggestion ? (
                  <li>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                      {t('agent.applyPreviewFolder')}
                    </span>
                    <p className="m-0 mt-1">{preview.folderSuggestion}</p>
                  </li>
                ) : null}
              </ul>
            ) : preview.type === 'wiki' ? (
              <p className="m-0 text-[13px]">
                {t('agent.applyPreviewWikiBody', {
                  phrase: preview.phrase,
                  title: preview.title,
                })}
              </p>
            ) : (
              <ul
                className={cn(
                  'm-0 space-y-1 p-0 text-[13px] leading-relaxed',
                  preview.mode === 'checklist' ? 'list-none' : 'list-disc pl-4',
                )}
              >
                {previewLines(preview.text, preview.mode).map((line, index) => (
                  <li key={`${index}-${line.slice(0, 24)}`} className="whitespace-pre-wrap">
                    {preview.mode === 'checklist' ? `☐ ${line}` : line}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter className="mt-3 gap-2 sm:justify-end">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={busy} onClick={onConfirm}>
              {busy ? t('common.loading') : t('agent.applyPreviewConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
