import { TaggedError } from 'effect/Data'

export class EditorUnavailable extends TaggedError('EditorUnavailable')<{
  reason?: string
}> {}

export class MoveFailed extends TaggedError('MoveFailed')<{
  fromStart: number
  insertPos: number
}> {}

export class NoOpMove extends TaggedError('NoOpMove')<{
  fromStart: number
  insertPos: number
}> {}

export type BlockMoveError = MoveFailed | NoOpMove
