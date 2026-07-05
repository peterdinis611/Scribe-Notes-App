import { useMemo, useState, type ReactNode } from 'react'
import { useAtomValue } from 'jotai'
import { Check, Folder, FolderInput } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useMoveDocumentToFolder } from '@/hooks/useMoveDocumentToFolder'
import { flattenFoldersForPicker } from '@/lib/library/folders'
import { foldersAtom } from '@/store/folders'

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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] hover:text-[var(--color-accent)]"
            title="Presunúť do priečinka"
            aria-label="Presunúť do priečinka"
            onClick={(event) => event.stopPropagation()}
          >
            <FolderInput className="h-3.5 w-3.5" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-[220px] overflow-y-auto">
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
          <p className="px-2 py-3 text-center text-[12px] text-[var(--color-muted-foreground)]">
            Najprv vytvorte priečinok v sidebari.
          </p>
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

  if (!documentId) return null

  async function handleMove(nextFolderId: string | null) {
    await moveDocument(documentId!, nextFolderId)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md titlebar-no-drag" showClose>
        <DialogHeader>
          <DialogTitle>Presunúť do priečinka</DialogTitle>
          <DialogDescription>
            Vyberte cieľový priečinok alebo presuňte dokument priamo v sidebari.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--color-hover)]"
            onClick={() => void handleMove(null)}
          >
            <Folder className="h-4 w-4 text-[var(--color-muted-foreground)]" />
            <span className="flex-1">Koreň (bez priečinka)</span>
            {folderId === null && <Check className="h-4 w-4 text-[var(--color-accent)]" />}
          </button>
          {folderItems.map(({ folder, depth }) => (
            <button
              key={folder.id}
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--color-hover)]"
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
      </DialogContent>
    </Dialog>
  )
}
