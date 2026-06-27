import type { Editor } from '@tiptap/react'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import { pipe } from 'effect/Function'
import {
  cleanupDragArtifacts,
  createDragGhost,
  createDropIndicator,
  hideDropIndicator,
  positionDragGhost,
  positionDropIndicator,
} from '@/lib/editor/block-drag/artifacts'
import { getDropTargetFromCoords, tryMoveBlock } from '@/lib/editor/block-drag/domain'
import type { BlockDragTarget, PointerCoords } from '@/lib/editor/block-drag/types'

const updateDropIndicator = (
  editor: Editor,
  block: BlockDragTarget,
  indicator: HTMLElement,
  coords: PointerCoords,
) =>
  pipe(
    getDropTargetFromCoords(editor, coords.x, coords.y, {
      start: block.pos,
      end: block.end,
    }),
    Effect.map((target) => {
      if (Option.isSome(target)) {
        positionDropIndicator(indicator, target.value)
      } else {
        hideDropIndicator(indicator)
      }
    }),
  )

const finishDrop = (editor: Editor, block: BlockDragTarget, coords: PointerCoords) =>
  pipe(
    getDropTargetFromCoords(editor, coords.x, coords.y, {
      start: block.pos,
      end: block.end,
    }),
    Effect.flatMap((target) =>
      Option.isSome(target)
        ? tryMoveBlock(editor, block.pos, target.value.insertPos)
        : Effect.void,
    ),
  )

export const runBlockDragSession = (
  editor: Editor,
  block: BlockDragTarget,
  start: PointerCoords,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.sync(() => cleanupDragArtifacts())

    const ghost = createDragGhost(block.range)
    const indicator = createDropIndicator()

    yield* Effect.sync(() => {
      block.dom.classList.add('is-block-drag-source')
      document.body.classList.add('is-block-dragging')
      positionDragGhost(ghost, start.x, start.y)
    })

    yield* Effect.async<void>((resume) => {
      const onMove = (event: PointerEvent) => {
        positionDragGhost(ghost, event.clientX, event.clientY)
        pipe(
          updateDropIndicator(editor, block, indicator, {
            x: event.clientX,
            y: event.clientY,
          }),
          Effect.runSync,
        )
      }

      const onFinish = (event: PointerEvent) => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onFinish)
        window.removeEventListener('pointercancel', onFinish)

        pipe(
          finishDrop(editor, block, { x: event.clientX, y: event.clientY }),
          Effect.runSync,
        )

        resume(Effect.void)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onFinish)
      window.addEventListener('pointercancel', onFinish)

      return Effect.sync(() => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onFinish)
        window.removeEventListener('pointercancel', onFinish)
      })
    })
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        cleanupDragArtifacts()
      }),
    ),
  )
