import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { Bold, Italic, Link2, Strikethrough, Underline } from 'lucide-react'
import { ColorSwatchGrid } from '@/components/editor-toolbar/primitives'
import { HIGHLIGHT_COLORS } from '@/lib/editor/font-size'
import { hasEditorSelection } from '@/lib/editor/delete-content'
import { cn } from '@/lib/utils'

type EditorTextBubbleMenuProps = {
  editor: Editor | null
}

export function EditorTextBubbleMenu({ editor }: EditorTextBubbleMenuProps) {
  if (!editor) return null

  function setLink() {
    const previous = editor!.getAttributes('link').href as string | undefined
    const url = window.prompt('URL odkazu', previous ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor!.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor!.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <BubbleMenu
      editor={editor}
      className="editor-bubble-menu editor-bubble-menu--text titlebar-no-drag"
      shouldShow={({ editor: currentEditor }) =>
        hasEditorSelection(currentEditor) && !currentEditor.isActive('table')
      }
    >
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('bold') && 'is-active')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('italic') && 'is-active')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('underline') && 'is-active')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <Underline className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('strike') && 'is-active')} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('link') && 'is-active')} onClick={setLink}>
        <Link2 className="h-3.5 w-3.5" />
      </button>
      <span className="editor-bubble-divider" />
      <ColorSwatchGrid
        colors={HIGHLIGHT_COLORS}
        onPick={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()}
      />
    </BubbleMenu>
  )
}
