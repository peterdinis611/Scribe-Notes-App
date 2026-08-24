import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  deleteCurrentBlock,
  getActiveBlockDeleteLabel,
  hasEditorSelection,
  shouldShowBlockBubble,
} from '@/lib/editor/delete-content'

type EditorBlockBubbleMenuProps = {
  editor: Editor | null
}

export function EditorBlockBubbleMenu({ editor }: EditorBlockBubbleMenuProps) {
  const { t } = useTranslation()
  if (!editor) return null

  return (
    <BubbleMenu
      editor={editor}
      className="editor-bubble-menu editor-bubble-menu--block titlebar-no-drag"
      shouldShow={({ editor: currentEditor }) =>
        !hasEditorSelection(currentEditor) && shouldShowBlockBubble(currentEditor)
      }
    >
      <button type="button" className="editor-bubble-btn" onClick={() => deleteCurrentBlock(editor)}>
        <Trash2 className="h-3.5 w-3.5" />
        {getActiveBlockDeleteLabel(editor) ?? t('editorActions.deleteSelection')}
      </button>
    </BubbleMenu>
  )
}
