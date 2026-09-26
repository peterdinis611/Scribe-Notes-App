import { useTranslation } from 'react-i18next'
import { Columns2, List } from 'lucide-react'
import {
  countDiffChanges,
  filterDiffLinesWithContext,
  filterSideBySideWithContext,
  type DiffLine,
  type DiffSegment,
  type DiffViewMode,
  type SideBySideRow,
} from '@/lib/revisions/diff-text'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

type RevisionSide = {
  label: string
  createdAt: number
}

type RevisionDiffViewProps = {
  left: RevisionSide
  right: RevisionSide
  lines: DiffLine[]
  sideBySideRows: SideBySideRow[]
  viewMode: DiffViewMode
  changesOnly: boolean
  contextLines?: number
  wordHighlight?: boolean
  gainedTerms?: string[]
  lostTerms?: string[]
  onViewModeChange: (mode: DiffViewMode) => void
  onChangesOnlyChange: (value: boolean) => void
  onContextLinesChange?: (value: number) => void
  onWordHighlightChange?: (value: boolean) => void
  onClose: () => void
}

function renderCellText(text: string) {
  return text || '\u00a0'
}

function renderSegments(segments: DiffSegment[] | undefined, text: string, enabled: boolean) {
  if (!enabled || !segments?.length) {
    return renderCellText(text)
  }
  return segments.map((segment, index) => (
    <span
      key={`${segment.type}-${index}`}
      className={cn(
        segment.type === 'add' &&
          'rounded-[2px] bg-[color-mix(in_srgb,#22c55e_35%,transparent)] text-[inherit]',
        segment.type === 'del' &&
          'rounded-[2px] bg-[color-mix(in_srgb,#ef4444_35%,transparent)] line-through decoration-[color-mix(in_srgb,#ef4444_55%,transparent)]',
      )}
    >
      {segment.text || '\u00a0'}
    </span>
  ))
}

