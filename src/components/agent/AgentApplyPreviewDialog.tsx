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
  | { type: 'insert'; mode: AgentApplyMode; text: string; sectionTitle?: string }
  | { type: 'replace'; before: string; after: string }
  | {
      type: 'organize'
      tags: string[]
      folderSuggestion?: string | null
      folderSuggestionId?: string | null
    }
  | {
      type: 'wiki'
      links: Array<{ phrase: string; title: string; documentId: string }>
    }
  | { type: 'spellcheck'; fixes: Array<{ word: string; suggestion: string }> }
  | { type: 'grammar'; fixes: Array<{ match: string; suggestion: string; message?: string }> }
  | { type: 'title'; title: string }

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
    if (preview.type === 'replace') return t('agent.applyPreviewReplace')
    if (preview.type === 'spellcheck') return t('agent.applyPreviewSpellcheck')
    if (preview.type === 'grammar') return t('agent.applyPreviewGrammar')
    if (preview.type === 'title') return t('agent.applyPreviewTitleRename')
    if (preview.mode === 'checklist') return t('agent.applyPreviewChecklist')
    if (preview.mode === 'frontmatter') return t('agent.applyPreviewFrontmatter')
    if (preview.mode === 'cursor') return t('agent.applyPreviewCursor')
    if (preview.mode === 'section') return t('agent.applyPreviewSection')
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
              <ul className="m-0 list-none space-y-1.5 p-0 text-[13px]">
                {preview.links.map((link) => (
                  <li key={`${link.documentId}-${link.phrase}`}>
                    {t('agent.applyPreviewWikiBody', {
                      phrase: link.phrase,
                      title: link.title,
                    })}
                  </li>
                ))}
              </ul>
            ) : preview.type === 'spellcheck' ? (
              <ul className="m-0 list-none space-y-1.5 p-0 text-[13px]">
                {preview.fixes.length ? (
                  preview.fixes.map((fix) => (
                    <li key={`${fix.word}-${fix.suggestion}`}>
                      <span className="text-[var(--color-muted-foreground)]">{fix.word}</span>
                      {' → '}
                      <span className="font-medium text-[var(--color-foreground)]">
                        {fix.suggestion}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-[var(--color-muted-foreground)]">
                    {t('agent.applySpellcheckNone')}
                  </li>
                )}
              </ul>
            ) : preview.type === 'grammar' ? (
              <ul className="m-0 list-none space-y-1.5 p-0 text-[13px]">
                {preview.fixes.length ? (
                  preview.fixes.map((fix) => (
                    <li key={`${fix.match}-${fix.suggestion}`}>
                      <span className="text-[var(--color-muted-foreground)]">{fix.match}</span>
                      {' → '}
                      <span className="font-medium text-[var(--color-foreground)]">
                        {fix.suggestion}
                      </span>
                      {fix.message ? (
                        <span className="block text-[11px] text-[var(--color-muted-foreground)]">
                          {fix.message}
                        </span>
                      ) : null}
                    </li>
                  ))
                ) : (
                  <li className="text-[var(--color-muted-foreground)]">
                    {t('agent.applyGrammarNone')}
                  </li>
                )}
              </ul>
            ) : preview.type === 'title' ? (
              <p className="m-0 text-[13px] font-medium">{preview.title}</p>
            ) : preview.type === 'replace' ? (
              <div className="space-y-3 text-[13px] leading-relaxed">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    {t('agent.applyPreviewBefore')}
                  </span>
                  <pre className="m-0 mt-1 whitespace-pre-wrap font-sans text-[var(--color-muted-foreground)]">
                    {preview.before || '—'}
                  </pre>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    {t('agent.applyPreviewAfter')}
                  </span>
                  <pre className="m-0 mt-1 whitespace-pre-wrap font-sans text-[var(--color-foreground)]">
                    {stripAnswerMarkdown(preview.after)}
                  </pre>
                </div>
              </div>
            ) : (
              <ul
                className={cn(
                  'm-0 space-y-1 p-0 text-[13px] leading-relaxed',
                  preview.mode === 'checklist' ? 'list-none' : 'list-disc pl-4',
                )}
              >
                {preview.mode === 'section' && preview.sectionTitle ? (
                  <li className="list-none font-semibold pl-0">{preview.sectionTitle}</li>
                ) : null}
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
              {busy
                ? t('common.loading')
                : preview.type === 'replace'
                  ? t('agent.applyPreviewConfirmReplace')
                  : preview.type === 'spellcheck' || preview.type === 'grammar'
                    ? t('agent.applyPreviewConfirmSpellcheck')
                    : preview.type === 'title'
                      ? t('agent.applyPreviewConfirmTitle')
                      : t('agent.applyPreviewConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
