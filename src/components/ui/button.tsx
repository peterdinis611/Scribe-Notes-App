import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-[13px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-selection)] disabled:pointer-events-none disabled:opacity-40 titlebar-no-drag',
  {
    variants: {
      variant: {
        default:
          'rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white hover:brightness-105 active:brightness-95 shadow-[0_6px_16px_color-mix(in_srgb,var(--color-accent)_28%,transparent)]',
        outline:
          'rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] hover:bg-[var(--color-hover)] hover:-translate-y-px',
        ghost:
          'rounded-[var(--radius-md)] bg-transparent text-[var(--color-foreground)] hover:bg-[var(--color-hover)]',
        sidebar:
          'grove-nav-row rounded-[var(--radius-md)] bg-transparent hover:bg-[var(--color-hover)] p-0',
      },
      size: {
        default: 'h-9 px-3.5',
        sm: 'h-8 px-2.5 text-[12px]',
        icon: 'h-8 w-8 shrink-0 p-0',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        type={asChild ? type : type ?? 'button'}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
