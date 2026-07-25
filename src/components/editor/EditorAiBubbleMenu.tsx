import type { Editor } from '@tiptap/react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AI_ACTION_IDS } from '@/lib/ai/actions'
import { isAiAvailable } from '@/lib/ai/config'
import { runAiEditorAction } from '@/lib/ai/run-action'
import type { AiActionId } from '@/lib/ai/types'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store/hooks'

type EditorAiBubbleMenuProps = {
  editor: Editor
}

export function EditorAiBubbleMenu({ editor }: EditorAiBubbleMenuProps) {
  const { t } = useTranslation()
  const aiSettings = useAppSelector((state) => state.settings.aiSettings)

  if (!isAiAvailable(aiSettings)) return null

  function runAction(action: AiActionId) {
    void runAiEditorAction(editor, action)
  }

  return (
    <>
      <span className="editor-bubble-divider" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn('editor-bubble-icon-btn flex items-center gap-0.5 px-1.5')}
            title={t('ai.menuTitle')}
            aria-label={t('ai.menuTitle')}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          {AI_ACTION_IDS.map((action) => (
            <DropdownMenuItem key={action} onSelect={() => runAction(action)}>
              {t(`ai.actions.${action}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
