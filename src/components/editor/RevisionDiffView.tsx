import { formatRelativeTime } from '@/lib/utils'
import type { DiffLine } from '@/lib/revisions/diff-text'

type RevisionDiffViewProps = {
  revisionTitle: string
  revisionCreatedAt: number
  lines: DiffLine[]
  onClose: () => void
}

export function RevisionDiffView({
  revisionTitle,
  revisionCreatedAt,
  lines,
  onClose,
}: RevisionDiffViewProps) {
  const added = lines.filter((line) => line.type === 'added').length
  const removed = lines.filter((line) => line.type === 'removed').length

  return (
    <div className="revision-diff">
      <div className="revision-diff-header">
        <div>
          <p className="revision-diff-title">Porovnanie s aktuálnou verziou</p>
          <p className="revision-diff-meta">
            {revisionTitle} · {formatRelativeTime(revisionCreatedAt)}
          </p>
        </div>
        <button type="button" className="revision-diff-close" onClick={onClose}>
          Zavrieť
        </button>
      </div>

      <p className="revision-diff-summary">
        {added > 0 && <span className="revision-diff-added">+{added} riadkov</span>}
        {added > 0 && removed > 0 && ' · '}
        {removed > 0 && <span className="revision-diff-removed">−{removed} riadkov</span>}
        {added === 0 && removed === 0 && 'Bez rozdielov'}
      </p>

      <div className="revision-diff-body">
        {lines.map((line, index) => (
          <div
            key={`${line.type}-${index}`}
            className={`revision-diff-line revision-diff-line--${line.type}`}
          >
            <span className="revision-diff-gutter" aria-hidden="true">
              {line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}
            </span>
            <span className="revision-diff-text">{line.text || '\u00a0'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
