import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { GripVertical } from 'lucide-react'
import { findBlockFromCoords, startBlockDrag } from '@/lib/editor/block-drag-handle'

type EditorDragHandleProps = {
  editor: Editor | null
}

export function EditorDragHandle({ editor }: EditorDragHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null)
  const blockRef = useRef<{ pos: number; dom: HTMLElement } | null>(null)
  const draggingRef = useRef(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return

    const handle = handleRef.current
    if (!handle) return

    handle.draggable = true

    const hide = () => {
      handle.style.visibility = 'hidden'
      blockRef.current = null
    }

    const reposition = () => {
      if (!blockRef.current || draggingRef.current) return

      const { dom } = blockRef.current
      const rect = dom.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        hide()
        return
      }

      handle.style.visibility = 'visible'
      handle.style.position = 'fixed'
      handle.style.top = `${rect.top + Math.min(24, Math.max(8, rect.height * 0.15))}px`
      handle.style.left = `${Math.max(8, rect.left - 30)}px`
    }

    const onMouseMove = (event: MouseEvent) => {
      if (draggingRef.current) return

      const target = event.target as Node
      if (handle.contains(target)) return

      const editorDom = editor.view.dom
      if (!editorDom.contains(target)) {
        hide()
        return
      }

      const block = findBlockFromCoords(editor, event.clientX, event.clientY)
      if (!block) {
        hide()
        return
      }

      blockRef.current = block
      reposition()
    }

    const onDragStart = (event: DragEvent) => {
      if (!blockRef.current) {
        event.preventDefault()
        return
      }

      draggingRef.current = true
      handle.dataset.dragging = 'true'
      if (!startBlockDrag(editor, event, blockRef.current.pos)) {
        event.preventDefault()
        draggingRef.current = false
        handle.dataset.dragging = 'false'
      }
    }

    const onDragEnd = () => {
      draggingRef.current = false
      handle.dataset.dragging = 'false'
      hide()
    }

    document.addEventListener('mousemove', onMouseMove)
    handle.addEventListener('dragstart', onDragStart)
    handle.addEventListener('dragend', onDragEnd)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)

    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      handle.removeEventListener('dragstart', onDragStart)
      handle.removeEventListener('dragend', onDragEnd)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      hide()
    }
  }, [editor])

  if (!mounted) return null

  return createPortal(
    <div
      ref={handleRef}
      className="editor-block-drag-handle titlebar-no-drag"
      style={{ visibility: 'hidden', position: 'fixed', zIndex: 60 }}
      title="Presunúť blok"
    >
      <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
    </div>,
    document.body,
  )
}
