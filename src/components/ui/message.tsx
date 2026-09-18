import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type MessageAlign = 'start' | 'end'

export function Message({
  align = 'start',
  className,
  ...props
}: ComponentProps<'div'> & { align?: MessageAlign }) {
  return (
    <div
      data-align={align}
      className={cn(
        'group/message flex w-full items-end gap-2 data-[align=end]:flex-row-reverse',
        className,
      )}
      {...props}
    />
  )
}

export function MessageGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex w-full flex-col gap-1.5', className)} {...props} />
}

export function MessageAvatar({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('mb-0.5 flex size-7 shrink-0 items-end justify-center', className)}
      {...props}
    />
  )
}

export function MessageContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-1 group-data-[align=end]/message:items-end',
        className,
      )}
      {...props}
    />
  )
}

export function MessageHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'px-1 text-[10px] font-medium text-[var(--color-muted-foreground)]',
        className,
      )}
      {...props}
    />
  )
}

export function MessageFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex max-w-full flex-col gap-1 px-0.5 group-data-[align=end]/message:items-end',
        className,
      )}
      {...props}
    />
  )
}
