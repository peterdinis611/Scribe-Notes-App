import { useAtomValue } from 'jotai'
import { FileCode2, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { editorModeActionsAtom } from '@/store/settings'

export function EditorViewModeToggle({ className }: { className?: string }) {
  const actions = useAtomValue(editorModeActionsAtom)
  if (!actions) return null

  const isMarkdown = actions.viewMode === 'markdown'

  return (
    <div className={cn('editor-view-mode-toggle', className)}>
      <Button
        type="button"
        variant={isMarkdown ? 'ghost' : 'default'}
        size="sm"
        className="editor-view-mode-btn"
        onClick={actions.switchToRich}
        aria-pressed={!isMarkdown}
      >
        <Type className="h-3.5 w-3.5" />
        <span className="editor-header-label">Rich text</span>
      </Button>
      <Button
        type="button"
        variant={isMarkdown ? 'default' : 'ghost'}
        size="sm"
        className="editor-view-mode-btn"
        onClick={actions.switchToMarkdown}
        aria-pressed={isMarkdown}
      >
        <FileCode2 className="h-3.5 w-3.5" />
        <span className="editor-header-label">Markdown</span>
      </Button>
    </div>
  )
}
