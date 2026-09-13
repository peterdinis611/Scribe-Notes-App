import { Markdown } from '@tanstack/markdown/react'
import { useDeferredValue, useMemo, type ReactNode } from 'react'
import { highlightCode } from '@/lib/editor/lowlight'
import { cn } from '@/lib/utils'

type MarkdownViewProps = {
  source: string
  className?: string
  /** Prefer deferred parsing for live typing previews. */
  deferred?: boolean
  emptyFallback?: ReactNode
}

function highlight(code: string, lang?: string) {
  return highlightCode(code, lang ?? null)
}

export function MarkdownView({
  source,
  className,
  deferred = false,
  emptyFallback = null,
}: MarkdownViewProps) {
  const deferredSource = useDeferredValue(source)
  const text = deferred ? deferredSource : source
  const trimmed = text.trim()

  const content = useMemo(() => {
    if (!trimmed) return null
    return (
      <Markdown highlighter={highlight} headingIds>
        {text}
      </Markdown>
    )
  }, [text, trimmed])

  if (!trimmed) {
    return emptyFallback ? <div className={cn('scribe-markdown', className)}>{emptyFallback}</div> : null
  }

  return <div className={cn('scribe-markdown', className)}>{content}</div>
}
