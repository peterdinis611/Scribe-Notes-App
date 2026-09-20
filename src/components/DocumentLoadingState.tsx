import { cn } from '@/lib/utils'

type DocumentLoadingStateProps = {
  label: string
  /** Optional note title while the body is still loading. */
  title?: string | null
  className?: string
  compact?: boolean
}

/** Centered document load state — accent ring + soft page silhouette. */
export function DocumentLoadingState({
  label,
  title,
  className,
  compact = false,
}: DocumentLoadingStateProps) {
  return (
    <div
      className={cn(
        'document-loading',
        compact && 'document-loading--compact',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="document-loading-stage" aria-hidden="true">
        <span className="document-loading-glow" />
        <span className="document-loading-ring" />
        <span className="document-loading-ring document-loading-ring--lag" />
        <div className="document-loading-page">
          <span className="document-loading-line document-loading-line--title" />
          <span className="document-loading-line" />
          <span className="document-loading-line" />
          <span className="document-loading-line document-loading-line--short" />
        </div>
      </div>
      <div className="document-loading-copy">
        {title ? <p className="document-loading-title">{title}</p> : null}
        <p className="document-loading-label">{label}</p>
      </div>
    </div>
  )
}
