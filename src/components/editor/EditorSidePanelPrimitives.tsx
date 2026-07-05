import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function EditorSidePanel({
  children,
  className,
  width = 320,
  ...props
}: React.ComponentProps<'aside'> & { width?: 280 | 300 | 320 | 560 }) {
  const widthClass =
    width === 280
      ? 'w-[min(100%,280px)]'
      : width === 300
        ? 'w-[min(100%,300px)]'
        : width === 560
          ? 'w-[min(100%,560px)]'
          : 'w-[min(100%,320px)]'

  return (
    <aside
      className={cn(
        'flex min-h-0 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-background)]',
        widthClass,
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  )
}

export function EditorSidePanelHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-3.5 pb-2.5 pt-3.5">
      <div>
        <h2 className="m-0 text-[13px] font-bold">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">{subtitle}</p>
        ) : null}
      </div>
      {actions}
    </div>
  )
}

export function EditorSidePanelIconButton({
  className,
  ...props
}: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-[7px] border-none bg-transparent text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
        className,
      )}
      {...props}
    />
  )
}

export function EditorSidePanelList({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function EditorSidePanelEmpty({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p
      className={cn(
        'flex flex-col items-center gap-2 px-3 py-6 text-center text-[12px] leading-relaxed text-[var(--color-muted-foreground)]',
        className,
      )}
    >
      {children}
    </p>
  )
}
