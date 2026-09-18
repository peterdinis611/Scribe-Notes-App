import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Avatar({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[11px] font-semibold text-[var(--color-foreground)]',
        className,
      )}
      {...props}
    />
  )
}

export function AvatarFallback({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn('flex size-full items-center justify-center', className)}
      {...props}
    />
  )
}
