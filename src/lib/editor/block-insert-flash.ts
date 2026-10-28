import type { Editor } from '@tiptap/react'
import { getActiveBlockRange } from '@/lib/editor/block-move'
import { isEditorViewReady } from '@/lib/editor/view-ready'

const FLASH_CLASS = 'is-block-insert-flash'
const FLASH_MS = 420

function topLevelBlockElement(tiptap: HTMLElement, dom: Node): HTMLElement | null {
  let el = dom instanceof HTMLElement ? dom : dom.parentElement
  if (!el) return null

  if (el.closest('li')) {
    return el.closest('li')
  }

  while (el.parentElement && el.parentElement !== tiptap) {
    el = el.parentElement
  }

  return el
}

/** One-shot outline flash on the top-level block — never animate `.tiptap` itself. */
export function flashInsertedBlock(editor: Editor): void {
  requestAnimationFrame(() => {
    if (!isEditorViewReady(editor)) return
    const range = getActiveBlockRange(editor)
    if (!range) return
    const nodeDom = editor.view.nodeDOM(range.start)
    if (!nodeDom) return
    const el = topLevelBlockElement(editor.view.dom, nodeDom)
    if (!el) return

    el.classList.remove(FLASH_CLASS)
    // Force reflow so re-inserting the same class retriggers the animation.
    void el.offsetWidth
    el.classList.add(FLASH_CLASS)
    window.setTimeout(() => {
      el.classList.remove(FLASH_CLASS)
    }, FLASH_MS)
  })
}
