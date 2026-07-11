import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare,
  ChevronDown,
  Code,
  Ellipsis,
  Highlighter,
  ImagePlus,
  Italic,
  LayoutTemplate,
  Link2,
  List,
  ListChevronsDownUp,
  ListOrdered,
  ListTree,
  Minus,
  Palette,
  PlusSquare,
  Quote,
  Redo,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  Trash2,
  Type,
  Underline,
  Undo,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ColorMenuDropdown } from '@/components/editor-toolbar/ColorMenuDropdown'
import { FontFamilyMenuItems, getCurrentFontFamilyLabel } from '@/components/editor-toolbar/FontFamilyPicker'
import {
  BlockTypeSelect,
  ToolbarButton,
} from '@/components/editor-toolbar/primitives'
import { EmojiPickerPanel } from '@/components/editor/EmojiPickerPanel'
import { CODE_LANGUAGES, getCodeLanguageLabel } from '@/lib/editor/code-languages'
import { safeEditorCanRedo, safeEditorCanUndo } from '@/lib/editor/view-ready'
import {
  canDeleteCurrentBlock,
  deleteCurrentBlock,
  deleteEditorSelection,
  getActiveBlockDeleteLabel,
  hasEditorSelection,
} from '@/lib/editor/delete-content'
import { LINE_HEIGHTS, PARAGRAPH_SPACING } from '@/lib/editor/block-spacing'
import { FONT_SIZES, HIGHLIGHT_COLORS, TEXT_COLORS } from '@/lib/editor/font-size'
import { pickImageFiles } from '@/lib/editor/image-utils'
import {
  insertBlockMath,
  insertDetailsBlock,
  insertInlineMath,
  insertYoutubeVideo,
} from '@/lib/editor/insert-helpers'
import { insertBulletList, insertOrderedList, insertTaskList } from '@/lib/editor/list-commands'
import { PARAGRAPH_STYLES, applyParagraphStyle } from '@/lib/editor/paragraph-styles'
import { promptInput } from '@/lib/input-dialog'
import { cn } from '@/lib/utils'

type ToolbarRibbonProps = {
  editor: Editor
  onInsertImages: (files: File[]) => Promise<void>
}

function ToolbarCluster({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('toolbar-cluster', className)}>{children}</div>
}

function ToolbarSep() {
  return <span className="toolbar-sep" aria-hidden="true" />
}

