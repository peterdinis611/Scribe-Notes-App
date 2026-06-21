import type { Editor } from '@tiptap/react'
import { ToolbarRibbon } from '@/components/editor-toolbar/ToolbarRibbon'

interface EditorToolbarProps {
  editor: Editor | null
  onInsertImages: (files: File[]) => Promise<void>
}

export function EditorToolbar({ editor, onInsertImages }: EditorToolbarProps) {
  if (!editor) return null

  return (
    <div className="editor-toolbar titlebar-no-drag">
      <ToolbarRibbon editor={editor} onInsertImages={onInsertImages} />
    </div>
  )
}
