import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  ChevronRight,
  FileText,
  Folder,
  FolderInput,
  FolderMinus,
  FolderPlus,
  Pin,
  Star,
  Tag,
  Lock,
  Unlock,
  Trash2,
} from 'lucide-react'
import { DocumentTitleField } from '@/components/DocumentTitleField'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useMoveDocumentToFolder } from '@/hooks/useMoveDocumentToFolder'
import { flattenFoldersForPicker } from '@/lib/library/folders'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { DocumentSummary, Folder as FolderType } from '@/lib/db/api'
import { useAppSelector } from '@/store/hooks'

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
  onTogglePin: (id: string, event: React.MouseEvent) => void
  onUnlockVault?: (id: string) => void
  onLockVault?: (id: string) => void
  vaultUnlocked?: boolean
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
  onTogglePin,
  onUnlockVault,
  onLockVault,
  vaultUnlocked = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: FolderTreeFolderRowProps) {
  const { t } = useTranslation()

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'group titlebar-no-drag mx-1 flex min-h-[28px] items-center gap-1 rounded-md pr-1 transition-colors hover:bg-[var(--color-hover)]',
            isDragOver &&
              'bg-[var(--color-selection)] outline outline-1 outline-dashed outline-[var(--color-accent)]',
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable
          onDragStart={(event) => onDragStart(folder.id, event)}
          onDragOver={(event) => onDragOver(folder.id, event)}
          onDragLeave={() => onDragLeave(folder.id)}
          onDrop={(event) => onDrop(folder.id, event)}
        >
          <button
            type="button"
            className={cn(treeActionClass, 'opacity-100')}
            onClick={() => onToggle(folder.id)}
          >
            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')} />
          </button>
          <Folder className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
          {folder.isVault ? (
            vaultUnlocked ? (
              <Unlock className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" aria-hidden />
            ) : (
              <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" aria-hidden />
            )
          ) : null}
          <button
            type="button"
            className="min-w-0 flex-1 truncate border-none bg-transparent text-left text-[12px] font-semibold text-[var(--color-foreground)]"
            onClick={() => onToggle(folder.id)}
            onDoubleClick={() => onRename(folder.id, folder.name)}
          >
            {folder.name}
          </button>
          {folder.isPinned ? (
            <Pin className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" aria-hidden />
          ) : null}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[200px]">
        <ContextMenuItem onSelect={() => onCreateChild(folder.id)}>
          <FolderPlus className="h-4 w-4" />
          {t('library.newSubfolder')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onRename(folder.id, folder.name)}>
          {t('library.renameFolder')}
        </ContextMenuItem>
        {folder.isVault && !vaultUnlocked && onUnlockVault ? (
          <ContextMenuItem onSelect={() => onUnlockVault(folder.id)}>
            <Unlock className="h-4 w-4" />
            {t('vault.unlock')}
          </ContextMenuItem>
        ) : null}
        {folder.isVault && vaultUnlocked && onLockVault ? (
          <ContextMenuItem onSelect={() => onLockVault(folder.id)}>
            <Lock className="h-4 w-4" />
            {t('vault.lock')}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          onSelect={() => onTogglePin(folder.id, { stopPropagation() {} } as React.MouseEvent)}
        >
          <Pin className={cn('h-4 w-4', folder.isPinned && 'fill-current text-[var(--color-accent)]')} />
          {folder.isPinned ? t('library.unpin') : t('library.pin')}
        </ContextMenuItem>
        {documentCount > 0 ? (
          <ContextMenuItem
            onSelect={() =>
              onTrashDocuments(folder.id, folder.name, {
                stopPropagation() {},
              } as React.MouseEvent)
            }
          >
            <Trash2 className="h-4 w-4" />
            {t('library.trashAllInFolder')}
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-[var(--color-destructive)] data-[highlighted]:text-[var(--color-destructive)]"
          onSelect={() =>
            onDelete(folder.id, folder.name, { stopPropagation() {} } as React.MouseEvent)
          }
        >
          <FolderMinus className="h-4 w-4" />
          {t('library.deleteFolder')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})

type FolderTreeDocumentRowProps = {
  document: DocumentSummary
  depth: number
  isActive: boolean
  isSelected?: boolean
  onOpen: (id: string) => void
  onDelete: (id: string, event: React.MouseEvent) => void
  onToggleFavorite: (id: string, event: React.MouseEvent) => void
  onTogglePin: (id: string, event: React.MouseEvent) => void
  onEditTags: (id: string, event: React.MouseEvent) => void
  onToggleSelect?: (id: string, event: React.MouseEvent) => void
  onDragStart: (id: string, event: React.DragEvent) => void
}

export const FolderTreeDocumentRow = memo(function FolderTreeDocumentRow({
  document,
  depth,
  isActive,
  isSelected = false,
  onOpen,
  onDelete,
  onToggleFavorite,
  onTogglePin,
  onEditTags,
  onToggleSelect,
  onDragStart,
}: FolderTreeDocumentRowProps) {
  const { t } = useTranslation()
  const folders = useAppSelector((state) => state.folders.folders)
  const moveDocument = useMoveDocumentToFolder()
  const folderItems = useMemo(() => flattenFoldersForPicker(folders), [folders])

  const noopEvent = { stopPropagation() {} } as React.MouseEvent

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
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
            isSelected && 'ring-1 ring-[var(--color-accent)]',
          )}
          style={{ paddingLeft: 12 + depth * 14 }}
        >
          {onToggleSelect && (
            <input
              type="checkbox"
              className="folder-tree-select-checkbox titlebar-no-drag"
              checked={isSelected}
              aria-label={t('library.bulk.selectOne')}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                event.stopPropagation()
                onToggleSelect(document.id, event as unknown as React.MouseEvent)
              }}
            />
          )}
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

          <div className="flex items-center gap-0.5">
            {document.isPinned && (
              <Pin className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
            )}
            {document.isFavorite && (
              <Star className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
            )}
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="min-w-[220px]">
        <ContextMenuItem onSelect={() => onOpen(document.id)}>
          <FileText className="h-4 w-4" />
          {t('library.openDocument')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onTogglePin(document.id, noopEvent)}>
          <Pin className={cn('h-4 w-4', document.isPinned && 'fill-current text-[var(--color-accent)]')} />
          {document.isPinned ? t('library.unpin') : t('library.pin')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onToggleFavorite(document.id, noopEvent)}>
          <Star
            className={cn('h-4 w-4', document.isFavorite && 'fill-current text-[var(--color-accent)]')}
          />
          {t('library.favorite')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onEditTags(document.id, noopEvent)}>
          <Tag className="h-4 w-4" />
          {t('library.tags')}
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <FolderInput className="h-4 w-4" />
            {t('library.moveToFolder')}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-80 min-w-[220px] overflow-y-auto">
            <ContextMenuItem
              onSelect={() => {
                if (document.folderId !== null) void moveDocument(document.id, null)
              }}
            >
              <Folder className="h-4 w-4 text-[var(--color-muted-foreground)]" />
              <span className="flex-1">{t('library.rootFolder')}</span>
              {document.folderId === null ? (
                <Check className="h-4 w-4 text-[var(--color-accent)]" />
              ) : null}
            </ContextMenuItem>
            {folderItems.length > 0 ? <ContextMenuSeparator /> : null}
            {folderItems.map(({ folder, depth: folderDepth }) => (
              <ContextMenuItem
                key={folder.id}
                onSelect={() => {
                  if (document.folderId !== folder.id) void moveDocument(document.id, folder.id)
                }}
              >
                <Folder className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
                <span className="flex-1 truncate" style={{ paddingLeft: folderDepth * 12 }}>
                  {folder.name}
                </span>
                {document.folderId === folder.id ? (
                  <Check className="h-4 w-4 text-[var(--color-accent)]" />
                ) : null}
              </ContextMenuItem>
            ))}
            {folderItems.length === 0 ? (
              <p className="px-2 py-3 text-center text-[12px] text-[var(--color-muted-foreground)]">
                {t('library.noFoldersYet')}
              </p>
            ) : null}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-[var(--color-destructive)] data-[highlighted]:text-[var(--color-destructive)]"
          onSelect={() => onDelete(document.id, noopEvent)}
        >
          <Trash2 className="h-4 w-4" />
          {t('library.moveToTrash')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})
