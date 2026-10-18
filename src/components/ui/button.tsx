import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-[14px] font-medium transition-[background,color,box-shadow,border-color] duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-selection)] disabled:pointer-events-none disabled:opacity-40 titlebar-no-drag',
  {
    variants: {
      variant: {
        default:
          'rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white hover:brightness-[1.03] active:brightness-[0.97] shadow-none',
        outline:
          'rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] hover:bg-[var(--color-hover)]',
        ghost:
          'rounded-[var(--radius-md)] bg-transparent text-[var(--color-foreground)] hover:bg-[var(--color-hover)]',
        sidebar:
          'grove-nav-row rounded-[var(--radius-md)] bg-transparent hover:bg-[var(--color-hover)] p-0',
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-7 px-2.5 text-[12px]',
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
