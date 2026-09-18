import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const bubbleVariants = cva(
  'min-w-0 max-w-full overflow-hidden rounded-[18px] px-3 py-2 text-[13px] leading-relaxed group-data-[align=end]/message:rounded-br-md group-data-[align=start]/message:rounded-bl-md',
  {
    variants: {
      variant: {
        muted:
          'border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-hover)_88%,var(--color-surface))] text-[var(--color-foreground)]',
        primary: 'bg-[var(--color-accent)] text-white shadow-[0_8px_20px_-12px_var(--color-accent)]',
      },
    },
    defaultVariants: {
      variant: 'muted',
    },
  },
)

export function Bubble({
  className,
  variant,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof bubbleVariants>) {
  return <div className={cn(bubbleVariants({ variant }), className)} {...props} />
}

export function BubbleContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('min-w-0', className)} {...props} />
}
