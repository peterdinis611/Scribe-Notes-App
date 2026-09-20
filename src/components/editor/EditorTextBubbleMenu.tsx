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
  Sparkles,
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
import { SelectionAIContextMenu } from '@/components/editor/SelectionAIContextMenu'
import { HIGHLIGHT_COLORS, TEXT_COLORS } from '@/lib/editor/font-size'
import { hasEditorSelection } from '@/lib/editor/delete-content'
import { createCommentForSelection } from '@/lib/editor/comments'
import { promptAndApplyEditorLink } from '@/lib/editor/link-prompt'
import { keepEditorSelectionFocus } from '@/lib/editor/view-ready'
import { nlpStatus } from '@/lib/db/nlp-api'
import { cn } from '@/lib/utils'
import { IconTooltip } from '@/components/ui/tooltip'
import { useEffect, useState, type ReactNode } from 'react'

function BubbleIcon({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <IconTooltip label={label}>
      <button
        type="button"
        className={cn('editor-bubble-icon-btn', active && 'is-active')}
        aria-label={label}
        onClick={onClick}
      >
        {children}
      </button>
    </IconTooltip>
  )
}

type EditorTextBubbleMenuProps = {
  editor: Editor | null
}

export function EditorTextBubbleMenu({ editor }: EditorTextBubbleMenuProps) {
  const { t } = useTranslation()
  const [nlpReady, setNlpReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void nlpStatus()
      .then((status) => {
        if (!cancelled) setNlpReady(Boolean(status.enabled && status.sidecarOk))
      })
      .catch(() => {
        if (!cancelled) setNlpReady(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!editor) return null
  const activeEditor = editor

  const currentTextColor = (activeEditor.getAttributes('textStyle').color as string | undefined) ?? ''

  function setLink() {
    void promptAndApplyEditorLink(activeEditor)
  }

  function selectedPlainText() {
    const { from, to } = activeEditor.state.selection
    return activeEditor.state.doc.textBetween(from, to, ' ')
  }

  function replaceSelection(next: string) {
    const { from, to } = activeEditor.state.selection
    activeEditor.chain().focus().insertContentAt({ from, to }, next).run()
  }

  function insertBelow(next: string) {
    const { to } = activeEditor.state.selection
    activeEditor.chain().focus().insertContentAt(to, `\n${next}`).run()
  }

  return (
    <BubbleMenu
      editor={editor}
      className="editor-bubble-menu editor-bubble-menu--text titlebar-no-drag"
      shouldShow={({ editor: currentEditor }) =>
        hasEditorSelection(currentEditor) && !currentEditor.isActive('table')
      }
    >
      <BubbleIcon label={t('toolbar.actions.bold')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
      </BubbleIcon>
      <BubbleIcon label={t('toolbar.actions.italic')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
      </BubbleIcon>
      <BubbleIcon label={t('toolbar.actions.underline')} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <Underline className="h-3.5 w-3.5" />
      </BubbleIcon>
      <BubbleIcon label={t('toolbar.actions.link')} active={editor.isActive('link')} onClick={setLink}>
        <Link2 className="h-3.5 w-3.5" />
      </BubbleIcon>
      <BubbleIcon
        label={t('editorActions.comment')}
        active={editor.isActive('comment')}
        onClick={() => {
          void createCommentForSelection(editor)
        }}
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </BubbleIcon>

      {nlpReady ? (
        <DropdownMenu modal={false}>
          <IconTooltip label={t('aiRewrite.title')}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="editor-bubble-icon-btn"
                aria-label={t('aiRewrite.title')}
                onMouseDown={(event) => event.preventDefault()}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
          </IconTooltip>
          <DropdownMenuContent
            align="start"
            className="selection-ai-pop"
            onCloseAutoFocus={keepEditorSelectionFocus(editor)}
          >
            <SelectionAIContextMenu
              selectedText={selectedPlainText()}
              onReplaceText={replaceSelection}
              onInsertBelow={insertBelow}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <span className="editor-bubble-divider" />

      <DropdownMenu modal={false}>
        <IconTooltip label={t('toolbar.actions.moreFormatting')}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="editor-bubble-icon-btn"
              aria-label={t('toolbar.actions.moreFormatting')}
              onMouseDown={(event) => event.preventDefault()}
            >
              <Ellipsis className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
        </IconTooltip>
        <DropdownMenuContent
          align="end"
          className="editor-bubble-more"
          onCloseAutoFocus={keepEditorSelectionFocus(editor)}
        >
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
            <IconTooltip label={t('editorActions.deleteHighlight')}>
              <button
                type="button"
                className={cn('editor-bubble-icon-btn', editor.isActive('highlight') && 'is-active')}
                aria-label={t('editorActions.deleteHighlight')}
                onClick={() => editor.chain().focus().unsetHighlight().run()}
              >
                <Highlighter className="h-3.5 w-3.5" />
              </button>
            </IconTooltip>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </BubbleMenu>
  )
}
