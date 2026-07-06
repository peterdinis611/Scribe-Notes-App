import { FileCode2, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { editorRefs } from '@/store/editorRefs'

export function EditorViewModeToggle({ className }: { className?: string }) {
  const actions = editorRefs.modeActions
  if (!actions) return null

  const isMarkdown = actions.viewMode === 'markdown'

  return (
    <div
      className={cn(
        'inline-flex shrink-0 gap-px rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-sidebar)] p-px',
        className,
      )}
    >
      <Button
        type="button"
        variant={isMarkdown ? 'ghost' : 'default'}
        size="sm"
        className="h-7 gap-1 px-2 text-[12px] [[data-layout-tier=medium]_&]:w-8 [[data-layout-tier=medium]_&]:min-w-8 [[data-layout-tier=medium]_&]:px-0 [[data-layout-tier=narrow]_&]:w-8 [[data-layout-tier=narrow]_&]:min-w-8 [[data-layout-tier=narrow]_&]:px-0 [[data-layout-tier=tight]_&]:w-8 [[data-layout-tier=tight]_&]:min-w-8 [[data-layout-tier=tight]_&]:px-0"
        title="Formátovaný text"
        onClick={actions.switchToRich}
        aria-pressed={!isMarkdown}
      >
        <Type className="h-3.5 w-3.5" />
        <span className="[[data-layout-tier=medium]_&]:hidden [[data-layout-tier=narrow]_&]:hidden [[data-layout-tier=tight]_&]:hidden">
          Text
        </span>
      </Button>
      <Button
        type="button"
        variant={isMarkdown ? 'default' : 'ghost'}
        size="sm"
        className="h-7 gap-1 px-2 text-[12px] [[data-layout-tier=medium]_&]:w-8 [[data-layout-tier=medium]_&]:min-w-8 [[data-layout-tier=medium]_&]:px-0 [[data-layout-tier=narrow]_&]:w-8 [[data-layout-tier=narrow]_&]:min-w-8 [[data-layout-tier=narrow]_&]:px-0 [[data-layout-tier=tight]_&]:w-8 [[data-layout-tier=tight]_&]:min-w-8 [[data-layout-tier=tight]_&]:px-0"
        title="Markdown"
        onClick={actions.switchToMarkdown}
        aria-pressed={isMarkdown}
      >
        <FileCode2 className="h-3.5 w-3.5" />
        <span className="[[data-layout-tier=medium]_&]:hidden [[data-layout-tier=narrow]_&]:hidden [[data-layout-tier=tight]_&]:hidden">
          MD
        </span>
      </Button>
    </div>
  )
}
