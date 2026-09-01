import type { RefObject } from 'react'
import type { Editor } from '@tiptap/react'
import type { AppDispatch } from '@/store/index'
import { focusOutlineItem, type DocumentOutlineItem } from '@/lib/editor/document-outline'
import { setOutlineReturnPoint } from '@/store/documentsSlice'

/** Jump to an outline item and remember scroll position for “back to place”. */
export function jumpToOutlineItem(
  editor: Editor,
  scrollRef: RefObject<HTMLElement | null>,
  item: DocumentOutlineItem,
  activeDocumentId: string | null,
  dispatch: AppDispatch,
) {
  const scrollEl = scrollRef.current
  if (scrollEl && activeDocumentId) {
    dispatch(
      setOutlineReturnPoint({
        docId: activeDocumentId,
        scrollTop: scrollEl.scrollTop,
      }),
    )
  }
  focusOutlineItem(editor, item)
}
