import { FloatingMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { CheckSquare, Heading2, ImagePlus, List, Table2 } from 'lucide-react'
import { pickImageFiles } from '@/lib/editor/image-utils'

type EditorFloatingMenuProps = {
  editor: Editor | null
  onInsertImages: (files: File[]) => Promise<void>
}

export function EditorFloatingMenu({ editor, onInsertImages }: EditorFloatingMenuProps) {
  if (!editor) return null

  async function handlePickImage() {
    const files = await pickImageFiles()
    if (files.length) await onInsertImages(files)
  }

  return (
    <FloatingMenu
      editor={editor}
      className="editor-floating-menu titlebar-no-drag"
      shouldShow={({ editor: currentEditor, state }) => {
        const { $from } = state.selection
        const isEmptyTextblock = $from.parent.isTextblock && $from.parent.textContent.length === 0
        return isEmptyTextblock && currentEditor.isEditable && !currentEditor.isActive('table')
      }}
    >
      <button type="button" className="editor-floating-btn" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-4 w-4" />
        Nadpis
      </button>
      <button type="button" className="editor-floating-btn" onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-4 w-4" />
        Zoznam
      </button>
      <button type="button" className="editor-floating-btn" onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <CheckSquare className="h-4 w-4" />
        Úlohy
      </button>
      <button type="button" className="editor-floating-btn" onClick={() => void handlePickImage()}>
        <ImagePlus className="h-4 w-4" />
        Obrázok
      </button>
      <button
        type="button"
        className="editor-floating-btn"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <Table2 className="h-4 w-4" />
        Tabuľka
      </button>
    </FloatingMenu>
  )
}
