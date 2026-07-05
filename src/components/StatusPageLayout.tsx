import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type StatusPageLayoutProps = {
  icon: ReactNode
  iconClassName?: string
  title: string
  description: string
  children: ReactNode
}

export function StatusPageLayout({
  icon,
  iconClassName,
  title,
  description,
  children,
}: StatusPageLayoutProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-[440px] text-center">
        <div
          className={cn(
            'mb-5 inline-flex h-16 w-16 items-center justify-center rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-accent)] shadow-[0_4px_16px_rgba(0,0,0,0.06)]',
            iconClassName,
          )}
        >
          {icon}
        </div>
        <h1 className="mb-2 text-2xl font-bold tracking-[-0.03em] text-[var(--color-foreground)]">
          {title}
        </h1>
        <p className="mb-6 text-[14px] leading-relaxed text-[var(--color-muted-foreground)]">
          {description}
        </p>
        <div className="flex flex-wrap justify-center gap-2.5">{children}</div>
      </div>
    </div>
  )
}
