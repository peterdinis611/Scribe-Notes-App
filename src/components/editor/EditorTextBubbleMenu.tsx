import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import {
  Bold,
  Code,
  Ellipsis,
  Highlighter,
  Italic,
  Link2,
  MessageSquare,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ColorSwatchGrid, CustomColorPicker } from '@/components/editor-toolbar/primitives'
import { HIGHLIGHT_COLORS, TEXT_COLORS } from '@/lib/editor/font-size'
import { hasEditorSelection } from '@/lib/editor/delete-content'
import { createCommentForSelection } from '@/lib/editor/comments'
import { promptAndApplyEditorLink } from '@/lib/editor/link-prompt'
import { cn } from '@/lib/utils'

type EditorTextBubbleMenuProps = {
  editor: Editor | null
}

export function EditorTextBubbleMenu({ editor }: EditorTextBubbleMenuProps) {
  const { t } = useTranslation()
  if (!editor) return null

  const currentTextColor = (editor.getAttributes('textStyle').color as string | undefined) ?? ''

  function setLink() {
    void promptAndApplyEditorLink(editor)
  }

  return (
    <BubbleMenu
      editor={editor}
      className="editor-bubble-menu editor-bubble-menu--text titlebar-no-drag"
      shouldShow={({ editor: currentEditor }) =>
        hasEditorSelection(currentEditor) && !currentEditor.isActive('table')
      }
    >
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('bold') && 'is-active')} title={t('toolbar.actions.bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('italic') && 'is-active')} title={t('toolbar.actions.italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('underline') && 'is-active')} title={t('toolbar.actions.underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <Underline className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={cn('editor-bubble-icon-btn', editor.isActive('link') && 'is-active')} title={t('toolbar.actions.link')} onClick={setLink}>
        <Link2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={cn('editor-bubble-icon-btn', editor.isActive('comment') && 'is-active')}
        title={t('editorActions.comment')}
        onClick={() => {
          void createCommentForSelection(editor)
        }}
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </button>

      <span className="editor-bubble-divider" />

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="editor-bubble-icon-btn"
            title={t('toolbar.actions.moreFormatting')}
            aria-label={t('toolbar.actions.moreFormatting')}
            onMouseDown={(event) => event.preventDefault()}
          >
            <Ellipsis className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="editor-bubble-more" onCloseAutoFocus={(event) => event.preventDefault()}>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough className="h-3.5 w-3.5" />
            {t('toolbar.actions.strike')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleCode().run()}>
            <Code className="h-3.5 w-3.5" />
            {t('toolbar.actions.inlineCode')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleSuperscript().run()}>
            <Superscript className="h-3.5 w-3.5" />
            {t('toolbar.actions.superscript')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleSubscript().run()}>
            <Subscript className="h-3.5 w-3.5" />
            {t('toolbar.actions.subscript')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <p className="editor-bubble-more-label">{t('toolbar.actions.textColor')}</p>
          <div className="editor-bubble-more-swatches">
            <ColorSwatchGrid
              colors={TEXT_COLORS}
              activeValue={currentTextColor}
              onPick={(value) => {
                if (!value) editor.chain().focus().unsetColor().run()
                else editor.chain().focus().setColor(value).run()
              }}
            />
            <CustomColorPicker label="+" onPick={(value) => editor.chain().focus().setColor(value).run()} />
          </div>
          <p className="editor-bubble-more-label">{t('toolbar.actions.highlight')}</p>
          <div className="editor-bubble-more-swatches">
            <ColorSwatchGrid
              colors={HIGHLIGHT_COLORS}
              onPick={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()}
            />
            <CustomColorPicker label="+" onPick={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()} />
            <button
              type="button"
              className={cn('editor-bubble-icon-btn', editor.isActive('highlight') && 'is-active')}
              title={t('editorActions.deleteHighlight')}
              onClick={() => editor.chain().focus().unsetHighlight().run()}
            >
              <Highlighter className="h-3.5 w-3.5" />
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </BubbleMenu>
  )
}
