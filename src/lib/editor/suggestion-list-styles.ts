import { cn } from '@/lib/utils'

export const suggestionListClass =
  'z-50 min-w-[220px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]'

export const suggestionEmptyClass =
  'px-3 py-2 text-[12px] text-[var(--color-muted-foreground)]'

export function suggestionItemClass(active: boolean) {
  return cn(
    'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
    active ? 'bg-[var(--color-selection)]' : 'hover:bg-[var(--color-hover)]',
  )
}

export const suggestionIconClass =
  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-hover)] text-[12px] font-semibold text-[var(--color-muted-foreground)]'

export const suggestionLabelClass = 'min-w-0 flex-1 text-[13px] font-medium text-[var(--color-foreground)]'

export const suggestionHintClass = 'shrink-0 text-[11px] text-[var(--color-muted-foreground)]'
