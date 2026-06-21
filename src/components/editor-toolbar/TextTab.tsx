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
import { FONT_SIZES, HIGHLIGHT_COLORS, TEXT_COLORS } from '@/lib/editor/font-size'
import { EmojiPickerPanel } from '@/components/editor/EmojiPickerPanel'

export function TextTab({ editor }: { editor: Editor }) {
  const historyState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      canUndo: currentEditor.can().undo(),
      canRedo: currentEditor.can().redo(),
    }),
  })

  const currentFont = getCurrentFontFamilyLabel(editor)
  const currentTextColor = (editor.getAttributes('textStyle').color as string | undefined) ?? ''

  function setLink() {
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL odkazu', previous ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="toolbar-panel">
      <ToolbarGroup label="História">
        <ToolbarButton
          label="Späť (⌘Z)"
          disabled={!historyState.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton
          label="Znovu (⌘⇧Z)"
          disabled={!historyState.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label="Typ bloku">
        <BlockTypeSelect editor={editor} />
      </ToolbarGroup>

      <ToolbarGroup label="Formátovanie">
        <ToolbarButton label="Tučné (⌘B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Kurzíva (⌘I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Podčiarknutie (⌘U)" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <Underline className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Prečiarknuté (⌘⇧X)" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Horný index" active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()}>
          <Superscript className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Dolný index" active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()}>
          <Subscript className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Odkaz (⌘K)" active={editor.isActive('link')} onClick={setLink}>
          <Link2 className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Inline kód (⌘E)" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label="Emoji" className="toolbar-group-wide">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-select toolbar-select-compact" title="Emoji">
              <Smile className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="emoji-picker-menu p-0">
            <EmojiPickerPanel editor={editor} />
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>

      <ToolbarGroup label="Písmo" className="toolbar-group-wide">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-select toolbar-select-compact" title="Veľkosť písma">
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
              Reset
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-select" title="Font">
              <span>{currentFont}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px] max-h-[360px] overflow-y-auto">
            <FontFamilyMenuItems editor={editor} />
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>

      <ToolbarGroup label="Farby" className="toolbar-group-wide">
        <ToolbarLabel>Text</ToolbarLabel>
        <ColorSwatchGrid
          colors={TEXT_COLORS}
          activeValue={currentTextColor}
          onPick={(value) => {
            if (!value) editor.chain().focus().unsetColor().run()
            else editor.chain().focus().setColor(value).run()
          }}
        />
        <CustomColorPicker
          label="Vlastná"
          onPick={(value) => editor.chain().focus().setColor(value).run()}
        />
        <ToolbarLabel>Zvýraznenie</ToolbarLabel>
        <ColorSwatchGrid
          colors={HIGHLIGHT_COLORS}
          onPick={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()}
        />
        <CustomColorPicker
          label="Vlastná"
          onPick={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()}
        />
        <ToolbarButton label="Odstrániť zvýraznenie" onClick={() => editor.chain().focus().unsetHighlight().run()}>
          <Highlighter className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>
    </div>
  )
}
