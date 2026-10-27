import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import type { Ref } from 'react'
import { cn } from '@/lib/utils'

export function ScrollArea({
  className,
  children,
  viewportRef,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportRef?: Ref<HTMLDivElement>
}) {
  return (
    <ScrollAreaPrimitive.Root
      className={cn('relative min-h-0 overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        className="h-full w-full rounded-[inherit] outline-none [&>div]:!block [&>div]:min-h-[100%]"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        className="flex touch-none select-none p-0.5 transition-colors data-[orientation=vertical]:w-2"
      >
        <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-[var(--color-border)]" />
      </ScrollAreaPrimitive.Scrollbar>
    </ScrollAreaPrimitive.Root>
  )
}
