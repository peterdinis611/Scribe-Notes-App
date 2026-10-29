import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--color-foreground)_8%,transparent)]',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
