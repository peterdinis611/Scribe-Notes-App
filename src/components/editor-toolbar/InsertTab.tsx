import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { ArrowDownAZ, ArrowUpAZ, Code, FunctionSquare, GitBranch, ImagePlus, Play, ScanLine, Sigma, SplitSquareHorizontal, Table2, TextQuote, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CodeLanguageMenu } from '@/components/editor-toolbar/CodeLanguageMenu'
import { ToolbarButton, ToolbarGroup } from '@/components/editor-toolbar/primitives'
import { deleteCurrentBlock } from '@/lib/editor/delete-content'
import { insertBlockMath, insertInlineMath, insertLoremIpsum, insertMermaidDiagram, insertScannedBarcode, insertYoutubeVideo } from '@/lib/editor/insert-helpers'
import { pickImageFiles } from '@/lib/editor/image-utils'
import {
  fillDownActiveColumn,
  insertColumnTotalBelow,
  sortTableByActiveColumn,
} from '@/lib/editor/table-commands'
import { isBarcodeScannerSupported } from '@/lib/barcode-scanner'
import { toast } from '@/lib/toast'

type InsertTabProps = {
  editor: Editor
  onInsertImages: (files: File[]) => Promise<void>
}

export function InsertTab({ editor, onInsertImages }: InsertTabProps) {
  const { t } = useTranslation()
  const scannerAvailable = isBarcodeScannerSupported()
  const codeBlockState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      isCodeBlock: currentEditor.isActive('codeBlock'),
      language: (currentEditor.getAttributes('codeBlock').language as string | null) ?? null,
      isTable: currentEditor.isActive('table'),
    }),
  })

  function setCodeLanguage(language: string) {
    const attrs = language === 'auto' ? { language: null } : { language }

    if (codeBlockState.isCodeBlock) {
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

  async function handleScanBarcode() {
    try {
      const inserted = await insertScannedBarcode(editor)
      if (inserted) toast.success(t('toasts.barcodeInserted'))
    } catch (error) {
      toast.error(t('toasts.barcodeScanError'), String(error))
    }
  }

  function insertTable() {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  return (
    <div className="toolbar-panel">
      <ToolbarGroup label={t('toolbar.groups.media')}>
        <ToolbarButton label={t('toolbar.actions.image')} onClick={() => void handlePickImage()}>
          <ImagePlus className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label={t('toolbar.actions.youtube')} onClick={() => insertYoutubeVideo(editor)}>
          <Play className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        {scannerAvailable && (
          <ToolbarButton label={t('toolbar.actions.scanBarcode')} onClick={() => void handleScanBarcode()}>
            <ScanLine className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
        )}
        <ToolbarButton label={t('toolbar.actions.table')} active={codeBlockState.isTable} onClick={insertTable}>
          <Table2 className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label={t('toolbar.actions.pageBreak')} onClick={() => editor.chain().focus().setPageBreak().run()}>
          <SplitSquareHorizontal className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label={t('toolbar.actions.lorem')} onClick={() => void insertLoremIpsum(editor)}>
          <TextQuote className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label={t('toolbar.groups.math')}>
        <ToolbarButton label={t('toolbar.actions.inlineMathFull')} onClick={() => insertInlineMath(editor)}>
          <FunctionSquare className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label={t('toolbar.actions.blockMathFull')} onClick={() => insertBlockMath(editor)}>
          <Sigma className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label={t('toolbar.actions.mermaid')} onClick={() => insertMermaidDiagram(editor)}>
          <GitBranch className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label={t('toolbar.groups.code')}>
        <ToolbarButton
          label={t('toolbar.actions.codeBlock')}
          active={codeBlockState.isCodeBlock}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        {codeBlockState.isCodeBlock && (
          <ToolbarButton label={t('editorActions.deleteCodeBlock')} onClick={() => deleteCurrentBlock(editor)}>
            <Trash2 className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
        )}
        <CodeLanguageMenu
          language={codeBlockState.language}
          onSelect={setCodeLanguage}
          triggerClassName={codeBlockState.isCodeBlock ? 'is-active' : undefined}
        />
      </ToolbarGroup>

      {codeBlockState.isTable && (
        <ToolbarGroup label={t('toolbar.groups.table')}>
          <ToolbarButton label={t('toolbar.actions.addRow')} onClick={() => editor.chain().focus().addRowAfter().run()}>
            +R
          </ToolbarButton>
          <ToolbarButton label={t('toolbar.actions.addColumn')} onClick={() => editor.chain().focus().addColumnAfter().run()}>
            +S
          </ToolbarButton>
          <ToolbarButton
            label={t('toolbar.actions.sortAsc')}
            onClick={() => {
              if (!sortTableByActiveColumn(editor, 'asc')) toast.info(t('toolbar.table.needColumn'))
            }}
          >
            <ArrowDownAZ className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
          <ToolbarButton
            label={t('toolbar.actions.sortDesc')}
            onClick={() => {
              if (!sortTableByActiveColumn(editor, 'desc')) toast.info(t('toolbar.table.needColumn'))
            }}
          >
            <ArrowUpAZ className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
          <ToolbarButton
            label={t('toolbar.actions.fillDown')}
            onClick={() => {
              if (!fillDownActiveColumn(editor)) toast.info(t('toolbar.table.fillEmpty'))
            }}
          >
            ↓=
          </ToolbarButton>
          <ToolbarButton
            label={t('toolbar.actions.sumColumn')}
            onClick={() => {
              if (!insertColumnTotalBelow(editor)) toast.info(t('toolbar.table.needNumbers'))
            }}
          >
            Σ
          </ToolbarButton>
          <ToolbarButton label={t('editorActions.deleteTable')} onClick={() => editor.chain().focus().deleteTable().run()}>
            <Trash2 className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
        </ToolbarGroup>
      )}
    </div>
  )
}
