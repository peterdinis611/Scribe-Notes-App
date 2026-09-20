import type { ReactElement } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

export function TooltipProvider({
  delayDuration = 280,
  skipDelayDuration = 80,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  )
}

export function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props} />
}

export function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger {...props} />
}

export function TooltipContent({
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'titlebar-no-drag z-[90] max-w-[240px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-[12px] leading-snug text-[var(--color-foreground)] shadow-[0_4px_16px_rgba(0,0,0,0.12)]',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

/** Hover label for icon-only controls. Pair with `aria-label` on the child. */
export function IconTooltip({
  label,
  side = 'bottom',
  children,
}: {
  label: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: ReactElement
}) {
  if (!label.trim()) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
