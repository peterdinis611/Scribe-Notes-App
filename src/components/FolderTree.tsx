import { useMemo, useState } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { useNavigate } from '@tanstack/react-router'
import { ChevronRight, FileText, Folder, FolderPlus, Trash2 } from 'lucide-react'
import { DocumentTitleField } from '@/components/DocumentTitleField'
import {
  createFolder,
  deleteDocument,
  deleteFolder,
  listDocuments,
  listFolders,
  moveDocumentToFolder,
  moveFolder,
  renameFolder,
} from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { DocumentSummary, Folder as FolderType } from '@/lib/db/api'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
} from '@/store/documents'
import { expandedFolderIdsAtom, foldersAtom } from '@/store/folders'

type TreeNode =
  | { type: 'folder'; folder: FolderType; children: TreeNode[] }
  | { type: 'document'; document: DocumentSummary }

function buildTree(folders: FolderType[], documents: DocumentSummary[]): TreeNode[] {
  const folderMap = new Map<string, TreeNode & { type: 'folder' }>()

  for (const folder of folders) {
    folderMap.set(folder.id, { type: 'folder', folder, children: [] })
  }

  const roots: TreeNode[] = []

  for (const folder of folders) {
    const node = folderMap.get(folder.id)!
    if (folder.parentId && folderMap.has(folder.parentId)) {
      folderMap.get(folder.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  for (const doc of documents) {
    const docNode: TreeNode = { type: 'document', document: doc }
    if (doc.folderId && folderMap.has(doc.folderId)) {
      folderMap.get(doc.folderId)!.children.push(docNode)
    } else {
      roots.push(docNode)
    }
  }

  return roots
}

type FolderTreeProps = {
  query: string
}

export function FolderTree({ query }: FolderTreeProps) {
  const [folders, setFolders] = useAtom(foldersAtom)
  const [documents, setDocuments] = useAtom(documentsAtom)
  const [expandedIds, setExpandedIds] = useAtom(expandedFolderIdsAtom)
  const [activeId, setActiveId] = useAtom(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const navigate = useNavigate()
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const filteredDocuments = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return documents
    return documents.filter((doc) => doc.title.toLowerCase().includes(q))
  }, [documents, query])

  const tree = useMemo(() => buildTree(folders, filteredDocuments), [folders, filteredDocuments])

  function toggleFolder(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function refresh() {
    const [nextFolders, nextDocs] = await Promise.all([listFolders(), listDocuments()])
    setFolders(nextFolders)
    setDocuments(nextDocs)
  }

  async function handleCreateFolder(parentId: string | null) {
    const name = window.prompt('Názov priečinka', 'Nový priečinok')
    if (!name?.trim()) return
    await createFolder({ name: name.trim(), parentId })
    if (parentId) {
      setExpandedIds((prev) => new Set(prev).add(parentId))
    }
    await refresh()
  }

  async function handleRenameFolder(id: string, currentName: string) {
    const name = window.prompt('Premenovať priečinok', currentName)
    if (!name?.trim() || name.trim() === currentName) return
    await renameFolder(id, name.trim())
    await refresh()
  }

  async function handleDeleteFolder(id: string, event: React.MouseEvent) {
    event.stopPropagation()
    if (!window.confirm('Vymazať priečinok? Dokumenty zostanú bez priečinka.')) return
    await deleteFolder(id)
    await refresh()
  }

  async function handleDeleteDocument(id: string, event: React.MouseEvent) {
    event.stopPropagation()
    await deleteDocument(id)
    await refresh()
    if (activeId === id) {
      const items = await listDocuments()
      const nextId = items[0]?.id ?? null
      setActiveId(nextId)
      if (!nextId) {
        setActiveDocument(null)
        navigate(ROUTES.home())
      } else {
        navigate(ROUTES.document(nextId))
      }
    }
  }

  function openDocument(id: string) {
    setActiveId(id)
    navigate(ROUTES.document(id))
  }

  async function handleDropOnFolder(folderId: string | null, event: React.DragEvent) {
    event.preventDefault()
    setDragOverId(null)
    const documentId = event.dataTransfer.getData('application/x-scribe-document')
    const folderDragId = event.dataTransfer.getData('application/x-scribe-folder')
    if (documentId) {
      await moveDocumentToFolder(documentId, folderId)
      await refresh()
      return
    }
    if (folderDragId && folderDragId !== folderId) {
      await moveFolder(folderDragId, folderId)
      await refresh()
    }
  }

  function renderNode(node: TreeNode, depth = 0) {
    if (node.type === 'document') {
      const doc = node.document
      return (
        <div
          key={doc.id}
          role="button"
          tabIndex={0}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('application/x-scribe-document', doc.id)
            event.dataTransfer.effectAllowed = 'move'
          }}
          onClick={() => openDocument(doc.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              openDocument(doc.id)
            }
          }}
          className={cn('doc-item group titlebar-no-drag', activeId === doc.id && 'is-active')}
          style={{ paddingLeft: 12 + depth * 14 }}
        >
          <div className="doc-item-icon">
            <FileText className="h-4 w-4 stroke-[1.5]" />
          </div>
          <div className="min-w-0 flex-1">
            <DocumentTitleField documentId={doc.id} title={doc.title} variant="sidebar" />
            <p className="doc-item-meta">{formatRelativeTime(doc.updatedAt)}</p>
          </div>
          <button
            type="button"
            className="doc-item-delete"
            onClick={(event) => void handleDeleteDocument(doc.id, event)}
            aria-label="Vymazať"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )
    }

    const { folder, children } = node
    const isExpanded = expandedIds.has(folder.id)
    const isDragOver = dragOverId === folder.id

    return (
      <div key={folder.id} className="folder-tree-branch">
        <div
          className={cn('folder-tree-row titlebar-no-drag', isDragOver && 'is-drag-over')}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('application/x-scribe-folder', folder.id)
            event.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setDragOverId(folder.id)
          }}
          onDragLeave={() => setDragOverId((id) => (id === folder.id ? null : id))}
          onDrop={(event) => void handleDropOnFolder(folder.id, event)}
        >
          <button type="button" className="folder-tree-toggle" onClick={() => toggleFolder(folder.id)}>
            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')} />
          </button>
          <Folder className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
          <button
            type="button"
            className="folder-tree-name"
            onClick={() => toggleFolder(folder.id)}
            onDoubleClick={() => void handleRenameFolder(folder.id, folder.name)}
          >
            {folder.name}
          </button>
          <button
            type="button"
            className="folder-tree-action"
            title="Nový podpriečinok"
            onClick={() => void handleCreateFolder(folder.id)}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="folder-tree-action folder-tree-action--danger"
            onClick={(event) => void handleDeleteFolder(folder.id, event)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {isExpanded && <div className="folder-tree-children">{children.map((child) => renderNode(child, depth + 1))}</div>}
      </div>
    )
  }

  return (
    <div className="folder-tree">
      <div className="folder-tree-toolbar titlebar-no-drag">
        <button type="button" className="folder-tree-toolbar-btn" onClick={() => void handleCreateFolder(null)}>
          <FolderPlus className="h-3.5 w-3.5" />
          Nový priečinok
        </button>
      </div>
      <div
        className={cn('folder-tree-root-drop titlebar-no-drag', dragOverId === 'root' && 'is-drag-over')}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOverId('root')
        }}
        onDragLeave={() => setDragOverId((id) => (id === 'root' ? null : id))}
        onDrop={(event) => void handleDropOnFolder(null, event)}
      >
        {tree.length === 0 ? (
          <p className="sidebar-empty">{query ? 'Žiadne výsledky.' : 'Zatiaľ žiadne dokumenty.'}</p>
        ) : (
          tree.map((node) => renderNode(node))
        )}
      </div>
    </div>
  )
}
