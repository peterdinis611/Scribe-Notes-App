import { useMemo, useState, type ReactNode } from 'react'
import { useAtomValue } from 'jotai'
import { Check, Folder, FolderInput } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMoveDocumentToFolder } from '@/hooks/useMoveDocumentToFolder'
import { flattenFoldersForPicker } from '@/lib/library/folders'
import { cn } from '@/lib/utils'

type MoveToFolderMenuProps = {
  documentId: string
  folderId: string | null
  trigger?: ReactNode
  onMoved?: (folderId: string | null) => void
}

export function MoveToFolderMenu({
  documentId,
  folderId,
  trigger,
  onMoved,
}: MoveToFolderMenuProps) {
  const folders = useAtomValue(foldersAtom)
  const moveDocument = useMoveDocumentToFolder()
  const [open, setOpen] = useState(false)

  const folderItems = useMemo(() => flattenFoldersForPicker(folders), [folders])

  async function handleMove(nextFolderId: string | null) {
    if (nextFolderId === folderId) {
      setOpen(false)
      return
    }
    await moveDocument(documentId, nextFolderId)
    onMoved?.(nextFolderId)
    setOpen(false)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="doc-item-move"
            title="Presunúť do priečinka"
            aria-label="Presunúť do priečinka"
            onClick={(event) => event.stopPropagation()}
          >
            <FolderInput className="h-3.5 w-3.5" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="move-folder-menu">
        <DropdownMenuItem onClick={() => void handleMove(null)}>
          <Folder className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <span className="flex-1">Koreň (bez priečinka)</span>
          {folderId === null && <Check className="h-4 w-4 text-[var(--color-accent)]" />}
        </DropdownMenuItem>
        {folderItems.length > 0 && <DropdownMenuSeparator />}
        {folderItems.map(({ folder, depth }) => (
          <DropdownMenuItem key={folder.id} onClick={() => void handleMove(folder.id)}>
            <Folder className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
            <span
              className="flex-1 truncate"
              style={{ paddingLeft: depth * 12 }}
            >
              {folder.name}
            </span>
            {folderId === folder.id && <Check className="h-4 w-4 text-[var(--color-accent)]" />}
          </DropdownMenuItem>
        ))}
        {folderItems.length === 0 && (
          <p className="move-folder-menu-empty">Najprv vytvorte priečinok v sidebari.</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type MoveToFolderDialogProps = {
  open: boolean
  documentId: string | null
  folderId: string | null
  onOpenChange: (open: boolean) => void
}

export function MoveToFolderDialog({
  open,
  documentId,
  folderId,
  onOpenChange,
}: MoveToFolderDialogProps) {
  const folders = useAtomValue(foldersAtom)
  const moveDocument = useMoveDocumentToFolder()
  const folderItems = useMemo(() => flattenFoldersForPicker(folders), [folders])

  if (!open || !documentId) return null

  async function handleMove(nextFolderId: string | null) {
    await moveDocument(documentId!, nextFolderId)
    onOpenChange(false)
  }

  return (
    <div className="command-palette-backdrop titlebar-no-drag" onClick={() => onOpenChange(false)}>
      <div
        className="move-folder-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Presunúť do priečinka"
      >
        <h2 className="move-folder-dialog-title">Presunúť do priečinka</h2>
        <p className="move-folder-dialog-description">
          Vyberte cieľový priečinok alebo presuňte dokument priamo v sidebari.
        </p>
        <div className="move-folder-dialog-list">
          <button type="button" className="move-folder-dialog-item" onClick={() => void handleMove(null)}>
            <Folder className="h-4 w-4 text-[var(--color-muted-foreground)]" />
            <span>Koreň (bez priečinka)</span>
            {folderId === null && <Check className="h-4 w-4 text-[var(--color-accent)]" />}
          </button>
          {folderItems.map(({ folder, depth }) => (
            <button
              key={folder.id}
              type="button"
              className="move-folder-dialog-item"
              onClick={() => void handleMove(folder.id)}
            >
              <Folder className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
              <span className="truncate" style={{ paddingLeft: depth * 12 }}>
                {folder.name}
              </span>
              {folderId === folder.id && <Check className="h-4 w-4 text-[var(--color-accent)]" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
