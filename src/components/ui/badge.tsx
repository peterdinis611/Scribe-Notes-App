import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted-foreground)]',
        accent:
          'border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)] text-[var(--color-accent)]',
        muted:
          'border-transparent bg-[color-mix(in_srgb,var(--color-muted-foreground)_14%,transparent)] text-[var(--color-muted-foreground)]',
        tag: 'border-transparent bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[color-mix(in_srgb,var(--color-accent)_85%,var(--color-foreground))] text-[9px] font-semibold leading-[15px]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
