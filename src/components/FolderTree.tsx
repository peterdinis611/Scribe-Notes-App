import { useCallback, useMemo, useState, type RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useNavigate } from '@tanstack/react-router'
import { confirm } from '@tauri-apps/plugin-dialog'
import { FolderTreeDocumentRow, FolderTreeFolderRow } from '@/components/FolderTreeRows'
import {
  createFolder,
  deleteDocument,
  deleteFolder,
  moveFolder,
  renameFolder,
  setDocumentFavorite,
  setDocumentTags,
  trashFolderDocuments,
} from '@/lib/db/api'
import { useMoveDocumentToFolder } from '@/hooks/useMoveDocumentToFolder'
import { invalidateDocumentCache, peekCachedDocument } from '@/lib/cache/document-cache'
import {
  buildDeleteFolderConfirmMessage,
  buildTrashFolderConfirmMessage,
  collectFolderSubtreeIds,
  countDocumentsInFolders,
} from '@/lib/library/folders'
import { buildTree, estimateFlatItemSize, flattenTree } from '@/lib/library/tree'
import {
  readDocumentDragId,
  readFolderDragId,
  setDocumentDragData,
  setFolderDragData,
} from '@/lib/library/folder-tree-drag'
import { ROUTES } from '@/lib/routes'
import { promptInput } from '@/lib/input-dialog'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  activeTagFilterAtom,
  documentsAtom,
  favoritesOnlyFilterAtom,
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
  const favoritesOnly = useAtomValue(favoritesOnlyFilterAtom)
  const activeTag = useAtomValue(activeTagFilterAtom)

  const filteredDocuments = useMemo(() => {
    const q = query.trim().toLowerCase()
    return documents.filter((doc) => {
      if (q && !doc.title.toLowerCase().includes(q)) return false
      if (favoritesOnly && !doc.isFavorite) return false
      if (activeTag && !doc.tags.includes(activeTag)) return false
      return true
    })
  }, [documents, query, favoritesOnly, activeTag])

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
    const name = await promptInput({
      title: 'Nový priečinok',
      defaultValue: 'Nový priečinok',
      placeholder: 'Názov priečinka',
      confirmLabel: 'Vytvoriť',
    })
    if (!name) return
    const folder = await createFolder({ name, parentId })
    if (parentId) {
      setExpandedIds((prev: Set<string>) => new Set(prev).add(parentId))
    }
    setFolders((prev) => [...prev, folder])
    toast.success('Priečinok vytvorený', folder.name)
  }, [setExpandedIds, setFolders])

  const handleRenameFolder = useCallback(async (id: string, currentName: string) => {
    const name = await promptInput({
      title: 'Premenovať priečinok',
      defaultValue: currentName,
      placeholder: 'Názov priečinka',
      confirmLabel: 'Uložiť',
    })
    if (!name || name === currentName) return
    const folder = await renameFolder(id, name)
    setFolders((prev) => prev.map((item) => (item.id === id ? folder : item)))
    toast.success('Priečinok premenovaný', folder.name)
  }, [setFolders])

  const handleTrashFolderDocuments = useCallback(async (id: string, name: string, event: React.MouseEvent) => {
    event.stopPropagation()

    const subtreeIds = collectFolderSubtreeIds(folders, id)
    const documentCount = countDocumentsInFolders(documents, subtreeIds)
    if (documentCount === 0) {
      toast.info('Priečinok neobsahuje žiadne dokumenty')
      return
    }

    const confirmed = await confirm(buildTrashFolderConfirmMessage(name, documentCount), {
      title: 'Presunúť do koša?',
      kind: 'warning',
      okLabel: 'Presunúť do koša',
      cancelLabel: 'Zrušiť',
    })
    if (!confirmed) return

    const result = await trashFolderDocuments(id)
    const trashedIds = new Set(result.trashedDocumentIds)

    for (const documentId of result.trashedDocumentIds) {
      invalidateDocumentCache(documentId)
    }

    setDocuments((prev) => prev.filter((doc) => !trashedIds.has(doc.id)))

    if (activeId && trashedIds.has(activeId)) {
      const remaining = documents.filter((doc) => !trashedIds.has(doc.id))
      const nextId = remaining[0]?.id ?? null
      setActiveId(nextId)
      if (!nextId) {
        setActiveDocument(null)
        navigate(ROUTES.home())
      } else {
        navigate(ROUTES.document(nextId))
      }
    }

    toast.success(
      'Dokumenty presunuté do koša',
      `${result.trashedDocumentIds.length} z priečinka „${name}"`,
    )
  }, [activeId, documents, folders, navigate, setActiveDocument, setActiveId, setDocuments])

  const handleDeleteFolder = useCallback(async (id: string, name: string, event: React.MouseEvent) => {
    event.stopPropagation()

    const subtreeIds = collectFolderSubtreeIds(folders, id)
    const documentCount = countDocumentsInFolders(documents, subtreeIds)
    const confirmed = await confirm(buildDeleteFolderConfirmMessage(name, documentCount), {
      title: 'Vymazať priečinok?',
      kind: 'warning',
      okLabel: 'Vymazať priečinok',
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

    toast.success('Priečinok vymazaný', name)
  }, [activeId, documents, folders, navigate, setActiveDocument, setActiveId, setDocuments, setExpandedIds, setFolders])

  const handleDeleteDocument = useCallback(async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const deleted = documents.find((doc) => doc.id === id)
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
    toast.success('Dokument presunutý do koša', deleted?.title)
  }, [activeId, documents, navigate, setActiveDocument, setActiveId, setDocuments])

  const openDocument = useCallback((id: string) => {
    setActiveId(id)
    const cached = peekCachedDocument(id)
    if (cached) setActiveDocument(cached)
    navigate(ROUTES.document(id))
    onNavigate?.()
  }, [navigate, onNavigate, setActiveDocument, setActiveId])

  const handleToggleFavorite = useCallback(async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const current = documents.find((doc) => doc.id === id)
    if (!current) return
    const next = !current.isFavorite
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === id ? { ...doc, isFavorite: next } : doc)),
    )
    try {
      await setDocumentFavorite(id, next)
    } catch (error) {
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === id ? { ...doc, isFavorite: !next } : doc)),
      )
      toast.error('Nepodarilo sa zmeniť obľúbené', String(error))
    }
  }, [documents, setDocuments])

  const handleEditTags = useCallback(async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const current = documents.find((doc) => doc.id === id)
    if (!current) return
    const value = await promptInput({
      title: 'Štítky dokumentu',
      description: 'Oddeľte štítky čiarkou',
      defaultValue: current.tags.join(', '),
      placeholder: 'napr. práca, návrh',
      confirmLabel: 'Uložiť',
    })
    if (value === null) return
    const tags = Array.from(
      new Set(
        value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ).sort()
    setDocuments((prev) => prev.map((doc) => (doc.id === id ? { ...doc, tags } : doc)))
    try {
      await setDocumentTags(id, tags)
    } catch (error) {
      toast.error('Nepodarilo sa uložiť štítky', String(error))
    }
  }, [documents, setDocuments])

  const handleDropOnFolder = useCallback(async (folderId: string | null, event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setDragOverId(null)

    const documentId = readDocumentDragId(event)
    const folderDragId = readFolderDragId(event)

    if (documentId) {
      const current = documents.find((doc) => doc.id === documentId)
      if (current?.folderId === folderId) return
      await moveDocument(documentId, folderId)
      return
    }

    if (folderDragId && folderDragId !== folderId) {
      const folder = await moveFolder(folderDragId, folderId)
      setFolders((prev) => prev.map((item) => (item.id === folder.id ? folder : item)))
      toast.success('Priečinok presunutý', folder.name)
    }
  }, [documents, moveDocument, setFolders])

  const handleFolderDragStart = useCallback((id: string, event: React.DragEvent) => {
    setFolderDragData(event, id)
  }, [])

  const handleDocumentDragStart = useCallback((id: string, event: React.DragEvent) => {
    setDocumentDragData(event, id)
  }, [])

  const handleFolderDragOver = useCallback((id: string, event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setDragOverId(id)
  }, [])

  const handleFolderDragLeave = useCallback((id: string) => {
    setDragOverId((current) => (current === id ? null : current))
  }, [])

  return (
    <div className="min-h-full">
      <div
        className={cn(
          'titlebar-no-drag',
          dragOverId === 'root' && 'rounded-[10px] outline outline-1 outline-dashed outline-[var(--color-accent)] outline-offset-2',
        )}
        onDragOver={(event) => {
          if (event.target !== event.currentTarget) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDragOverId('root')
        }}
        onDragLeave={(event) => {
          if (event.target !== event.currentTarget) return
          setDragOverId((id) => (id === 'root' ? null : id))
        }}
        onDrop={(event) => void handleDropOnFolder(null, event)}
      >
        {flatItems.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-[var(--color-muted-foreground)]">
            {query ? 'Žiadne výsledky.' : 'Zatiaľ žiadne dokumenty.'}
          </p>
        ) : (
          <div
            className="w-full"
            style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const item = flatItems[virtualItem.index]!
              return (
                <div
                  key={virtualItem.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  className="w-full"
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
                      documentCount={countDocumentsInFolders(
                        documents,
                        collectFolderSubtreeIds(folders, item.folder.id),
                      )}
                      isExpanded={expandedIds.has(item.folder.id)}
                      isDragOver={dragOverId === item.folder.id}
                      onToggle={toggleFolder}
                      onRename={(id, name) => void handleRenameFolder(id, name)}
                      onCreateChild={(parentId) => void handleCreateFolder(parentId)}
                      onTrashDocuments={(id, folderName, event) =>
                        void handleTrashFolderDocuments(id, folderName, event)
                      }
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
                      onToggleFavorite={(id, event) => void handleToggleFavorite(id, event)}
                      onEditTags={(id, event) => void handleEditTags(id, event)}
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
