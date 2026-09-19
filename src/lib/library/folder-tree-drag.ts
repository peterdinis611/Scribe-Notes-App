import type { LibraryDragItem } from '@/lib/dnd/types'

export function isLibraryDragItem(value: unknown): value is LibraryDragItem {
  if (typeof value !== 'object' || value == null) return false
  const item = value as LibraryDragItem
  return (item.kind === 'document' || item.kind === 'folder') && typeof item.id === 'string' && item.id.length > 0
}
