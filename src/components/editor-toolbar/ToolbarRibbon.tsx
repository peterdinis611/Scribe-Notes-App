import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { useAtomValue, useSetAtom } from 'jotai'
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
  Minus,
  Palette,
  PlusSquare,
  Quote,
  Redo,
  Smile,
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
import {
  canDeleteCurrentBlock,
  deleteCurrentBlock,
  deleteEditorSelection,
  getActiveBlockDeleteLabel,
  hasEditorSelection,
} from '@/lib/editor/delete-content'
import { FONT_SIZES, HIGHLIGHT_COLORS, TEXT_COLORS } from '@/lib/editor/font-size'
import { pickImageFiles } from '@/lib/editor/image-utils'
import {
  insertBlockMath,
  insertDetailsBlock,
  insertInlineMath,
  insertYoutubeVideo,
} from '@/lib/editor/insert-helpers'
import { listDocumentRevisions, restoreDocumentRevision, type DocumentRevision } from '@/lib/db/api'
import { cacheDocument } from '@/lib/cache/document-cache'
import { cn, formatRelativeTime } from '@/lib/utils'
import { activeDocumentAtom, activeDocumentIdAtom, documentsAtom } from '@/store/documents'

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
  const activeId = useAtomValue(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const [revisions, setRevisions] = useState<DocumentRevision[]>([])

  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      canUndo: currentEditor.can().undo(),
      canRedo: currentEditor.can().redo(),
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

  useEffect(() => {
    if (!activeId) {
      setRevisions([])
      return
    }
    void listDocumentRevisions(activeId, 15).then(setRevisions).catch(() => setRevisions([]))
  }, [activeId])

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

  async function handleRestoreRevision(revisionId: string) {
    const restored = cacheDocument(await restoreDocumentRevision(revisionId))
    setActiveDocument(restored)
    setDocuments((prev) =>
      prev.map((item) =>
        item.id === restored.id
          ? {
              ...item,
              title: restored.title,
              filePath: restored.filePath,
              updatedAt: restored.updatedAt,
            }
          : item,
      ),
    )
    editor.commands.setContent(JSON.parse(restored.contentJson), { emitUpdate: false })
    if (activeId) {
      const next = await listDocumentRevisions(activeId, 15)
      setRevisions(next)
    }
  }

  return (
    <div className="editor-toolbar-shell">
      <div className="editor-toolbar-ribbon">
        <ToolbarCluster>
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

        <ToolbarCluster>
          <BlockTypeSelect editor={editor} />
        </ToolbarCluster>

        <ToolbarSep />

        <ToolbarCluster>
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
          <span className="toolbar-cluster-inner-sep" aria-hidden="true" />
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
        </ToolbarCluster>

        <ToolbarSep />

        <ToolbarCluster>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="toolbar-menu-trigger" title="Veľkosť písma">
                <Type className="h-3.5 w-3.5 opacity-70" />
                <span>Aa</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
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
              <button type="button" className="toolbar-menu-trigger toolbar-menu-trigger--icon" title={`Font: ${currentFont}`}>
                <Type className="h-4 w-4 stroke-[1.75]" />
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[220px] max-h-[360px] overflow-y-auto">
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="toolbar-btn" title="Emoji">
                <Smile className="h-4 w-4 stroke-[1.75]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="emoji-picker-menu p-0">
              <EmojiPickerPanel editor={editor} />
            </DropdownMenuContent>
          </DropdownMenu>
        </ToolbarCluster>

        <ToolbarSep />

        <ToolbarCluster>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="toolbar-menu-trigger" title="Rozloženie">
                <LayoutTemplate className="h-3.5 w-3.5 opacity-70" />
                <span>Rozloženie</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="toolbar-section-menu min-w-[220px]">
              <p className="toolbar-section-menu-label">Zarovnanie</p>
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleBulletList().run()}>
                <List className="h-4 w-4" />
                Odrážky
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleOrderedList().run()}>
                <ListOrdered className="h-4 w-4" />
                Číslovaný zoznam
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleTaskList().run()}>
                <CheckSquare className="h-4 w-4" />
                Checklist
              </DropdownMenuItem>
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="toolbar-menu-trigger" title="Vložiť">
                <PlusSquare className="h-3.5 w-3.5 opacity-70" />
                <span>Vložiť</span>
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
              <DropdownMenuItem onClick={() => insertYoutubeVideo(editor)}>
                YouTube video
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().setPageBreak().run()}>
                Zalomenie strany
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertInlineMath(editor)}>
                Vzorec v riadku
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertBlockMath(editor)}>
                Vzorec blok
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
                <Code className="h-4 w-4" />
                Blok kódu
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ToolbarCluster>

        <ToolbarCluster className="toolbar-cluster--end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="toolbar-btn" title="Ďalšie nástroje">
                <Ellipsis className="h-4 w-4 stroke-[1.75]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleInvisibleCharacters().run()}>
                {state.showInvisible ? 'Skryť neviditeľné znaky' : 'Zobraziť neviditeľné znaky'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!state.hasSelection}
                onClick={() => deleteEditorSelection(editor)}
              >
                Odstrániť výber
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!state.canDeleteBlock}
                onClick={() => deleteCurrentBlock(editor)}
              >
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
              <DropdownMenuSeparator />
              {revisions.length === 0 ? (
                <DropdownMenuItem disabled>Žiadne uložené verzie</DropdownMenuItem>
              ) : (
                revisions.map((revision) => (
                  <DropdownMenuItem key={revision.id} onClick={() => void handleRestoreRevision(revision.id)}>
                    <span className="revision-menu-title">{revision.title}</span>
                    <span className="revision-menu-time">{formatRelativeTime(revision.createdAt)}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </ToolbarCluster>
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
