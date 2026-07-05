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

export function SettingsKbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 font-sans text-[11px] text-[var(--color-foreground)] shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      {children}
    </kbd>
  )
}
