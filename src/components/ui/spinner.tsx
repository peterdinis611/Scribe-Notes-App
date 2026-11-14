import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZE_CLASS = {
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
} as const

type SpinnerSize = keyof typeof SIZE_CLASS

type SpinnerProps = {
  className?: string
  size?: SpinnerSize
  label?: string
}

/** Inline loading indicator (Loader2 + spin). */
export function Spinner({ className, size = 'md', label = 'Loading' }: SpinnerProps) {
  return (
    <Loader2
      className={cn(
        'animate-spin text-[var(--color-muted-foreground)]',
        SIZE_CLASS[size],
        className,
      )}
      aria-label={label}
      role="status"
    />
  )
}

type SuspenseFallbackProps = {
  className?: string
  size?: SpinnerSize
  label?: string
  /** Stretch to fill the Suspense parent (route / panel). */
  fill?: boolean
}

/** Default Suspense fallback — never use `fallback={null}`. */
export function SuspenseFallback({
  className,
  size = 'md',
  label = 'Loading',
  fill = true,
}: SuspenseFallbackProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 text-[var(--color-muted-foreground)]',
        fill ? 'min-h-[3rem] w-full flex-1 py-6' : 'p-3',
        className,
      )}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <Spinner size={size} label={label} />
    </div>
  )
}
