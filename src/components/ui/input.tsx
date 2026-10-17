import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-[14px] text-[var(--color-foreground)] outline-none transition-[border-color,box-shadow,background]',
        'placeholder:text-[var(--color-muted-foreground)]',
        'focus:border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-border))] focus:bg-[var(--color-background)] focus:shadow-[0_0_0_2px_var(--color-selection)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
