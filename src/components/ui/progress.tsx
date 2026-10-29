import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '@/lib/utils'

const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => {
  const indeterminate = value == null
  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-accent)_18%,var(--color-border))]',
        className,
      )}
      value={indeterminate ? undefined : value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          'h-full w-full flex-1 bg-[var(--color-accent)] transition-all',
          indeterminate && 'animate-pulse',
        )}
        style={
          indeterminate
            ? { transform: 'translateX(-35%)', width: '65%' }
            : { transform: `translateX(-${100 - (value || 0)}%)` }
        }
      />
    </ProgressPrimitive.Root>
  )
})
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
