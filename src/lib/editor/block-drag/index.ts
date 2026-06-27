export { cleanupDragArtifacts, createDragGhost, createDropIndicator, hideDropIndicator, positionDragGhost, positionDropIndicator } from '@/lib/editor/block-drag/artifacts'
export {
  findBlockFromCoords,
  findBlockFromSelection,
  getDropTargetFromCoords,
  moveBlock,
  resolveDragBlock,
  tryMoveBlock,
} from '@/lib/editor/block-drag/domain'
export { EditorUnavailable, MoveFailed, NoOpMove, type BlockMoveError } from '@/lib/editor/block-drag/errors'
export { runBlockDragSession } from '@/lib/editor/block-drag/session'
export { runBoolean, runOption, runVoid } from '@/lib/editor/block-drag/runtime'
export type { BlockBounds, BlockDragTarget, DropTarget, PointerCoords } from '@/lib/editor/block-drag/types'
