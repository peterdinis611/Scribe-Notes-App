export const DOCUMENT_DRAG_TYPE = 'application/x-scribe-document'
export const FOLDER_DRAG_TYPE = 'application/x-scribe-folder'

function hasDragType(event: React.DragEvent, type: string) {
  return Array.from(event.dataTransfer.types).includes(type)
}

export function setDocumentDragData(event: React.DragEvent, documentId: string) {
  event.dataTransfer.clearData()
  event.dataTransfer.setData(DOCUMENT_DRAG_TYPE, documentId)
  // WebKit/Tauri sometimes only exposes text/plain on drop.
  event.dataTransfer.setData('text/plain', documentId)
  event.dataTransfer.effectAllowed = 'move'
}

export function setFolderDragData(event: React.DragEvent, folderId: string) {
  event.dataTransfer.clearData()
  event.dataTransfer.setData(FOLDER_DRAG_TYPE, folderId)
  event.dataTransfer.setData('text/plain', folderId)
  event.dataTransfer.effectAllowed = 'move'
}

export function readDocumentDragId(event: React.DragEvent): string | null {
  if (!hasDragType(event, DOCUMENT_DRAG_TYPE)) return null
  return event.dataTransfer.getData(DOCUMENT_DRAG_TYPE) || event.dataTransfer.getData('text/plain') || null
}

export function readFolderDragId(event: React.DragEvent): string | null {
  if (!hasDragType(event, FOLDER_DRAG_TYPE)) return null
  return event.dataTransfer.getData(FOLDER_DRAG_TYPE) || event.dataTransfer.getData('text/plain') || null
}
