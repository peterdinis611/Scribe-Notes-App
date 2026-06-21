import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { ChevronDown, Code, FunctionSquare, ImagePlus, Play, Sigma, SplitSquareHorizontal, Table2, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ToolbarButton, ToolbarGroup } from '@/components/editor-toolbar/primitives'
import { CODE_LANGUAGES, getCodeLanguageLabel } from '@/lib/editor/code-languages'
import { deleteCurrentBlock } from '@/lib/editor/delete-content'
import { insertBlockMath, insertInlineMath, insertYoutubeVideo } from '@/lib/editor/insert-helpers'
import { pickImageFiles } from '@/lib/editor/image-utils'
import { cn } from '@/lib/utils'

type InsertTabProps = {
  editor: Editor
  onInsertImages: (files: File[]) => Promise<void>
}

export function InsertTab({ editor, onInsertImages }: InsertTabProps) {
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

  function insertTable() {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  return (
    <div className="toolbar-panel">
      <ToolbarGroup label="Média">
        <ToolbarButton label="Obrázok" onClick={() => void handlePickImage()}>
          <ImagePlus className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="YouTube" onClick={() => insertYoutubeVideo(editor)}>
          <Play className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Tabuľka" active={codeBlockState.isTable} onClick={insertTable}>
          <Table2 className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Zalomenie strany" onClick={() => editor.chain().focus().setPageBreak().run()}>
          <SplitSquareHorizontal className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label="Matematika">
        <ToolbarButton label="Vzorec v riadku (math.js)" onClick={() => insertInlineMath(editor)}>
          <FunctionSquare className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Vzorec blok (math.js)" onClick={() => insertBlockMath(editor)}>
          <Sigma className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label="Kód">
        <ToolbarButton
          label="Blok kódu"
          active={codeBlockState.isCodeBlock}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        {codeBlockState.isCodeBlock && (
          <ToolbarButton label="Odstrániť blok kódu" onClick={() => deleteCurrentBlock(editor)}>
            <Trash2 className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn('toolbar-select', codeBlockState.isCodeBlock && 'is-active')}
              title="Jazyk syntaxe"
            >
              <span>{getCodeLanguageLabel(codeBlockState.language)}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="code-lang-menu">
            {CODE_LANGUAGES.map(({ id, label }) => (
              <DropdownMenuItem
                key={id}
                className={cn((codeBlockState.language ?? 'auto') === id && 'is-selected')}
                onClick={() => setCodeLanguage(id)}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>

      {codeBlockState.isTable && (
        <ToolbarGroup label="Tabuľka">
          <ToolbarButton label="Pridať riadok" onClick={() => editor.chain().focus().addRowAfter().run()}>
            +R
          </ToolbarButton>
          <ToolbarButton label="Pridať stĺpec" onClick={() => editor.chain().focus().addColumnAfter().run()}>
            +S
          </ToolbarButton>
          <ToolbarButton label="Odstrániť tabuľku" onClick={() => editor.chain().focus().deleteTable().run()}>
            <Trash2 className="h-4 w-4 stroke-[1.75]" />
          </ToolbarButton>
        </ToolbarGroup>
      )}
    </div>
  )
}
