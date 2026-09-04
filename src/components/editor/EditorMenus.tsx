import { EditorBlockBubbleMenu } from '@/components/editor/EditorBlockBubbleMenu'
import { EditorDragHandle } from '@/components/editor/EditorDragHandle'
import { EditorFloatingMenu } from '@/components/editor/EditorFloatingMenu'
import { EditorTableBubbleMenu } from '@/components/editor/EditorTableBubbleMenu'
import { EditorTextBubbleMenu } from '@/components/editor/EditorTextBubbleMenu'
import { useAppSelector } from '@/store/hooks'

type EditorMenusProps = {
  editor: import('@tiptap/react').Editor | null
  onInsertImages: (files: File[]) => Promise<void>
}

export function EditorMenus({ editor, onInsertImages }: EditorMenusProps) {
  const printLayoutEnabled = useAppSelector((state) => state.settings.printLayoutEnabled)

  if (!editor) return null

  return (
    <>
      {!printLayoutEnabled && <EditorDragHandle editor={editor} />}
      <EditorTextBubbleMenu editor={editor} />
      <EditorTableBubbleMenu editor={editor} />
      <EditorBlockBubbleMenu editor={editor} />
      <EditorFloatingMenu
        editor={editor}
        onInsertImages={onInsertImages}
        hideWhenPrintEmpty={printLayoutEnabled}
      />
    </>
  )
}
