import { EditorBlockBubbleMenu } from '@/components/editor/EditorBlockBubbleMenu'
import { EditorDragHandle } from '@/components/editor/EditorDragHandle'
import { EditorFloatingMenu } from '@/components/editor/EditorFloatingMenu'
import { EditorTableBubbleMenu } from '@/components/editor/EditorTableBubbleMenu'
import { EditorTextBubbleMenu } from '@/components/editor/EditorTextBubbleMenu'

type EditorMenusProps = {
  editor: import('@tiptap/react').Editor | null
  onInsertImages: (files: File[]) => Promise<void>
  pageCount: number
  canvasRef: React.RefObject<HTMLDivElement | null>
}

export function EditorMenus({ editor, onInsertImages, pageCount, canvasRef }: EditorMenusProps) {
  if (!editor) return null

  return (
    <>
      <EditorDragHandle editor={editor} />
      <EditorTextBubbleMenu editor={editor} />
      <EditorTableBubbleMenu editor={editor} />
      <EditorBlockBubbleMenu editor={editor} pageCount={pageCount} canvasRef={canvasRef} />
      <EditorFloatingMenu editor={editor} onInsertImages={onInsertImages} />
    </>
  )
}
