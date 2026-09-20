import { EditorDragHandle } from '@/components/editor/EditorDragHandle'
import { EditorFloatingMenu } from '@/components/editor/EditorFloatingMenu'
import { EditorTableBubbleMenu } from '@/components/editor/EditorTableBubbleMenu'
import { EditorTextBubbleMenu } from '@/components/editor/EditorTextBubbleMenu'
import { WikiGhostHint } from '@/components/editor/WikiGhostHint'

type EditorMenusProps = {
  editor: import('@tiptap/react').Editor | null
}

export function EditorMenus({ editor }: EditorMenusProps) {
  if (!editor) return null

  return (
    <>
      <EditorDragHandle editor={editor} />
      <EditorTextBubbleMenu editor={editor} />
      <EditorTableBubbleMenu editor={editor} />
      <EditorFloatingMenu editor={editor} />
      <WikiGhostHint editor={editor} />
    </>
  )
}
