import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link2,
  MessageSquare,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from 'lucide-react'
import { ColorSwatchGrid, CustomColorPicker } from '@/components/editor-toolbar/primitives'
import { HIGHLIGHT_COLORS, TEXT_COLORS } from '@/lib/editor/font-size'
import { hasEditorSelection } from '@/lib/editor/delete-content'
import { createCommentForSelection } from '@/lib/editor/comments'
import { cn } from '@/lib/utils'

type EditorTextBubbleMenuProps = {
  editor: Editor | null
}

export function EditorTextBubbleMenu({ editor }: EditorTextBubbleMenuProps) {
  if (!editor) return null

  const currentTextColor = (editor.getAttributes('textStyle').color as string | undefined) ?? ''

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
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('bold') && 'is-active')} title="Tučné (⌘B)" onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('italic') && 'is-active')} title="Kurzíva (⌘I)" onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('underline') && 'is-active')} title="Podčiarknutie (⌘U)" onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <Underline className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('strike') && 'is-active')} title="Prečiarknuté (⌘⇧X)" onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('code') && 'is-active')} title="Inline kód (⌘E)" onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('superscript') && 'is-active')} title="Horný index" onClick={() => editor.chain().focus().toggleSuperscript().run()}>
        <Superscript className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('subscript') && 'is-active')} title="Dolný index" onClick={() => editor.chain().focus().toggleSubscript().run()}>
        <Subscript className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('link') && 'is-active')} title="Odkaz (⌘K)" onClick={setLink}>
        <Link2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={cn('editor-bubble-icon-btn', editor.isActive('comment') && 'is-active')}
        title="Komentár"
        onClick={() => {
          void createCommentForSelection(editor)
        }}
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </button>
      <span className="editor-bubble-divider" />
      <ColorSwatchGrid
        colors={TEXT_COLORS}
        activeValue={currentTextColor}
        onPick={(value) => {
          if (!value) editor.chain().focus().unsetColor().run()
          else editor.chain().focus().setColor(value).run()
        }}
      />
      <CustomColorPicker label="+" onPick={(value) => editor.chain().focus().setColor(value).run()} />
      <span className="editor-bubble-divider" />
      <ColorSwatchGrid
        colors={HIGHLIGHT_COLORS}
        onPick={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()}
      />
      <CustomColorPicker label="+" onPick={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()} />
      <button
        type="button"
        className={cn('editor-bubble-icon-btn', editor.isActive('highlight') && 'is-active')}
        title="Odstrániť zvýraznenie"
        onClick={() => editor.chain().focus().unsetHighlight().run()}
      >
        <Highlighter className="h-3.5 w-3.5" />
      </button>
    </BubbleMenu>
  )
}
