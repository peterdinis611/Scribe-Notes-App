import { Columns2, List } from 'lucide-react'
import {
  countDiffChanges,
  filterDiffLines,
  filterSideBySideRows,
  type DiffLine,
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
  onViewModeChange: (mode: DiffViewMode) => void
  onChangesOnlyChange: (value: boolean) => void
  onClose: () => void
}

function renderCellText(text: string) {
  return text || '\u00a0'
}

export function RevisionDiffView({
  left,
  right,
  lines,
  sideBySideRows,
  viewMode,
  changesOnly,
  onViewModeChange,
  onChangesOnlyChange,
  onClose,
}: RevisionDiffViewProps) {
  const visibleLines = filterDiffLines(lines, changesOnly)
  const visibleRows = filterSideBySideRows(sideBySideRows, changesOnly)
  const { added, removed } = countDiffChanges(lines)

  return (
    <div className="revision-diff">
      <div className="revision-diff-header">
        <div>
          <p className="revision-diff-title">Porovnanie verzií</p>
          <div className="revision-diff-meta-grid">
            <span className="revision-diff-meta-side">
              <strong>A:</strong> {left.label} · {formatRelativeTime(left.createdAt)}
            </span>
            <span className="revision-diff-meta-side">
              <strong>B:</strong> {right.label} · {formatRelativeTime(right.createdAt)}
            </span>
          </div>
        </div>
        <button type="button" className="revision-diff-close" onClick={onClose}>
          Zavrieť
        </button>
      </div>

      <div className="revision-diff-toolbar">
        <p className="revision-diff-summary">
          {added > 0 && <span className="revision-diff-added">+{added} riadkov</span>}
          {added > 0 && removed > 0 && ' · '}
          {removed > 0 && <span className="revision-diff-removed">−{removed} riadkov</span>}
          {added === 0 && removed === 0 && 'Bez rozdielov'}
        </p>

        <div className="revision-diff-toolbar-actions">
          <label className="revision-diff-toggle">
            <input
              type="checkbox"
              checked={changesOnly}
              onChange={(event) => onChangesOnlyChange(event.target.checked)}
            />
            <span>Len zmeny</span>
          </label>

          <div className="revision-diff-view-toggle" role="group" aria-label="Režim zobrazenia">
            <button
              type="button"
              className={cn('revision-diff-view-btn', viewMode === 'split' && 'is-active')}
              title="Vedľa seba"
              onClick={() => onViewModeChange('split')}
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={cn('revision-diff-view-btn', viewMode === 'unified' && 'is-active')}
              title="Zjednotený diff"
              onClick={() => onViewModeChange('unified')}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'split' ? (
        <div className="revision-diff-split">
          <div className="revision-diff-split-header">
            <span>{left.label}</span>
            <span>{right.label}</span>
          </div>
          <div className="revision-diff-split-body">
            {visibleRows.length === 0 ? (
              <p className="revision-diff-empty">Žiadne rozdiely na zobrazenie.</p>
            ) : (
              visibleRows.map((row, index) => (
                <div key={index} className="revision-diff-split-row">
                  <div
                    className={cn(
                      'revision-diff-split-cell',
                      row.left.type && `revision-diff-split-cell--${row.left.type}`,
                    )}
                  >
                    {renderCellText(row.left.text)}
                  </div>
                  <div
                    className={cn(
                      'revision-diff-split-cell',
                      row.right.type && `revision-diff-split-cell--${row.right.type}`,
                    )}
                  >
                    {renderCellText(row.right.text)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="revision-diff-body">
          {visibleLines.length === 0 ? (
            <p className="revision-diff-empty">Žiadne rozdiely na zobrazenie.</p>
          ) : (
            visibleLines.map((line, index) => (
              <div
                key={`${line.type}-${index}`}
                className={`revision-diff-line revision-diff-line--${line.type}`}
              >
                <span className="revision-diff-gutter" aria-hidden="true">
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}
                </span>
                <span className="revision-diff-text">{renderCellText(line.text)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
