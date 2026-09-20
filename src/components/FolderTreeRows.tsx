import { memo, useMemo, useRef } from 'react'
import { useDrag, useDrop } from 'react-dnd'
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
import { prefetchDocument } from '@/lib/cache/prefetch-document'
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
import { canNestFolder } from '@/lib/dnd/reorder'
import { LIBRARY_DND_TYPE, type LibraryDragItem } from '@/lib/dnd/types'
import { flattenFoldersForPicker } from '@/lib/library/folders'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { DocumentSummary, Folder as FolderType } from '@/lib/db/api'
import { useAppSelector } from '@/store/hooks'
import { IconTooltip } from '@/components/ui/tooltip'

type FolderTreeFolderRowProps = {
  folder: FolderType
  depth: number
  documentCount: number
  isExpanded: boolean
  onToggle: (id: string) => void
  onRename: (id: string, name: string) => void
  onCreateChild: (parentId: string) => void
  onTrashDocuments: (id: string, name: string, event: React.MouseEvent) => void
  onDelete: (id: string, name: string, event: React.MouseEvent) => void
  onTogglePin: (id: string, event: React.MouseEvent) => void
  onUnlockVault?: (id: string) => void
  onLockVault?: (id: string) => void
  vaultUnlocked?: boolean
  onDropItem: (folderId: string, item: LibraryDragItem) => void
}

export const FolderTreeFolderRow = memo(function FolderTreeFolderRow({
  folder,
  depth,
  documentCount,
  isExpanded,
  onToggle,
  onRename,
  onCreateChild,
  onTrashDocuments,
  onDelete,
  onTogglePin,
  onUnlockVault,
  onLockVault,
  vaultUnlocked = false,
  onDropItem,
}: FolderTreeFolderRowProps) {
  const { t } = useTranslation()
  const folders = useAppSelector((state) => state.folders.folders)
  const rowRef = useRef<HTMLDivElement>(null)

  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: LIBRARY_DND_TYPE,
      item: { kind: 'folder', id: folder.id } satisfies LibraryDragItem,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [folder.id],
  )

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: LIBRARY_DND_TYPE,
      canDrop: (item: LibraryDragItem) =>
        item.kind === 'document' || canNestFolder(item.id, folder.id, folders),
      drop: (item: LibraryDragItem) => {
        onDropItem(folder.id, item)
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }) && monitor.canDrop(),
      }),
    }),
    [folder.id, folders, onDropItem],
  )

  drag(drop(rowRef))

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={rowRef}
          className={cn(
            'folder-tree-row folder-tree-row--folder group titlebar-no-drag',
            isExpanded && 'is-expanded',
            isOver && 'is-drop-target',
            isDragging && 'is-dragging',
          )}
          style={{ '--folder-depth': depth } as React.CSSProperties}
        >
          <IconTooltip label={isExpanded ? t('library.collapseFolder') : t('library.expandFolder')}>
            <button
              type="button"
              className="folder-tree-chevron"
              onClick={() => onToggle(folder.id)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? t('library.collapseFolder') : t('library.expandFolder')}
            >
              <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')} />
            </button>
          </IconTooltip>
          <span className="folder-tree-folder-mark" aria-hidden="true">
            <Folder className="h-3.5 w-3.5" />
          </span>
          {folder.isVault ? (
            <IconTooltip label={vaultUnlocked ? t('vault.unlocked') : t('vault.locked')}>
              <span tabIndex={0} className="inline-flex">
                {vaultUnlocked ? (
                  <Unlock className="folder-tree-vault-icon" aria-hidden />
                ) : (
                  <Lock className="folder-tree-vault-icon" aria-hidden />
                )}
              </span>
            </IconTooltip>
          ) : null}
          <button
            type="button"
            className="folder-tree-folder-name"
            onClick={() => onToggle(folder.id)}
            onDoubleClick={() => onRename(folder.id, folder.name)}
          >
            {folder.name}
          </button>
          {documentCount > 0 ? (
            <span className="folder-tree-count">{documentCount}</span>
          ) : null}
          <IconTooltip label={t('library.newSubfolder')}>
            <button
              type="button"
              className="folder-tree-add"
              aria-label={t('library.newSubfolder')}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onCreateChild(folder.id)
              }}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </IconTooltip>
            {folder.isPinned ? (
            <IconTooltip label={t('library.pinnedSection')}>
              <span tabIndex={0} className="inline-flex">
                <Pin className="folder-tree-pin" aria-hidden />
              </span>
            </IconTooltip>
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
}: FolderTreeDocumentRowProps) {
  const { t } = useTranslation()
  const folders = useAppSelector((state) => state.folders.folders)
  const moveDocument = useMoveDocumentToFolder()
  const folderItems = useMemo(() => flattenFoldersForPicker(folders), [folders])
  const rowRef = useRef<HTMLDivElement>(null)

  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: LIBRARY_DND_TYPE,
      item: { kind: 'document', id: document.id } satisfies LibraryDragItem,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [document.id],
  )

  drag(rowRef)

  const noopEvent = { stopPropagation() {} } as React.MouseEvent

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={rowRef}
          role="button"
          tabIndex={0}
          onClick={() => onOpen(document.id)}
          onPointerEnter={() => prefetchDocument(document.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpen(document.id)
            }
          }}
          className={cn(
            'folder-tree-row folder-tree-row--doc group titlebar-no-drag',
            isActive && 'is-active',
            isSelected && 'is-selected',
            isDragging && 'is-dragging',
          )}
          style={{ '--folder-depth': depth } as React.CSSProperties}
        >
          {onToggleSelect ? (
            <label
              className={cn('folder-tree-select', isSelected && 'is-visible')}
              onClick={(event) => event.stopPropagation()}
            >
              <input
                type="checkbox"
                className="folder-tree-select-checkbox titlebar-no-drag"
                checked={isSelected}
                aria-label={t('library.bulk.selectOne')}
                onChange={(event) => {
                  event.stopPropagation()
                  onToggleSelect(document.id, event as unknown as React.MouseEvent)
                }}
              />
            </label>
          ) : null}

          <span className={cn('folder-tree-doc-mark', isActive && 'is-active')} aria-hidden="true">
            <FileText className="h-3.5 w-3.5" />
          </span>

          <div className="folder-tree-doc-body">
            <DocumentTitleField
              documentId={document.id}
              title={document.title}
              variant="sidebar"
              className="folder-tree-doc-title"
            />
            <span className="folder-tree-doc-meta">
              {formatRelativeTime(document.updatedAt)}
              {document.tags.length > 0 ? (
                <span className="folder-tree-doc-tags">
                  · {t('library.tagCount', { count: document.tags.length })}
                </span>
              ) : null}
            </span>
          </div>

          <div className="folder-tree-doc-badges">
            {document.isPasswordProtected ? (
              <IconTooltip label={t('vault.doc.protect')}>
                <span tabIndex={0} className="inline-flex">
                  <Lock className="folder-tree-pin h-3 w-3 text-[var(--color-muted-foreground)]" aria-hidden="true" />
                </span>
              </IconTooltip>
            ) : null}
            {document.isPinned ? (
              <IconTooltip label={t('library.pinnedSection')}>
                <span tabIndex={0} className="inline-flex">
                  <Pin className="folder-tree-pin" aria-hidden="true" />
                </span>
              </IconTooltip>
            ) : null}
            {document.isFavorite ? (
              <IconTooltip label={t('library.favorite')}>
                <span tabIndex={0} className="inline-flex">
                  <Star className="folder-tree-star" aria-hidden="true" />
                </span>
              </IconTooltip>
            ) : null}
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
