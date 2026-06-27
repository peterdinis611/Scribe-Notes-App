import type { Editor } from '@tiptap/react'
import {
  cleanupDragArtifacts,
  createDragGhost,
  createDropIndicator,
  findBlockFromCoords as findBlockFromCoordsEffect,
  findBlockFromSelection as findBlockFromSelectionEffect,
  getDropTargetFromCoords as getDropTargetFromCoordsEffect,
  hideDropIndicator,
  moveBlock,
  positionDragGhost,
  positionDropIndicator,
  runBoolean,
  runOption,
  type BlockDragTarget,
  type DropTarget,
} from '@/lib/editor/block-drag'

export type { BlockDragTarget, DropTarget } from '@/lib/editor/block-drag'

export function findBlockFromSelection(editor: Editor): BlockDragTarget | null {
  return runOption(findBlockFromSelectionEffect(editor))
}

export function findBlockFromCoords(editor: Editor, x: number, y: number): BlockDragTarget | null {
  return runOption(findBlockFromCoordsEffect(editor, x, y))
}

export function getDropTargetFromCoords(
  editor: Editor,
  x: number,
  y: number,
  exclude?: { start: number; end: number },
): DropTarget | null {
  return runOption(getDropTargetFromCoordsEffect(editor, x, y, exclude))
}

export function moveBlockToPosition(editor: Editor, fromStart: number, insertPos: number): boolean {
  return runBoolean(moveBlock(editor, fromStart, insertPos))
}

export {
  cleanupDragArtifacts,
  createDragGhost,
  createDropIndicator,
  hideDropIndicator,
  positionDragGhost,
  positionDropIndicator,
}