export function RevisionDiffView({
  left,
  right,
  lines,
  sideBySideRows,
  viewMode,
  changesOnly,
  contextLines = 2,
  wordHighlight = true,
  gainedTerms,
  lostTerms,
  onViewModeChange,
  onChangesOnlyChange,
  onContextLinesChange,
  onWordHighlightChange,
  onClose,
}: RevisionDiffViewProps) {
  const { t } = useTranslation()
  const visibleLines = filterDiffLinesWithContext(lines, changesOnly, contextLines)
  const visibleRows = filterSideBySideWithContext(sideBySideRows, changesOnly, contextLines)
  const { added, removed } = countDiffChanges(lines)
  const hasTerms =
    (gainedTerms && gainedTerms.length > 0) || (lostTerms && lostTerms.length > 0)

  return (
    <div className="flex max-h-[62vh] flex-col border-t border-[var(--color-border)] bg-[var(--color-background)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <div>
          <p className="m-0 text-[13px] font-semibold">{t('panels.revisions.diffTitle')}</p>
          <div className="mt-1 flex flex-col gap-1">
            <span className="text-[11px] text-[var(--color-muted-foreground)]">
              <strong>{t('panels.revisions.sideA')}</strong> {left.label} ·{' '}
              {formatRelativeTime(left.createdAt)}
            </span>
            <span className="text-[11px] text-[var(--color-muted-foreground)]">
              <strong>{t('panels.revisions.sideB')}</strong> {right.label} ·{' '}
              {formatRelativeTime(right.createdAt)}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="border-none bg-transparent text-[12px] text-[var(--color-muted-foreground)]"
          onClick={onClose}
        >
          {t('common.close')}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <p className="m-0 text-[12px] text-[var(--color-muted-foreground)]">
          {added > 0 && (
            <span className="text-[#15803d]">{t('panels.revisions.linesAdded', { count: added })}</span>
          )}
          {added > 0 && removed > 0 && ' · '}
          {removed > 0 && (
            <span className="text-[#b91c1c]">
              {t('panels.revisions.linesRemoved', { count: removed })}
            </span>
          )}
          {added === 0 && removed === 0 && t('panels.revisions.noDiff')}
        </p>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--color-muted-foreground)]">
            <input
              type="checkbox"
              checked={changesOnly}
              onChange={(event) => onChangesOnlyChange(event.target.checked)}
            />
            <span>{t('panels.revisions.changesOnly')}</span>
          </label>

          {changesOnly && onContextLinesChange ? (
            <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-muted-foreground)]">
              <span>{t('panels.revisions.contextLines')}</span>
              <select
                className="h-7 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 text-[12px]"
                value={contextLines}
                onChange={(event) => onContextLinesChange(Number(event.target.value))}
                aria-label={t('panels.revisions.contextLines')}
              >
                <option value={0}>0</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
              </select>
            </label>
          ) : null}

          {onWordHighlightChange ? (
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--color-muted-foreground)]">
              <input
                type="checkbox"
                checked={wordHighlight}
                onChange={(event) => onWordHighlightChange(event.target.checked)}
              />
              <span>{t('panels.revisions.wordHighlight')}</span>
            </label>
          ) : null}

          <div
            className="inline-flex overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]"
            role="group"
            aria-label={t('panels.revisions.viewModeAria')}
          >
            <button
              type="button"
              className={cn(
                'inline-flex h-7 w-[30px] items-center justify-center border-none bg-[var(--color-background)] text-[var(--color-muted-foreground)]',
                viewMode === 'split' && 'bg-[var(--color-selection)] text-[var(--color-foreground)]',
              )}
              title={t('panels.revisions.viewSplit')}
              onClick={() => onViewModeChange('split')}
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={cn(
                'inline-flex h-7 w-[30px] items-center justify-center border-none bg-[var(--color-background)] text-[var(--color-muted-foreground)]',
                viewMode === 'unified' && 'bg-[var(--color-selection)] text-[var(--color-foreground)]',
              )}
              title={t('panels.revisions.viewUnified')}
              onClick={() => onViewModeChange('unified')}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {hasTerms ? (
        <div className="flex flex-wrap gap-3 border-b border-[var(--color-border)] px-4 py-2 text-[11px]">
          {gainedTerms && gainedTerms.length > 0 ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="font-semibold text-[var(--color-muted-foreground)]">
                {t('panels.revisions.gainedTerms')}
              </span>
              {gainedTerms.slice(0, 8).map((term) => (
                <span
                  key={`gain-${term}`}
                  className="rounded-full bg-[color-mix(in_srgb,#22c55e_16%,transparent)] px-2 py-0.5 text-[#15803d]"
                >
                  {term}
                </span>
              ))}
            </div>
          ) : null}
          {lostTerms && lostTerms.length > 0 ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="font-semibold text-[var(--color-muted-foreground)]">
                {t('panels.revisions.lostTerms')}
              </span>
              {lostTerms.slice(0, 8).map((term) => (
                <span
                  key={`lost-${term}`}
                  className="rounded-full bg-[color-mix(in_srgb,#ef4444_14%,transparent)] px-2 py-0.5 text-[#b91c1c]"
                >
                  {term}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {viewMode === 'split' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid grid-cols-2 gap-px bg-[var(--color-border)] px-3 text-[11px] font-semibold text-[var(--color-muted-foreground)]">
            <span className="bg-[var(--color-surface-elevated)] px-2.5 py-2">{left.label}</span>
            <span className="bg-[var(--color-surface-elevated)] px-2.5 py-2">{right.label}</span>
          </div>
          <div className="overflow-auto font-mono text-[12px] leading-normal">
            {visibleRows.length === 0 ? (
              <p className="m-0 p-4 text-center text-[12px] text-[var(--color-muted-foreground)]">
                {t('panels.revisions.noDiffToShow')}
              </p>
            ) : (
              visibleRows.map((row, index) => (
                <div
                  key={index}
                  className={cn(
                    'grid grid-cols-2 gap-px bg-[var(--color-border)]',
                    row.paired && 'ring-1 ring-inset ring-[color-mix(in_srgb,var(--color-accent)_22%,transparent)]',
                  )}
                >
                  <div
                    className={cn(
                      'min-h-[1.5em] whitespace-pre-wrap break-words bg-[var(--color-background)] px-2.5 py-1',
                      row.left.type === 'removed' &&
                        'bg-[color-mix(in_srgb,#ef4444_12%,var(--color-background))]',
                      row.left.type === 'added' &&
                        'bg-[color-mix(in_srgb,#22c55e_12%,var(--color-background))]',
                      row.left.type === 'unchanged' && 'text-[var(--color-muted-foreground)]',
                    )}
                  >
                    {renderSegments(row.left.segments, row.left.text, wordHighlight)}
                  </div>
                  <div
                    className={cn(
                      'min-h-[1.5em] whitespace-pre-wrap break-words bg-[var(--color-background)] px-2.5 py-1',
                      row.right.type === 'removed' &&
                        'bg-[color-mix(in_srgb,#ef4444_12%,var(--color-background))]',
                      row.right.type === 'added' &&
                        'bg-[color-mix(in_srgb,#22c55e_12%,var(--color-background))]',
                      row.right.type === 'unchanged' && 'text-[var(--color-muted-foreground)]',
                    )}
                  >
                    {renderSegments(row.right.segments, row.right.text, wordHighlight)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-auto py-2 font-mono text-[12px] leading-normal">
          {visibleLines.length === 0 ? (
            <p className="m-0 p-4 text-center text-[12px] text-[var(--color-muted-foreground)]">
              {t('panels.revisions.noDiffToShow')}
            </p>
          ) : (
            visibleLines.map((line, index) => (
              <div
                key={`${line.type}-${index}`}
                className={cn(
                  'flex gap-2 whitespace-pre-wrap break-words px-4 py-0.5',
                  line.type === 'added' && 'bg-[color-mix(in_srgb,#22c55e_14%,transparent)]',
                  line.type === 'removed' && 'bg-[color-mix(in_srgb,#ef4444_14%,transparent)]',
                )}
              >
                <span className="w-3 shrink-0 opacity-70" aria-hidden="true">
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}
                </span>
                <span>{renderCellText(line.text)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
