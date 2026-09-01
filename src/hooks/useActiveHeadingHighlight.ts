import { useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import type { DocumentOutlineItem } from '@/lib/editor/document-outline'

/** Marks the scroll-active heading in the editor DOM. */
export function useActiveHeadingHighlight(
  editor: Editor | null,
  activeHeading: DocumentOutlineItem | null,
  enabled = true,
) {
  useEffect(() => {
    if (!editor || editor.isDestroyed || !enabled) return

    const root = editor.view.dom
    const clear = () => {
      root.querySelectorAll('[data-active-heading]').forEach((node) => {
        node.removeAttribute('data-active-heading')
      })
    }

    clear()
    if (!activeHeading) return

    const dom = editor.view.nodeDOM(activeHeading.pos)
    const element =
      dom instanceof HTMLElement ? dom : dom?.parentElement instanceof HTMLElement ? dom.parentElement : null
    element?.setAttribute('data-active-heading', 'true')

    return clear
  }, [activeHeading, editor, enabled])
}
