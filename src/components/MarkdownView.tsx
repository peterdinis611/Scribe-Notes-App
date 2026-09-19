import { Markdown } from '@tanstack/markdown/react'
import {
  Children,
  isValidElement,
  useDeferredValue,
  useMemo,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
import { ScribeSyntaxHighlighter } from '@/components/editor/ScribeSyntaxHighlighter'
import { cn } from '@/lib/utils'

type MarkdownViewProps = {
  source: string
  className?: string
  /** Prefer deferred parsing for live typing previews. */
  deferred?: boolean
  /** Anchor ids on headings. Off in chat so titles do not render as accent links. */
  headingIds?: boolean
  emptyFallback?: ReactNode
}

function MarkdownPre({ children, className, ...props }: ComponentPropsWithoutRef<'pre'>) {
  const child = Children.toArray(children)[0]
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) {
    return (
      <pre className={className} {...props}>
        {children}
      </pre>
    )
  }

  const lang = /(?:^|\s)language-([\w+-]+)/.exec(child.props.className ?? '')?.[1]
  const code = String(child.props.children ?? '').replace(/\n$/, '')
  return <ScribeSyntaxHighlighter code={code} language={lang} className={cn('scribe-markdown__code', className)} />
}

export function MarkdownView({
  source,
  className,
  deferred = false,
  headingIds = true,
  emptyFallback = null,
}: MarkdownViewProps) {
  const deferredSource = useDeferredValue(source)
  const text = deferred ? deferredSource : source
  const trimmed = text.trim()

  const content = useMemo(() => {
    if (!trimmed) return null
    return (
      <Markdown headingIds={headingIds} components={{ pre: MarkdownPre }}>
        {text}
      </Markdown>
    )
  }, [headingIds, text, trimmed])

  if (!trimmed) {
    return emptyFallback ? <div className={cn('scribe-markdown', className)}>{emptyFallback}</div> : null
  }

  return <div className={cn('scribe-markdown', className)}>{content}</div>
}
