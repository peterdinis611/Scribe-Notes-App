import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { GripVertical, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cleanupDragArtifacts, findBlockFromCoords, findBlockFromSelection, type BlockDragTarget } from '@/lib/editor/block-drag-handle'
import { deleteHandleTarget, getHandleDeleteLabel } from '@/lib/editor/delete-content'
import { getEditorViewDom } from '@/lib/editor/view-ready'
import { useBlockDragSession } from '@/hooks/useBlockDragSession'
import { cn } from '@/lib/utils'

type EditorDragHandleProps = {
  editor: Editor | null
}

const HANDLE_HIT_PADDING = 18
const HIDE_DELAY_MS = 280

export function EditorDragHandle({ editor }: EditorDragHandleProps) {
  const { t } = useTranslation()
  const handleRef = useRef<HTMLButtonElement>(null)
  const clusterRef = useRef<HTMLDivElement>(null)
  const blockRef = useRef<BlockDragTarget | null>(null)
  const pinnedBlockRef = useRef<BlockDragTarget | null>(null)
  const draggingRef = useRef(false)
  const overHandleRef = useRef(false)
  const hideTimerRef = useRef<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const [handleVisible, setHandleVisible] = useState(false)
  const [handleActive, setHandleActive] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [deleteLabel, setDeleteLabel] = useState<string | null>(null)
  const [clusterHovered, setClusterHovered] = useState(false)
  const [handleStyle, setHandleStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const { beginDrag } = useBlockDragSession(editor, {
    onStart: () => {
      draggingRef.current = true
      setIsDragging(true)
      setHandleVisible(false)
      setClusterHovered(false)
      blockRef.current?.dom.classList.remove('is-block-drag-hover')
    },
    onEnd: () => {
      draggingRef.current = false
      setIsDragging(false)
      setHandleVisible(false)
    },
  })

  useEffect(() => {
    setMounted(true)
    return () => {
      cleanupDragArtifacts()
    }
  }, [])

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const clearHoverHighlight = useCallback(() => {
    if (draggingRef.current) return
    blockRef.current?.dom.classList.remove('is-block-drag-hover')
  }, [])

  const showHandleForBlock = useCallback((block: BlockDragTarget) => {
    if (draggingRef.current) return false

    if (block.dom.classList.contains('is-editor-empty')) {
      clearHoverHighlight()
      blockRef.current = null
      setDeleteLabel(null)
      setHandleVisible(false)
      return false
    }

    const rect = block.dom.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return false

    if (blockRef.current?.pos !== block.pos) {
      clearHoverHighlight()
    }

    blockRef.current = block
    block.dom.classList.add('is-block-drag-hover')
    setDeleteLabel(getHandleDeleteLabel(block.range.node.type.name))
    setHandleStyle({
      top: rect.top + Math.min(24, Math.max(8, rect.height * 0.12)),
      left: Math.max(8, rect.left - 28),
    })
    setHandleVisible(true)
    return true
  }, [clearHoverHighlight])

  const scheduleHide = useCallback(() => {
    if (draggingRef.current) return
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(() => {
      if (draggingRef.current || overHandleRef.current) return
      clearHoverHighlight()
      blockRef.current = null
      setDeleteLabel(null)
      setClusterHovered(false)
      setHandleVisible(false)
      setHandleActive(false)
    }, HIDE_DELAY_MS)
  }, [clearHideTimer, clearHoverHighlight])

  const isNearHandle = useCallback((x: number, y: number) => {
    const cluster = clusterRef.current
    if (!cluster || !handleVisible) return false

    const rect = cluster.getBoundingClientRect()
    return (
      x >= rect.left - HANDLE_HIT_PADDING &&
      x <= rect.right + HANDLE_HIT_PADDING &&
      y >= rect.top - HANDLE_HIT_PADDING &&
      y <= rect.bottom + HANDLE_HIT_PADDING
    )
  }, [handleVisible])

  const syncPinnedBlock = useCallback(() => {
    if (!editor || editor.isDestroyed || draggingRef.current) return

    const block = findBlockFromSelection(editor)
    if (block) {
      pinnedBlockRef.current = block
      showHandleForBlock(block)
      clearHideTimer()
    }
  }, [editor, showHandleForBlock, clearHideTimer])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return

    let cleanup: (() => void) | undefined

    const attach = () => {
      const editorDom = getEditorViewDom(editor)
      if (!editorDom) return

      cleanup?.()

      const syncActiveBlock = (block: BlockDragTarget | null) => {
        if (!block) {
          scheduleHide()
          return
        }
        showHandleForBlock(block)
        clearHideTimer()
      }

      const onMouseMove = (event: MouseEvent) => {
        if (draggingRef.current) return

        if (isNearHandle(event.clientX, event.clientY) || clusterRef.current?.contains(event.target as Node)) {
          overHandleRef.current = true
          setClusterHovered(true)
          setHandleActive(true)
          clearHideTimer()
          return
        }

        overHandleRef.current = false
        setClusterHovered(false)

        if (editorDom.contains(event.target as Node)) {
          const block = findBlockFromCoords(editor, event.clientX, event.clientY)
          if (block) {
            setHandleActive(true)
            syncActiveBlock(block)
            return
          }
        }

        if (pinnedBlockRef.current && editor.isFocused) {
          setHandleActive(false)
          setClusterHovered(false)
          syncActiveBlock(pinnedBlockRef.current)
          return
        }

        scheduleHide()
      }

      const onScroll = () => {
        if (draggingRef.current) return
        const block = blockRef.current ?? pinnedBlockRef.current
        if (block) showHandleForBlock(block)
      }

      const onFocus = () => {
        clearHideTimer()
        syncPinnedBlock()
      }

      const onBlur = () => {
        overHandleRef.current = false
        scheduleHide()
      }

      const onSelectionUpdate = () => {
        syncPinnedBlock()
      }

      const onUpdate = () => {
        syncPinnedBlock()
      }

      document.addEventListener('mousemove', onMouseMove)
      window.addEventListener('scroll', onScroll, true)
      window.addEventListener('resize', onScroll)
      editorDom.addEventListener('scroll', onScroll)
      editor.on('focus', onFocus)
      editor.on('blur', onBlur)
      editor.on('selectionUpdate', onSelectionUpdate)
      editor.on('update', onUpdate)

      syncPinnedBlock()

      cleanup = () => {
        document.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('scroll', onScroll, true)
        window.removeEventListener('resize', onScroll)
        editorDom.removeEventListener('scroll', onScroll)
        editor.off('focus', onFocus)
        editor.off('blur', onBlur)
        editor.off('selectionUpdate', onSelectionUpdate)
        editor.off('update', onUpdate)
      }
    }

    const detach = () => {
      cleanup?.()
      cleanup = undefined
      clearHoverHighlight()
    }

    attach()
    editor.on('create', attach)
    editor.on('mount', attach)
    editor.on('unmount', detach)
    editor.on('destroy', detach)

    return () => {
      editor.off('create', attach)
      editor.off('mount', attach)
      editor.off('unmount', detach)
      editor.off('destroy', detach)
      detach()
      clearHideTimer()
    }
  }, [editor, clearHideTimer, clearHoverHighlight, isNearHandle, scheduleHide, showHandleForBlock, syncPinnedBlock])

  useEffect(() => {
    const handle = handleRef.current
    if (!editor || !handle || !mounted) return

    const onPointerDown = (event: PointerEvent) => {
      const block = blockRef.current ?? pinnedBlockRef.current
      if (!block) return
      beginDrag(block, event)
      queueMicrotask(() => syncPinnedBlock())
    }

    handle.addEventListener('pointerdown', onPointerDown)
    return () => handle.removeEventListener('pointerdown', onPointerDown)
  }, [editor, beginDrag, mounted, syncPinnedBlock])

  function handleDeleteBlock() {
    const block = blockRef.current ?? pinnedBlockRef.current
    if (!editor || !block) return
    deleteHandleTarget(editor, block.range.start, block.range.end, block.range.node.type.name)
  }

  if (!mounted) return null

  return createPortal(
    <div
      ref={clusterRef}
      className={cn(
        'editor-block-controls titlebar-no-drag',
        handleActive && 'is-active',
        clusterHovered && 'is-expanded',
        Boolean(deleteLabel) && 'has-delete',
      )}
      style={{
        position: 'fixed',
        top: handleStyle.top,
        left: handleStyle.left,
        opacity: handleVisible && !isDragging ? 1 : 0,
        pointerEvents: handleVisible && !isDragging ? 'auto' : 'none',
        zIndex: 60,
      }}
      aria-hidden={!handleVisible}
      onMouseEnter={() => {
        overHandleRef.current = true
        setClusterHovered(true)
        setHandleActive(true)
        clearHideTimer()
      }}
      onMouseLeave={() => {
        overHandleRef.current = false
        setClusterHovered(false)
        setHandleActive(false)
      }}
    >
      <button
        ref={handleRef}
        type="button"
        className={cn('editor-block-drag-handle', handleActive && 'is-active')}
        aria-label={t('editorActions.moveBlock')}
        title={t('editorActions.moveBlockHint')}
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {deleteLabel && (
        <button
          type="button"
          className="editor-block-delete-handle"
          aria-label={deleteLabel}
          title={deleteLabel}
          tabIndex={clusterHovered ? 0 : -1}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            handleDeleteBlock()
          }}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>,
    document.body,
  )
}
