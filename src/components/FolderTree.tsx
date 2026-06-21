import { useCallback, useMemo, useState, type RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAtom, useSetAtom } from 'jotai'
import { useNavigate } from '@tanstack/react-router'
import { confirm } from '@tauri-apps/plugin-dialog'
import { FolderTreeDocumentRow, FolderTreeFolderRow } from '@/components/FolderTreeRows'
import {
  createFolder,
  deleteDocument,
  deleteFolder,
  moveFolder,
  renameFolder,
} from '@/lib/db/api'
import { useMoveDocumentToFolder } from '@/hooks/useMoveDocumentToFolder'
import { invalidateDocumentCache } from '@/lib/cache/document-cache'
import {
  buildDeleteFolderConfirmMessage,
  collectFolderSubtreeIds,
  countDocumentsInFolders,
} from '@/lib/library/folders'
import { buildTree, estimateFlatItemSize, flattenTree } from '@/lib/library/tree'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
} from '@/store/documents'
import { expandedFolderIdsAtom, foldersAtom } from '@/store/folders'

type FolderTreeProps = {
  query: string
  scrollRef: RefObject<HTMLDivElement | null>
  onNavigate?: () => void
}

export function FolderTree({ query, scrollRef, onNavigate }: FolderTreeProps) {
  const [folders, setFolders] = useAtom(foldersAtom)
  const [documents, setDocuments] = useAtom(documentsAtom)
  const [expandedIds, setExpandedIds] = useAtom(expandedFolderIdsAtom)
  const [activeId, setActiveId] = useAtom(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const navigate = useNavigate()
  const moveDocument = useMoveDocumentToFolder()
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const filteredDocuments = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return documents
    return documents.filter((doc) => doc.title.toLowerCase().includes(q))
  }, [documents, query])

  const tree = useMemo(() => buildTree(folders, filteredDocuments), [folders, filteredDocuments])
  const flatItems = useMemo(() => flattenTree(tree, expandedIds), [tree, expandedIds])

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateFlatItemSize(flatItems[index]!),
    overscan: 12,
    measureElement: (element) => element.getBoundingClientRect().height,
  })

  const toggleFolder = useCallback((id: string) => {
    setExpandedIds((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [setExpandedIds])

  const handleCreateFolder = useCallback(async (parentId: string | null) => {
    const name = window.prompt('Názov priečinka', 'Nový priečinok')
    if (!name?.trim()) return
    const folder = await createFolder({ name: name.trim(), parentId })
    if (parentId) {
      setExpandedIds((prev: Set<string>) => new Set(prev).add(parentId))
    }
    setFolders((prev) => [...prev, folder])
  }, [setExpandedIds, setFolders])

  const handleRenameFolder = useCallback(async (id: string, currentName: string) => {
    const name = window.prompt('Premenovať priečinok', currentName)
    if (!name?.trim() || name.trim() === currentName) return
    const folder = await renameFolder(id, name.trim())
    setFolders((prev) => prev.map((item) => (item.id === id ? folder : item)))
  }, [setFolders])

  const handleDeleteFolder = useCallback(async (id: string, name: string, event: React.MouseEvent) => {
    event.stopPropagation()

    const subtreeIds = collectFolderSubtreeIds(folders, id)
    const documentCount = countDocumentsInFolders(documents, subtreeIds)
    const confirmed = await confirm(buildDeleteFolderConfirmMessage(name, documentCount), {
      title: 'Vymazať priečinok?',
      kind: 'warning',
      okLabel: 'Vymazať',
      cancelLabel: 'Zrušiť',
    })
    if (!confirmed) return

    const result = await deleteFolder(id)

    for (const documentId of result.deletedDocumentIds) {
      invalidateDocumentCache(documentId)
    }

    const deletedFolderIds = new Set(result.deletedFolderIds)
    const deletedDocumentIds = new Set(result.deletedDocumentIds)

    setFolders((prev) => prev.filter((item) => !deletedFolderIds.has(item.id)))
    setDocuments((prev) => prev.filter((doc) => !deletedDocumentIds.has(doc.id)))

    setExpandedIds((prev: Set<string>) => {
      const next = new Set(prev)
      for (const folderId of deletedFolderIds) {
        next.delete(folderId)
      }
      return next
    })

    if (activeId && deletedDocumentIds.has(activeId)) {
      const remaining = documents.filter((doc) => !deletedDocumentIds.has(doc.id))
      const nextId = remaining[0]?.id ?? null
      setActiveId(nextId)
      if (!nextId) {
        setActiveDocument(null)
        navigate(ROUTES.home())
      } else {
        navigate(ROUTES.document(nextId))
      }
    }
  }, [activeId, documents, folders, navigate, setActiveDocument, setActiveId, setDocuments, setExpandedIds, setFolders])

  const handleDeleteDocument = useCallback(async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    await deleteDocument(id)
    const remaining = documents.filter((doc) => doc.id !== id)
    setDocuments(remaining)
    if (activeId === id) {
      const nextId = remaining[0]?.id ?? null
      setActiveId(nextId)
      if (!nextId) {
        setActiveDocument(null)
        navigate(ROUTES.home())
      } else {
        navigate(ROUTES.document(nextId))
      }
    }
  }, [activeId, documents, navigate, setActiveDocument, setActiveId, setDocuments])

  const openDocument = useCallback((id: string) => {
    setActiveId(id)
    navigate(ROUTES.document(id))
    onNavigate?.()
  }, [navigate, onNavigate, setActiveId])

  const handleDropOnFolder = useCallback(async (folderId: string | null, event: React.DragEvent) => {
    event.preventDefault()
    setDragOverId(null)
    const documentId = event.dataTransfer.getData('application/x-scribe-document')
    const folderDragId = event.dataTransfer.getData('application/x-scribe-folder')
    if (documentId) {
      await moveDocument(documentId, folderId)
      return
    }
    if (folderDragId && folderDragId !== folderId) {
      const folder = await moveFolder(folderDragId, folderId)
      setFolders((prev) => prev.map((item) => (item.id === folder.id ? folder : item)))
    }
  }, [moveDocument, setFolders])

  const handleFolderDragStart = useCallback((id: string, event: React.DragEvent) => {
    event.dataTransfer.setData('application/x-scribe-folder', id)
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDocumentDragStart = useCallback((id: string, event: React.DragEvent) => {
    event.dataTransfer.setData('application/x-scribe-document', id)
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleFolderDragOver = useCallback((id: string, event: React.DragEvent) => {
    event.preventDefault()
    setDragOverId(id)
  }, [])

  const handleFolderDragLeave = useCallback((id: string) => {
    setDragOverId((current) => (current === id ? null : current))
  }, [])

  return (
    <div className="folder-tree">
      <div
        className={cn('folder-tree-root-drop titlebar-no-drag', dragOverId === 'root' && 'is-drag-over')}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOverId('root')
        }}
        onDragLeave={() => setDragOverId((id) => (id === 'root' ? null : id))}
        onDrop={(event) => void handleDropOnFolder(null, event)}
      >
        {flatItems.length === 0 ? (
          <p className="sidebar-empty">{query ? 'Žiadne výsledky.' : 'Zatiaľ žiadne dokumenty.'}</p>
        ) : (
          <div
            className="folder-tree-virtual"
            style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const item = flatItems[virtualItem.index]!
              return (
                <div
                  key={virtualItem.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  className="folder-tree-virtual-item"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {item.type === 'folder' ? (
                    <FolderTreeFolderRow
                      folder={item.folder}
                      depth={item.depth}
                      isExpanded={expandedIds.has(item.folder.id)}
                      isDragOver={dragOverId === item.folder.id}
                      onToggle={toggleFolder}
                      onRename={(id, name) => void handleRenameFolder(id, name)}
                      onCreateChild={(parentId) => void handleCreateFolder(parentId)}
                      onDelete={(id, folderName, event) => void handleDeleteFolder(id, folderName, event)}
                      onDragStart={handleFolderDragStart}
                      onDragOver={handleFolderDragOver}
                      onDragLeave={handleFolderDragLeave}
                      onDrop={(folderId, event) => void handleDropOnFolder(folderId, event)}
                    />
                  ) : (
                    <FolderTreeDocumentRow
                      document={item.document}
                      depth={item.depth}
                      isActive={activeId === item.document.id}
                      onOpen={openDocument}
                      onDelete={(id, event) => void handleDeleteDocument(id, event)}
                      onDragStart={handleDocumentDragStart}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
