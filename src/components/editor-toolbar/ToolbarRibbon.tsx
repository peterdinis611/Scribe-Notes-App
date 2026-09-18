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
  ScanLine,
  Smile,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  Type,
  Underline,
  Undo,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FontFamilyMenuItems, getCurrentFontFamilyLabel } from '@/components/editor-toolbar/FontFamilyPicker'
import {
  BlockTypeSelect,
  ColorSwatchGrid,
  CustomColorPicker,
  ToolbarButton,
} from '@/components/editor-toolbar/primitives'
import { EmojiPickerPanel } from '@/components/editor/EmojiPickerPanel'
import { keepEditorSelectionFocus, safeEditorCanRedo, safeEditorCanUndo } from '@/lib/editor/view-ready'
import {
  canDeleteCurrentBlock,
  deleteCurrentBlock,
  deleteEditorSelection,
  getActiveBlockDeleteLabel,
  hasEditorSelection,
} from '@/lib/editor/delete-content'
import { CodeLanguageMenu } from '@/components/editor-toolbar/CodeLanguageMenu'
import { LINE_HEIGHTS, PARAGRAPH_SPACING } from '@/lib/editor/block-spacing'
import { FONT_SIZES, HIGHLIGHT_COLORS, TEXT_COLORS } from '@/lib/editor/font-size'
import { pickDocumentMediaFiles } from '@/lib/editor/image-utils'
import {
  insertBlockMath,
  insertDetailsBlock,
  insertInlineMath,
  insertLoremIpsum,
  insertMermaidDiagram,
  insertScannedBarcode,
  insertYoutubeVideo,
} from '@/lib/editor/insert-helpers'
import { insertBulletList, insertOrderedList, insertTaskList } from '@/lib/editor/list-commands'
import { PARAGRAPH_STYLES, applyParagraphStyle, type ParagraphStyleId } from '@/lib/editor/paragraph-styles'
import { promptAndApplyEditorLink } from '@/lib/editor/link-prompt'
import { isBarcodeScannerSupported } from '@/lib/barcode-scanner'
import { toast } from '@/lib/toast'
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

function lineHeightLabel(t: (key: string) => string, value: string, fallback: string) {
  if (value === '1.2') return t('toolbar.lineHeights.single')
  if (value === '2') return t('toolbar.lineHeights.double')
  return fallback
}

function spacingLabel(t: (key: string) => string, value: string) {
  const map: Record<string, string> = {
    '0px': 'toolbar.spacing.none',
    '6px': 'toolbar.spacing.small',
    '12px': 'toolbar.spacing.medium',
    '18px': 'toolbar.spacing.large',
    '24px': 'toolbar.spacing.extra',
  }
  return t(map[value] ?? 'toolbar.spacing.none')
}

