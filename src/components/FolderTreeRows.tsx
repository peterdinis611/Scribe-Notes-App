import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, FileText, Folder, FolderMinus, FolderPlus, Star, Tag, Trash2 } from 'lucide-react'
import { MoveToFolderMenu } from '@/components/MoveToFolderMenu'
import { DocumentTitleField } from '@/components/DocumentTitleField'
import { Button } from '@/components/ui/button'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { DocumentSummary, Folder as FolderType } from '@/lib/db/api'

const treeActionClass =
  'inline-flex h-6 w-6 items-center justify-center rounded-md border-none bg-transparent text-[var(--color-muted-foreground)] opacity-0 transition-[opacity,background,color] group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]'

type FolderTreeFolderRowProps = {
  folder: FolderType
  depth: number
  documentCount: number
  isExpanded: boolean
  isDragOver: boolean
  onToggle: (id: string) => void
  onRename: (id: string, name: string) => void
  onCreateChild: (parentId: string) => void
  onTrashDocuments: (id: string, name: string, event: React.MouseEvent) => void
  onDelete: (id: string, name: string, event: React.MouseEvent) => void
  onDragStart: (id: string, event: React.DragEvent) => void
  onDragOver: (id: string, event: React.DragEvent) => void
  onDragLeave: (id: string) => void
  onDrop: (folderId: string, event: React.DragEvent) => void
}

export const FolderTreeFolderRow = memo(function FolderTreeFolderRow({
  folder,
  depth,
  documentCount,
  isExpanded,
  isDragOver,
  onToggle,
  onRename,
  onCreateChild,
  onTrashDocuments,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: FolderTreeFolderRowProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'group titlebar-no-drag mx-1 flex min-h-[28px] items-center gap-1 rounded-md pr-1 transition-colors hover:bg-[var(--color-hover)]',
        isDragOver && 'bg-[var(--color-selection)] outline outline-1 outline-dashed outline-[var(--color-accent)]',
      )}
      style={{ paddingLeft: 8 + depth * 14 }}
      draggable
      onDragStart={(event) => onDragStart(folder.id, event)}
      onDragOver={(event) => onDragOver(folder.id, event)}
      onDragLeave={() => onDragLeave(folder.id)}
      onDrop={(event) => onDrop(folder.id, event)}
    >
      <button type="button" className={cn(treeActionClass, 'opacity-100')} onClick={() => onToggle(folder.id)}>
        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')} />
      </button>
      <Folder className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
      <button
        type="button"
        className="min-w-0 flex-1 truncate border-none bg-transparent text-left text-[12px] font-semibold text-[var(--color-foreground)]"
        onClick={() => onToggle(folder.id)}
        onDoubleClick={() => onRename(folder.id, folder.name)}
      >
        {folder.name}
      </button>
      <button
        type="button"
        className={treeActionClass}
        title={t('library.newSubfolder')}
        onClick={() => onCreateChild(folder.id)}
      >
        <FolderPlus className="h-3.5 w-3.5" />
      </button>
      {documentCount > 0 && (
        <button
          type="button"
          className={treeActionClass}
          title={t('library.trashAllInFolder')}
          aria-label={t('library.trashAllInFolder')}
          onClick={(event) => onTrashDocuments(folder.id, folder.name, event)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        className={cn(treeActionClass, 'hover:text-[var(--color-destructive)]')}
        title={t('library.deleteFolder')}
        aria-label={t('library.deleteFolder')}
        onClick={(event) => onDelete(folder.id, folder.name, event)}
      >
        <FolderMinus className="h-3.5 w-3.5" />
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
  onToggleFavorite: (id: string, event: React.MouseEvent) => void
  onEditTags: (id: string, event: React.MouseEvent) => void
  onDragStart: (id: string, event: React.DragEvent) => void
}

export const FolderTreeDocumentRow = memo(function FolderTreeDocumentRow({
  document,
  depth,
  isActive,
  onOpen,
  onDelete,
  onToggleFavorite,
  onEditTags,
  onDragStart,
}: FolderTreeDocumentRowProps) {
  const { t } = useTranslation()

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
      className={cn(
        'group titlebar-no-drag relative mx-1 mb-px flex w-[calc(100%-8px)] cursor-default items-center gap-2 rounded-md border-none px-2 py-1 transition-colors hover:bg-[var(--color-hover)] active:cursor-grabbing',
        isActive && 'bg-[var(--color-selection)]',
      )}
      style={{ paddingLeft: 12 + depth * 14 }}
    >
      <FileText
        className={cn(
          'h-4 w-4 shrink-0 stroke-[1.5] text-[var(--color-muted-foreground)]',
          isActive && 'text-[var(--color-accent)]',
        )}
      />
      <div className="min-w-0 flex-1">
        <DocumentTitleField documentId={document.id} title={document.title} variant="sidebar" />
        <span
          className={cn(
            'mt-0.5 block text-[11px] text-[var(--color-muted-foreground)]',
            isActive && 'text-[color-mix(in_srgb,var(--color-accent)_70%,transparent)]',
          )}
        >
          {formatRelativeTime(document.updatedAt)}
          {document.tags.length > 0 && (
            <span className="opacity-70"> · {t('library.tagCount', { count: document.tags.length })}</span>
          )}
        </span>
      </div>

      {document.isFavorite && (
        <Star className="h-3.5 w-3.5 text-[var(--color-accent)] group-hover:opacity-0" aria-hidden="true" />
      )}

      <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', document.isFavorite && 'text-[var(--color-accent)]')}
          onClick={(event) => onToggleFavorite(document.id, event)}
          aria-label={t('library.favorite')}
          title={t('library.favorite')}
        >
          <Star className={cn('h-3.5 w-3.5', document.isFavorite && 'fill-current')} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(event) => onEditTags(document.id, event)}
          aria-label={t('library.tags')}
          title={t('library.tags')}
        >
          <Tag className="h-3.5 w-3.5" />
        </Button>
        <MoveToFolderMenu documentId={document.id} folderId={document.folderId} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)] hover:text-[var(--color-destructive)]"
          onClick={(event) => onDelete(document.id, event)}
          aria-label={t('library.moveToTrash')}
          title={t('library.moveToTrash')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
})
