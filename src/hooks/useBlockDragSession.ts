import { useCallback, useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import { pipe } from 'effect/Function'
import {
  cleanupDragArtifacts,
  resolveDragBlock,
  runBlockDragSession,
  type BlockDragTarget,
} from '@/lib/editor/block-drag'

type UseBlockDragSessionOptions = {
  onStart?: () => void
  onEnd?: () => void
}

export function useBlockDragSession(editor: Editor | null, options: UseBlockDragSessionOptions = {}) {
  const { onStart, onEnd } = options
  const fiberRef = useRef<Fiber.RuntimeFiber<void, never> | null>(null)
  const onEndRef = useRef(onEnd)
  const onStartRef = useRef(onStart)

  useEffect(() => {
    onEndRef.current = onEnd
    onStartRef.current = onStart
  }, [onEnd, onStart])

  useEffect(() => {
    return () => {
      const fiber = fiberRef.current
      if (fiber) {
        pipe(Fiber.interrupt(fiber), Effect.runFork)
        fiberRef.current = null
      }
      cleanupDragArtifacts()
    }
  }, [editor])

  const beginDrag = useCallback(
    (fallbackBlock: BlockDragTarget, event: PointerEvent) => {
      if (!editor || editor.isDestroyed || event.button !== 0) return

      event.preventDefault()
      event.stopPropagation()

      const activeFiber = fiberRef.current
      if (activeFiber) {
        pipe(Fiber.interrupt(activeFiber), Effect.runFork)
        fiberRef.current = null
      }

      onStartRef.current?.()

      const program = pipe(
        resolveDragBlock(editor, fallbackBlock, {
          x: event.clientX,
          y: event.clientY,
        }),
        Effect.map((block) => ({
          ...block,
          end: block.range.end,
        })),
        Effect.flatMap((block) =>
          runBlockDragSession(editor, block, {
            x: event.clientX,
            y: event.clientY,
          }),
        ),
        Effect.ensuring(Effect.sync(() => {
          fiberRef.current = null
          onEndRef.current?.()
        })),
      )

      fiberRef.current = pipe(program, Effect.runFork)
    },
    [editor],
  )

  return { beginDrag }
}
