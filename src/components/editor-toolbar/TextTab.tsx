import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link2,
  Redo,
  Smile,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
  Undo,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FontFamilyMenuItems, getCurrentFontFamilyLabel } from '@/components/editor-toolbar/FontFamilyPicker'
import {
  BlockTypeSelect,
  ColorSwatchGrid,
  CustomColorPicker,
  ToolbarButton,
  ToolbarGroup,
  ToolbarLabel,
} from '@/components/editor-toolbar/primitives'
import { safeEditorCanRedo, safeEditorCanUndo } from '@/lib/editor/view-ready'
import { FONT_SIZES, HIGHLIGHT_COLORS, TEXT_COLORS } from '@/lib/editor/font-size'
import { EmojiPickerPanel } from '@/components/editor/EmojiPickerPanel'

export function TextTab({ editor }: { editor: Editor }) {
  const { t } = useTranslation()
  const historyState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      canUndo: safeEditorCanUndo(currentEditor),
      canRedo: safeEditorCanRedo(currentEditor),
    }),
  })

  const currentFont = getCurrentFontFamilyLabel(editor)
  const currentTextColor = (editor.getAttributes('textStyle').color as string | undefined) ?? ''

  function setLink() {
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt(t('editorActions.linkUrlPrompt'), previous ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="toolbar-panel">
      <ToolbarGroup label={t('toolbar.groups.history')}>
        <ToolbarButton
          label={t('toolbar.actions.undo')}
          disabled={!historyState.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton
          label={t('toolbar.actions.redo')}
          disabled={!historyState.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label={t('toolbar.groups.blockType')}>
        <BlockTypeSelect editor={editor} />
      </ToolbarGroup>

      <ToolbarGroup label={t('toolbar.groups.formatting')}>
        <ToolbarButton label={t('toolbar.actions.bold')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label={t('toolbar.actions.italic')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label={t('toolbar.actions.underline')} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <Underline className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label={t('toolbar.actions.strike')} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label={t('toolbar.actions.superscript')} active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()}>
          <Superscript className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label={t('toolbar.actions.subscript')} active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()}>
          <Subscript className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label={t('toolbar.actions.link')} active={editor.isActive('link')} onClick={setLink}>
          <Link2 className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label={t('toolbar.actions.inlineCode')} active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label={t('toolbar.groups.emoji')} className="toolbar-group-wide">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-select toolbar-select-compact" title={t('toolbar.actions.emoji')}>
              <Smile className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="emoji-picker-menu p-0">
            <EmojiPickerPanel editor={editor} />
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>

      <ToolbarGroup label={t('toolbar.groups.font')} className="toolbar-group-wide">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-select toolbar-select-compact" title={t('toolbar.actions.fontSizeTitle')}>
              <span>Aa</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[280px] overflow-y-auto">
            {FONT_SIZES.map((size) => (
              <DropdownMenuItem key={size} onClick={() => editor.chain().focus().setFontSize(size).run()}>
                {size}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => editor.chain().focus().unsetFontSize().run()}>
              {t('common.reset')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-select" title={t('toolbar.actions.fontTitle')}>
              <span>{currentFont}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px] max-h-[360px] overflow-y-auto">
            <FontFamilyMenuItems editor={editor} />
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>

      <ToolbarGroup label={t('toolbar.groups.colors')} className="toolbar-group-wide">
        <ToolbarLabel>{t('toolbar.actions.textLabel')}</ToolbarLabel>
        <ColorSwatchGrid
          colors={TEXT_COLORS}
          activeValue={currentTextColor}
          onPick={(value) => {
            if (!value) editor.chain().focus().unsetColor().run()
            else editor.chain().focus().setColor(value).run()
          }}
        />
        <CustomColorPicker
          label={t('toolbar.actions.customColor')}
          onPick={(value) => editor.chain().focus().setColor(value).run()}
        />
        <ToolbarLabel>{t('toolbar.actions.highlightLabel')}</ToolbarLabel>
        <ColorSwatchGrid
          colors={HIGHLIGHT_COLORS}
          onPick={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()}
        />
        <CustomColorPicker
          label={t('toolbar.actions.customColor')}
          onPick={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()}
        />
        <ToolbarButton label={t('editorActions.deleteHighlight')} onClick={() => editor.chain().focus().unsetHighlight().run()}>
          <Highlighter className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>
    </div>
  )
}
