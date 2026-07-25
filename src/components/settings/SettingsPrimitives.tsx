import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function SettingsSection({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <section className={cn('mb-7 last:mb-0', className)}>{children}</section>
}

export function SettingsSectionHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h3 className="m-0 text-[13px] font-semibold text-[var(--color-foreground)]">{title}</h3>
        {description && (
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
            {description}
          </p>
        )}
      </div>
      {actions}
    </div>
  )
}

export function SettingsGroup({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SettingsRow({
  title,
  description,
  children,
  danger,
}: {
  title: string
  description?: ReactNode
  children?: ReactNode
  danger?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-[var(--color-border)] px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6',
        danger && 'bg-[color-mix(in_srgb,var(--color-destructive)_4%,transparent)]',
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'm-0 text-[13px] font-medium',
            danger ? 'text-[var(--color-destructive)]' : 'text-[var(--color-foreground)]',
          )}
        >
          {title}
        </p>
        {description && (
          <div className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
            {description}
          </div>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">{children}</div>
      )}
    </div>
  )
}

export function SettingsKbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 font-sans text-[11px] text-[var(--color-foreground)] shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      {children}
    </kbd>
  )
}
