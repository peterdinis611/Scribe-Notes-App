import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  canDeleteCurrentBlock,
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

  const showDelete = shouldShowBlockBubble(editor)

  return (
    <BubbleMenu
      editor={editor}
      className="editor-bubble-menu editor-bubble-menu--block titlebar-no-drag"
      shouldShow={({ editor: currentEditor }) =>
        !hasEditorSelection(currentEditor) && shouldShowBlockBubble(currentEditor)
      }
    >
      {showDelete && (
        <button type="button" className="editor-bubble-btn" onClick={() => deleteCurrentBlock(editor)}>
          <Trash2 className="h-3.5 w-3.5" />
          {getActiveBlockDeleteLabel(editor) ?? t('editorActions.deleteSelection')}
        </button>
      )}

      {canDeleteCurrentBlock(editor) && editor.isActive('image') && (
        <button
          type="button"
          className="editor-bubble-btn editor-bubble-btn--neutral"
          onClick={() => editor.chain().focus().setNodeSelection(editor.state.selection.from).run()}
        >
          Vybrať obrázok
        </button>
      )}
    </BubbleMenu>
  )
}