export function ToolbarRibbon({ editor, onInsertImages }: ToolbarRibbonProps) {
  const { t } = useTranslation()
  const scannerAvailable = isBarcodeScannerSupported()
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      canUndo: safeEditorCanUndo(currentEditor),
      canRedo: safeEditorCanRedo(currentEditor),
      currentTextColor: (currentEditor.getAttributes('textStyle').color as string | undefined) ?? '',
      isCodeBlock: currentEditor.isActive('codeBlock'),
      codeLanguage: (currentEditor.getAttributes('codeBlock').language as string | null) ?? null,
      hasSelection: hasEditorSelection(currentEditor),
      canDeleteBlock: canDeleteCurrentBlock(currentEditor),
      blockDeleteLabel: getActiveBlockDeleteLabel(currentEditor),
      showInvisible: currentEditor.storage.invisibleCharacters.visibility(),
    }),
  })

  const currentFont = getCurrentFontFamilyLabel(editor, t)

  async function handlePickImage() {
    const files = await pickDocumentMediaFiles()
    if (files.length) await onInsertImages(files)
  }

  async function handleScanBarcode() {
    try {
      const inserted = await insertScannedBarcode(editor)
      if (inserted) toast.success(t('toasts.barcodeInserted'))
    } catch (error) {
      toast.error(t('toasts.barcodeScanError'), String(error))
    }
  }

  function setLink() {
    void promptAndApplyEditorLink(editor)
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

  return (
    <div className="editor-toolbar-shell" data-tour="editor-toolbar">
      <div className="editor-toolbar-ribbon">
        <ToolbarCluster className="toolbar-cluster--flat">
          <ToolbarButton
            label={t('toolbar.actions.undo')}
            disabled={!state.canUndo}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
          <ToolbarButton
            label={t('toolbar.actions.redo')}
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
          <ToolbarButton label={t('toolbar.actions.bold')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
          <ToolbarButton label={t('toolbar.actions.italic')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
          <ToolbarButton label={t('toolbar.actions.underline')} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <Underline className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
        </ToolbarCluster>

        <ToolbarSep />

        <ToolbarCluster className="toolbar-cluster--flat">
          <ToolbarButton label={t('toolbar.actions.bulletList')} active={editor.isActive('bulletList')} onClick={() => insertBulletList(editor)}>
            <List className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
          <ToolbarButton label={t('toolbar.actions.orderedList')} active={editor.isActive('orderedList')} onClick={() => insertOrderedList(editor)}>
            <ListOrdered className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
          <ToolbarButton label={t('toolbar.actions.taskList')} active={editor.isActive('taskList')} onClick={() => insertTaskList(editor)}>
            <CheckSquare className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
        </ToolbarCluster>

        <ToolbarSep />

        <ToolbarButton label={t('toolbar.actions.link')} active={editor.isActive('link')} onClick={setLink}>
          <Link2 className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-menu-trigger toolbar-menu-trigger--icon" title={t('toolbar.actions.insert')}>
              <PlusSquare className="h-4 w-4 stroke-[1.75]" />
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px]" onCloseAutoFocus={keepEditorSelectionFocus(editor)}>
            <DropdownMenuItem onClick={() => void handlePickImage()}>
              <ImagePlus className="h-4 w-4" />
              {t('toolbar.actions.image')}
            </DropdownMenuItem>
            {scannerAvailable && (
              <DropdownMenuItem onClick={() => void handleScanBarcode()}>
                <ScanLine className="h-4 w-4" />
                {t('toolbar.actions.scanBarcode')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
              <Table2 className="h-4 w-4" />
              {t('toolbar.actions.table')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void insertYoutubeVideo(editor)}>{t('toolbar.actions.youtubeVideo')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().insertTableOfContents().run()}>
              <ListTree className="h-4 w-4" />
              {t('toolbar.actions.tableOfContents')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().setPageBreak().run()}>
              {t('toolbar.actions.pageBreak')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void insertLoremIpsum(editor)}>
              <Type className="h-4 w-4" />
              {t('toolbar.actions.lorem')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void insertInlineMath(editor)}>{t('toolbar.actions.inlineMath')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void insertBlockMath(editor)}>{t('toolbar.actions.blockMath')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertMermaidDiagram(editor)}>{t('toolbar.actions.mermaid')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
              <Code className="h-4 w-4" />
              {t('toolbar.actions.codeBlock')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Smile className="h-4 w-4" />
                {t('toolbar.actions.emoji')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="emoji-picker-menu p-0">
                <EmojiPickerPanel editor={editor} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="toolbar-spacer" aria-hidden="true" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-btn" title={t('toolbar.actions.moreTools')}>
              <Ellipsis className="h-4 w-4 stroke-[1.75]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="editor-toolbar-more min-w-[240px]" onCloseAutoFocus={keepEditorSelectionFocus(editor)}>
            <p className="toolbar-section-menu-label">{t('toolbar.actions.moreFormatting')}</p>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleStrike().run()}>
              <Strikethrough className="h-4 w-4" />
              {t('toolbar.actions.strike')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleSuperscript().run()}>
              <Superscript className="h-4 w-4" />
              {t('toolbar.actions.superscript')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleSubscript().run()}>
              <Subscript className="h-4 w-4" />
              {t('toolbar.actions.subscript')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleCode().run()}>
              <Code className="h-4 w-4" />
              {t('toolbar.actions.inlineCode')}
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <p className="toolbar-section-menu-label">{t('toolbar.actions.alignment')}</p>
            <div className="toolbar-section-menu-row">
              <ToolbarButton label={t('toolbar.actions.alignLeft')} active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
                <AlignLeft className="h-4 w-4 stroke-[1.75]" />
              </ToolbarButton>
              <ToolbarButton label={t('toolbar.actions.alignCenter')} active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
                <AlignCenter className="h-4 w-4 stroke-[1.75]" />
              </ToolbarButton>
              <ToolbarButton label={t('toolbar.actions.alignRight')} active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
                <AlignRight className="h-4 w-4 stroke-[1.75]" />
              </ToolbarButton>
              <ToolbarButton label={t('toolbar.actions.alignJustify')} active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
                <AlignJustify className="h-4 w-4 stroke-[1.75]" />
              </ToolbarButton>
            </div>

            <DropdownMenuSeparator />
            <p className="toolbar-section-menu-label">{t('toolbar.actions.typography', { font: currentFont })}</p>
            {FONT_SIZES.map((size) => (
              <DropdownMenuItem key={size} onClick={() => editor.chain().focus().setFontSize(size).run()}>
                {size}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => editor.chain().focus().unsetFontSize().run()}>
              {t('toolbar.actions.resetFontSize')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <p className="toolbar-section-menu-label">{t('toolbar.actions.fontFamily')}</p>
            <FontFamilyMenuItems editor={editor} />

            <DropdownMenuSeparator />
            <p className="toolbar-section-menu-label">{t('toolbar.actions.textColor')}</p>
            <div className="editor-bubble-more-swatches px-1 py-1">
              <ColorSwatchGrid
                colors={TEXT_COLORS}
                activeValue={state.currentTextColor}
                onPick={(value) => {
                  if (!value) editor.chain().focus().unsetColor().run()
                  else editor.chain().focus().setColor(value).run()
                }}
              />
              <CustomColorPicker label="+" onPick={(value) => editor.chain().focus().setColor(value).run()} />
              <ToolbarButton label={t('common.reset')} onClick={() => editor.chain().focus().unsetColor().run()}>
                <Palette className="h-3.5 w-3.5" />
              </ToolbarButton>
            </div>
            <p className="toolbar-section-menu-label">{t('toolbar.actions.highlight')}</p>
            <div className="editor-bubble-more-swatches px-1 py-1">
              <ColorSwatchGrid
                colors={HIGHLIGHT_COLORS}
                onPick={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()}
              />
              <CustomColorPicker label="+" onPick={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()} />
              <ToolbarButton label={t('editorActions.deleteHighlight')} onClick={() => editor.chain().focus().unsetHighlight().run()}>
                <Highlighter className="h-3.5 w-3.5" />
              </ToolbarButton>
            </div>

            <DropdownMenuSeparator />
            <p className="toolbar-section-menu-label">{t('toolbar.actions.paragraphStyles')}</p>
            {PARAGRAPH_STYLES.map((style) => (
              <DropdownMenuItem key={style.id} onClick={() => applyParagraphStyle(editor, style.id)}>
                {t(`toolbar.paragraphStyles.${style.id as ParagraphStyleId}`)}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <p className="toolbar-section-menu-label">{t('toolbar.actions.lineHeight')}</p>
            {LINE_HEIGHTS.map((option) => (
              <DropdownMenuItem key={option.value} onClick={() => editor.chain().focus().setLineHeight(option.value).run()}>
                {lineHeightLabel(t, option.value, option.label)}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => editor.chain().focus().unsetLineHeight().run()}>
              {t('toolbar.actions.resetLineHeight')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <p className="toolbar-section-menu-label">{t('toolbar.actions.spaceAfter')}</p>
            {PARAGRAPH_SPACING.map((option) => (
              <DropdownMenuItem key={option.value} onClick={() => editor.chain().focus().setSpaceAfter(option.value).run()}>
                {spacingLabel(t, option.value)}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <Quote className="h-4 w-4" />
              {t('toolbar.actions.quote')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().setHorizontalRule().run()}>
              <Minus className="h-4 w-4" />
              {t('toolbar.actions.divider')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertDetailsBlock(editor)}>
              <ListChevronsDownUp className="h-4 w-4" />
              {t('toolbar.actions.detailsBlock')}
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleInvisibleCharacters().run()}>
              {state.showInvisible ? t('toolbar.actions.hideInvisible') : t('toolbar.actions.showInvisible')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!state.hasSelection} onClick={() => deleteEditorSelection(editor)}>
              {t('editorActions.deleteSelectedText')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!state.canDeleteBlock} onClick={() => deleteCurrentBlock(editor)}>
              {state.blockDeleteLabel ?? t('editorActions.deleteBlock')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
              {t('editorActions.clearFormatting')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-[var(--color-destructive)]"
              onClick={() => editor.chain().focus().clearContent().run()}
            >
              {t('editorActions.clearDocument')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {state.isCodeBlock && (
        <div className="editor-toolbar-context">
          <ToolbarButton
            label={t('toolbar.actions.codeBlock')}
            active
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <Code className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
          <CodeLanguageMenu editor={editor} language={state.codeLanguage} onSelect={setCodeLanguage} />
        </div>
      )}
    </div>
  )
}
