import * as React from 'react'
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ContextMenu({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root {...props} />
}

export function ContextMenuTrigger({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return <ContextMenuPrimitive.Trigger {...props} />
}

export function ContextMenuGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
  return <ContextMenuPrimitive.Group {...props} />
}

export function ContextMenuPortal({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
  return <ContextMenuPrimitive.Portal {...props} />
}

export function ContextMenuSub({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub {...props} />
}

export function ContextMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
  return <ContextMenuPrimitive.RadioGroup {...props} />
}

export function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        className={cn(
          'titlebar-no-drag z-[70] max-h-[min(80vh,var(--radix-context-menu-content-available-height))] min-w-[10rem] overflow-y-auto overflow-x-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-1 shadow-lg',
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  )
}

export function ContextMenuItem({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-[6px] px-2 py-1.5 text-[13px] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-[var(--color-hover)] [&_svg]:size-4 [&_svg]:shrink-0',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  )
}

export function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      className={cn(
        'relative flex cursor-default select-none items-center rounded-[6px] py-1.5 pl-8 pr-2 text-[13px] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-[var(--color-hover)]',
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  )
}

export function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.Label
      className={cn(
        'px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  )
}

export function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-[var(--color-border)]', className)}
      {...props}
    />
  )
}

export function ContextMenuShortcut({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'ml-auto text-[11px] tracking-widest text-[var(--color-muted-foreground)]',
        className,
      )}
      {...props}
    />
  )
}

export function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.SubTrigger
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-[6px] px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-[var(--color-hover)] data-[state=open]:bg-[var(--color-hover)] [&_svg]:size-4 [&_svg]:shrink-0',
        inset && 'pl-8',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto h-4 w-4 opacity-60" />
    </ContextMenuPrimitive.SubTrigger>
  )
}

export function ContextMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.SubContent
      className={cn(
        'titlebar-no-drag z-[70] min-w-[10rem] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-1 shadow-lg',
        className,
      )}
      {...props}
    />
  )
}
