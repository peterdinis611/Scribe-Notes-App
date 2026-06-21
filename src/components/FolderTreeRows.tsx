import { memo } from 'react'
import { ChevronRight, FileText, Folder, FolderPlus, Trash2 } from 'lucide-react'
import { MoveToFolderMenu } from '@/components/MoveToFolderMenu'
import { DocumentTitleField } from '@/components/DocumentTitleField'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { DocumentSummary, Folder as FolderType } from '@/lib/db/api'

type FolderTreeFolderRowProps = {
  folder: FolderType
  depth: number
  isExpanded: boolean
  isDragOver: boolean
  onToggle: (id: string) => void
  onRename: (id: string, name: string) => void
  onCreateChild: (parentId: string) => void
  onDelete: (id: string, name: string, event: React.MouseEvent) => void
  onDragStart: (id: string, event: React.DragEvent) => void
  onDragOver: (id: string, event: React.DragEvent) => void
  onDragLeave: (id: string) => void
  onDrop: (folderId: string, event: React.DragEvent) => void
}

export const FolderTreeFolderRow = memo(function FolderTreeFolderRow({
  folder,
  depth,
  isExpanded,
  isDragOver,
  onToggle,
  onRename,
  onCreateChild,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: FolderTreeFolderRowProps) {
  return (
    <div
      className={cn('folder-tree-row titlebar-no-drag', isDragOver && 'is-drag-over')}
      style={{ paddingLeft: 8 + depth * 14 }}
      draggable
      onDragStart={(event) => onDragStart(folder.id, event)}
      onDragOver={(event) => onDragOver(folder.id, event)}
      onDragLeave={() => onDragLeave(folder.id)}
      onDrop={(event) => onDrop(folder.id, event)}
    >
      <button type="button" className="folder-tree-toggle" onClick={() => onToggle(folder.id)}>
        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')} />
      </button>
      <Folder className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
      <button
        type="button"
        className="folder-tree-name"
        onClick={() => onToggle(folder.id)}
        onDoubleClick={() => onRename(folder.id, folder.name)}
      >
        {folder.name}
      </button>
      <button
        type="button"
        className="folder-tree-action"
        title="Nový podpriečinok"
        onClick={() => onCreateChild(folder.id)}
      >
        <FolderPlus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="folder-tree-action folder-tree-action--danger"
        onClick={(event) => onDelete(folder.id, folder.name, event)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
})

type FolderTreeDocumentRowProps = {
  document: DocumentSummary
  depth: number
  isActive: boolean
  onOpen: (id: string) => void
  onDelete: (id: string, event: React.MouseEvent) => void
  onDragStart: (id: string, event: React.DragEvent) => void
}

export const FolderTreeDocumentRow = memo(function FolderTreeDocumentRow({
  document,
  depth,
  isActive,
  onOpen,
  onDelete,
  onDragStart,
}: FolderTreeDocumentRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(event) => onDragStart(document.id, event)}
      onClick={() => onOpen(document.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(document.id)
        }
      }}
      className={cn('doc-item group titlebar-no-drag', isActive && 'is-active')}
      style={{ paddingLeft: 12 + depth * 14 }}
    >
      <div className="doc-item-icon">
        <FileText className="h-4 w-4 stroke-[1.5]" />
      </div>
      <div className="min-w-0 flex-1">
        <DocumentTitleField documentId={document.id} title={document.title} variant="sidebar" />
        <p className="doc-item-meta">{formatRelativeTime(document.updatedAt)}</p>
      </div>
      <MoveToFolderMenu documentId={document.id} folderId={document.folderId} />
      <button
        type="button"
        className="doc-item-delete"
        onClick={(event) => onDelete(document.id, event)}
        aria-label="Vymazať"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
})
