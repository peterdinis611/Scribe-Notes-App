import * as React from 'react'
import { cn } from '@/lib/utils'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        'flex min-h-[60px] w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-2 text-[14px] text-[var(--color-foreground)] outline-none transition-[border-color,box-shadow,background]',
        'placeholder:text-[var(--color-muted-foreground)]',
        'focus:border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-border))] focus:shadow-[0_0_0_2px_var(--color-selection)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export { Textarea }
