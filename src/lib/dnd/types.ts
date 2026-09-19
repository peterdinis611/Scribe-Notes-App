export const LIBRARY_DND_TYPE = 'scribe-library'
export const TAB_DND_TYPE = 'scribe-tab'

export type LibraryDragItem =
  | { kind: 'document'; id: string }
  | { kind: 'folder'; id: string }

export type TabDragItem = {
  id: string
  pinned: boolean
}