export function ToolbarRibbon({ editor, onInsertImages }: ToolbarRibbonProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      canUndo: safeEditorCanUndo(currentEditor),
      canRedo: safeEditorCanRedo(currentEditor),
      currentTextColor: (currentEditor.getAttributes('textStyle').color as string | undefined) ?? '',
      isCodeBlock: currentEditor.isActive('codeBlock'),
      codeLanguage: (currentEditor.getAttributes('codeBlock').language as string | null) ?? null,
      isTable: currentEditor.isActive('table'),
      hasSelection: hasEditorSelection(currentEditor),
      canDeleteBlock: canDeleteCurrentBlock(currentEditor),
      blockDeleteLabel: getActiveBlockDeleteLabel(currentEditor),
      showInvisible: currentEditor.storage.invisibleCharacters.visibility(),
    }),
  })

  const currentFont = getCurrentFontFamilyLabel(editor)

  function setLink() {
    void (async () => {
      const previous = editor.getAttributes('link').href as string | undefined
      const url = await promptInput({
        title: 'Odkaz',
        description: 'Zadajte URL adresu odkazu.',
        defaultValue: previous ?? 'https://',
        placeholder: 'https://',
        confirmLabel: 'Použiť',
      })
      if (url === null) return
      if (url === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run()
        return
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    })()
  }

  function setCodeLanguage(language: string) {
    const attrs = language === 'auto' ? { language: null } : { language }
    if (state.isCodeBlock) {
      editor.chain().focus().updateAttributes('codeBlock', attrs).run()
      return
    }
    if (language === 'auto') {
      editor.chain().focus().toggleCodeBlock().run()
      return
    }
    editor.chain().focus().toggleCodeBlock({ language }).run()
  }

  async function handlePickImage() {
    const files = await pickImageFiles()
    if (files.length) await onInsertImages(files)
  }

  return (
    <div className="editor-toolbar-shell">
      <div className="editor-toolbar-ribbon">
        <ToolbarCluster className="toolbar-cluster--flat">
          <ToolbarButton
            label="Späť (⌘Z)"
            disabled={!state.canUndo}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
          <ToolbarButton
            label="Znovu (⌘⇧Z)"
            disabled={!state.canRedo}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
        </ToolbarCluster>

        <ToolbarSep />

        <BlockTypeSelect editor={editor} />

        <ToolbarSep />

        <ToolbarCluster className="toolbar-cluster--flat">
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
        </ToolbarCluster>

        <ToolbarSep />

        <ToolbarCluster className="toolbar-cluster--flat">
          <ToolbarButton label="Odrážky (⌘⇧8)" active={editor.isActive('bulletList')} onClick={() => insertBulletList(editor)}>
            <List className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
          <ToolbarButton label="Číslovaný zoznam (⌘⇧7)" active={editor.isActive('orderedList')} onClick={() => insertOrderedList(editor)}>
            <ListOrdered className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
          <ToolbarButton label="Checklist (⌘⇧9)" active={editor.isActive('taskList')} onClick={() => insertTaskList(editor)}>
            <CheckSquare className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
        </ToolbarCluster>

        <ToolbarSep />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-menu-trigger toolbar-menu-trigger--icon" title="Zarovnanie">
              <AlignLeft className="h-4 w-4 stroke-[1.75]" />
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="toolbar-section-menu min-w-[180px]">
            <div className="toolbar-section-menu-row">
              <ToolbarButton label="Vľavo" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
                <AlignLeft className="h-4 w-4 stroke-[1.75]" />
              </ToolbarButton>
              <ToolbarButton label="Na stred" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
                <AlignCenter className="h-4 w-4 stroke-[1.75]" />
              </ToolbarButton>
              <ToolbarButton label="Vpravo" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
                <AlignRight className="h-4 w-4 stroke-[1.75]" />
              </ToolbarButton>
              <ToolbarButton label="Do bloku" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
                <AlignJustify className="h-4 w-4 stroke-[1.75]" />
              </ToolbarButton>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <ToolbarSep />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-menu-trigger" title={`Typografia · ${currentFont}`}>
              <Type className="h-3.5 w-3.5 opacity-70" />
              <span className="toolbar-menu-label">Aa</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px] max-h-[360px] overflow-y-auto">
            <p className="toolbar-section-menu-label">Veľkosť</p>
            {FONT_SIZES.map((size) => (
              <DropdownMenuItem key={size} onClick={() => editor.chain().focus().setFontSize(size).run()}>
                {size}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => editor.chain().focus().unsetFontSize().run()}>
              Reset veľkosti
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <p className="toolbar-section-menu-label">Písmo</p>
            <FontFamilyMenuItems editor={editor} />
          </DropdownMenuContent>
        </DropdownMenu>

        <ColorMenuDropdown
          label="Farba textu"
          icon={<Palette className="h-3.5 w-3.5" />}
          colors={TEXT_COLORS}
          activeValue={state.currentTextColor}
          onPick={(value) => {
            if (!value) editor.chain().focus().unsetColor().run()
            else editor.chain().focus().setColor(value).run()
          }}
          onCustomPick={(value) => editor.chain().focus().setColor(value).run()}
          onClear={() => editor.chain().focus().unsetColor().run()}
        />

        <ColorMenuDropdown
          label="Zvýraznenie"
          icon={<Highlighter className="h-3.5 w-3.5" />}
          colors={HIGHLIGHT_COLORS}
          onPick={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()}
          onCustomPick={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()}
          onClear={() => editor.chain().focus().unsetHighlight().run()}
        />

        <ToolbarButton label="Odkaz (⌘K)" active={editor.isActive('link')} onClick={setLink}>
          <Link2 className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-btn toolbar-item-optional" title="Emoji">
              <span className="toolbar-emoji-trigger" aria-hidden="true">☺</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="emoji-picker-menu p-0">
            <EmojiPickerPanel editor={editor} />
          </DropdownMenuContent>
        </DropdownMenu>

        <ToolbarSep />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-menu-trigger toolbar-menu-trigger--icon" title="Vložiť">
              <PlusSquare className="h-4 w-4 stroke-[1.75]" />
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px]">
            <DropdownMenuItem onClick={() => void handlePickImage()}>
              <ImagePlus className="h-4 w-4" />
              Obrázok
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
              <Table2 className="h-4 w-4" />
              Tabuľka
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertYoutubeVideo(editor)}>YouTube video</DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().insertTableOfContents().run()}>
              <ListTree className="h-4 w-4" />
              Obsah (TOC)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().setPageBreak().run()}>
              Zalomenie strany
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertInlineMath(editor)}>Vzorec v riadku</DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertBlockMath(editor)}>Vzorec blok</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
              <Code className="h-4 w-4" />
              Blok kódu
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-menu-trigger toolbar-menu-trigger--icon" title="Formát odseku">
              <LayoutTemplate className="h-4 w-4 stroke-[1.75]" />
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="toolbar-section-menu min-w-[220px]">
            <p className="toolbar-section-menu-label">Štýly odsekov</p>
            {PARAGRAPH_STYLES.map((style) => (
              <DropdownMenuItem key={style.id} onClick={() => applyParagraphStyle(editor, style.id)}>
                {style.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <p className="toolbar-section-menu-label">Riadkovanie</p>
            {LINE_HEIGHTS.map((option) => (
              <DropdownMenuItem key={option.value} onClick={() => editor.chain().focus().setLineHeight(option.value).run()}>
                {option.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => editor.chain().focus().unsetLineHeight().run()}>
              Reset riadkovania
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <p className="toolbar-section-menu-label">Medzera pod odsekom</p>
            {PARAGRAPH_SPACING.map((option) => (
              <DropdownMenuItem key={option.value} onClick={() => editor.chain().focus().setSpaceAfter(option.value).run()}>
                {option.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <Quote className="h-4 w-4" />
              Citácia
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().setHorizontalRule().run()}>
              <Minus className="h-4 w-4" />
              Oddeľovač
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertDetailsBlock(editor)}>
              <ListChevronsDownUp className="h-4 w-4" />
              Rozbaľovacia sekcia
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="toolbar-spacer" aria-hidden="true" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-btn" title="Ďalšie nástroje">
              <Ellipsis className="h-4 w-4 stroke-[1.75]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[220px]">
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleSuperscript().run()}>
              <Superscript className="h-4 w-4" />
              Horný index
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleSubscript().run()}>
              <Subscript className="h-4 w-4" />
              Dolný index
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleCode().run()}>
              <Code className="h-4 w-4" />
              Inline kód
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleInvisibleCharacters().run()}>
              {state.showInvisible ? 'Skryť neviditeľné znaky' : 'Zobraziť neviditeľné znaky'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!state.hasSelection} onClick={() => deleteEditorSelection(editor)}>
              Odstrániť výber
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!state.canDeleteBlock} onClick={() => deleteCurrentBlock(editor)}>
              {state.blockDeleteLabel ?? 'Odstrániť blok'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
              Odstrániť formátovanie
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-[var(--color-destructive)]"
              onClick={() => editor.chain().focus().clearContent().run()}
            >
              Vyčistiť celý dokument
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {(state.isCodeBlock || state.isTable) && (
        <div className="editor-toolbar-context">
          {state.isCodeBlock && (
            <>
              <ToolbarButton
                label="Blok kódu"
                active
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              >
                <Code className="h-4 w-4 stroke-[1.75]" />
              </ToolbarButton>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="toolbar-menu-trigger" title="Jazyk syntaxe">
                    <span>{getCodeLanguageLabel(state.codeLanguage)}</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="code-lang-menu">
                  {CODE_LANGUAGES.map(({ id, label }) => (
                    <DropdownMenuItem
                      key={id}
                      className={cn((state.codeLanguage ?? 'auto') === id && 'is-selected')}
                      onClick={() => setCodeLanguage(id)}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <ToolbarButton label="Odstrániť blok kódu" onClick={() => deleteCurrentBlock(editor)}>
                <Trash2 className="h-4 w-4 stroke-[1.75]" />
              </ToolbarButton>
            </>
          )}

          {state.isTable && (
            <>
              <ToolbarButton label="Pridať riadok" onClick={() => editor.chain().focus().addRowAfter().run()}>
                +R
              </ToolbarButton>
              <ToolbarButton label="Pridať stĺpec" onClick={() => editor.chain().focus().addColumnAfter().run()}>
                +S
              </ToolbarButton>
              <ToolbarButton label="Odstrániť tabuľku" onClick={() => editor.chain().focus().deleteTable().run()}>
                <Trash2 className="h-4 w-4 stroke-[1.75]" />
              </ToolbarButton>
            </>
          )}
        </div>
      )}
    </div>
  )
}
