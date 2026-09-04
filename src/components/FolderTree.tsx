import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useNavigate } from '@tanstack/react-router'
import { confirm } from '@tauri-apps/plugin-dialog'
import { FolderTreeDocumentRow, FolderTreeFolderRow } from '@/components/FolderTreeRows'
import {
  createFolder,
  deleteFolder,
  listLinkGraph,
  moveFolder,
  renameFolder,
  setDocumentFavorite,
  setDocumentPinned,
  setDocumentTags,
  setFolderPinned,
  trashFolderDocuments,
} from '@/lib/db/api'
import { useMoveDocumentToFolder } from '@/hooks/useMoveDocumentToFolder'
import { invalidateDocumentCache, peekCachedDocument } from '@/lib/cache/document-cache'
import { isLibraryDocumentVisible } from '@/lib/db/library-sync'
import { trashDocuments, removeDocumentsFromLibraryUi } from '@/lib/trash-document'
import {
  buildDeleteFolderConfirmMessage,
  buildTrashFolderConfirmMessage,
  collectFolderSubtreeIds,
  countDocumentsInFolders,
} from '@/lib/library/folders'
import { buildTree, estimateFlatItemSize, flattenTree } from '@/lib/library/tree'
import { documentMatchesMetaFilters } from '@/lib/library/tag-meta'
import { documentMatchesSmartFilter } from '@/lib/library/smart-filters'
import {
  readDocumentDragId,
  readFolderDragId,
  setDocumentDragData,
  setFolderDragData,
} from '@/lib/library/folder-tree-drag'
import { nlpStatus, nlpSuggestTags } from '@/lib/db/nlp-api'
import { describeNlpTagSuggestionFailure } from '@/lib/nlp/errors'
import { ROUTES } from '@/lib/routes'
import { promptInput } from '@/lib/input-dialog'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setActiveDocumentId,
  toggleSelectedDocument,
  updateDocuments,
} from '@/store/documentsSlice'
import { updateExpandedFolderIds, updateFolders } from '@/store/foldersSlice'

type FolderTreeProps = {
  query: string
  scrollRef: RefObject<HTMLDivElement | null>
  onNavigate?: () => void
}

export function FolderTree({ query, scrollRef, onNavigate }: FolderTreeProps) {
  const { t } = useTranslation()
  const folders = useAppSelector((state) => state.folders.folders)
  const documents = useAppSelector((state) => state.documents.documents)
  const expandedIds = useAppSelector((state) => state.folders.expandedFolderIds)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const openDocumentIds = useAppSelector((state) => state.documents.openDocumentIds)
  const secondaryDocumentId = useAppSelector((state) => state.documents.secondaryDocumentId)
  const favoritesOnly = useAppSelector((state) => state.documents.favoritesOnlyFilter)
  const activeTag = useAppSelector((state) => state.documents.activeTagFilter)
  const metaFilters = useAppSelector((state) => state.documents.metaFilters)
  const librarySmartFilter = useAppSelector((state) => state.documents.librarySmartFilter)
  const recentDocumentIds = useAppSelector((state) => state.documents.recentDocumentIds)
  const selectedDocumentIds = useAppSelector((state) => state.documents.selectedDocumentIds)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [orphanIds, setOrphanIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    void listLinkGraph()
      .then((graph) => {
        if (cancelled) return
        setOrphanIds(new Set(graph.orphans.map((item) => item.id)))
      })
      .catch(() => {
        if (!cancelled) setOrphanIds(new Set())
      })
    return () => {
      cancelled = true
    }
  }, [documents.length])

  const filteredDocuments = useMemo(() => {
    const q = query.trim().toLowerCase()
    return documents.filter((doc) => {
      if (!isLibraryDocumentVisible(doc)) return false
      if (q && !doc.title.toLowerCase().includes(q)) return false
      if (favoritesOnly && !doc.isFavorite) return false
      if (activeTag && !doc.tags.includes(activeTag)) return false
      if (!documentMatchesMetaFilters(doc.tags, metaFilters)) return false
      if (
        !documentMatchesSmartFilter(doc, librarySmartFilter, {
          orphanIds,
          recentDocumentIds,
        })
      ) {
        return false
      }
      return true
    })
  }, [documents, query, favoritesOnly, activeTag, metaFilters, librarySmartFilter, orphanIds, recentDocumentIds])

  const tree = useMemo(() => buildTree(folders, filteredDocuments), [folders, filteredDocuments])
  const flatItems = useMemo(() => flattenTree(tree, expandedIds), [tree, expandedIds])

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateFlatItemSize(flatItems[index]!),
    overscan: 12,
    measureElement: (element) => element.getBoundingClientRect().height,
  })

  const moveDocument = useMoveDocumentToFolder()

  const toggleFolder = useCallback((id: string) => {
    dispatch(
      updateExpandedFolderIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
      ),
    )
  }, [dispatch])

  const handleCreateFolder = useCallback(async (parentId: string | null) => {
    const name = await promptInput({
      title: t('library.newFolder'),
      defaultValue: t('library.newFolder'),
      placeholder: t('library.folderNamePlaceholder'),
      confirmLabel: t('common.create'),
    })
    if (!name) return
    const folder = await createFolder({ name, parentId })
    if (parentId) {
      dispatch(updateExpandedFolderIds((prev) => (prev.includes(parentId) ? prev : [...prev, parentId])))
    }
    dispatch(updateFolders((prev) => [...prev, folder]))
    toast.success(t('toasts.folderCreated'), folder.name)
  }, [dispatch, t])

  const handleRenameFolder = useCallback(async (id: string, currentName: string) => {
    const name = await promptInput({
      title: t('library.renameFolder'),
      defaultValue: currentName,
      placeholder: t('library.folderNamePlaceholder'),
      confirmLabel: t('common.save'),
    })
    if (!name || name === currentName) return

    const previous = folders.find((item) => item.id === id)
    dispatch(
      updateFolders((prev) =>
        prev.map((item) => (item.id === id ? { ...item, name } : item)),
      ),
    )

    try {
      const folder = await renameFolder(id, name)
      dispatch(updateFolders((prev) => prev.map((item) => (item.id === id ? folder : item))))
      toast.success(t('toasts.folderRenamed'), folder.name)
    } catch (error) {
      if (previous) {
        dispatch(
          updateFolders((prev) => prev.map((item) => (item.id === id ? previous : item))),
        )
      }
      toast.error(t('toasts.folderRenameError'), String(error))
    }
  }, [dispatch, folders, t])

  const handleTrashFolderDocuments = useCallback(async (id: string, name: string, event: React.MouseEvent) => {
    event.stopPropagation()

    const subtreeIds = collectFolderSubtreeIds(folders, id)
    const documentCount = countDocumentsInFolders(documents, subtreeIds)
    if (documentCount === 0) {
      toast.info(t('toasts.folderEmpty'))
      return
    }

    const confirmed = await confirm(buildTrashFolderConfirmMessage(name, documentCount, t), {
      title: t('library.trashFolderTitle'),
      kind: 'warning',
      okLabel: t('library.trashFolderOk'),
      cancelLabel: t('common.cancel'),
    })
    if (!confirmed) return

    const trashedDocuments = documents.filter(
      (doc) => doc.folderId && subtreeIds.has(doc.folderId),
    )
    const trashedIds = trashedDocuments.map((doc) => doc.id)

    removeDocumentsFromLibraryUi({
      ids: trashedIds,
      documents,
      activeId,
      openDocumentIds,
      secondaryDocumentId,
      dispatch,
      navigate,
    })

    try {
      const result = await trashFolderDocuments(id)

      for (const documentId of result.trashedDocumentIds) {
        invalidateDocumentCache(documentId)
      }

      toast.success(
        t('toasts.documentTrashed'),
        t('library.documentCount', { count: result.trashedDocumentIds.length }),
      )
    } catch (error) {
      dispatch(updateDocuments((prev) => [...prev, ...trashedDocuments]))
      if (activeId && trashedIds.includes(activeId)) {
        dispatch(setActiveDocumentId(activeId))
        const cached = peekCachedDocument(activeId)
        if (cached) dispatch(setActiveDocument(cached))
        navigate(ROUTES.document(activeId))
      }
      toast.error(t('toasts.trashError'), String(error))
    }
  }, [activeId, dispatch, documents, folders, navigate, openDocumentIds, secondaryDocumentId, t])

  const handleDeleteFolder = useCallback(async (id: string, name: string, event: React.MouseEvent) => {
    event.stopPropagation()

    const subtreeIds = collectFolderSubtreeIds(folders, id)
    const documentCount = countDocumentsInFolders(documents, subtreeIds)
    const confirmed = await confirm(buildDeleteFolderConfirmMessage(name, documentCount, t), {
      title: t('library.deleteFolderTitle'),
      kind: 'warning',
      okLabel: t('library.deleteFolder'),
      cancelLabel: t('common.cancel'),
    })
    if (!confirmed) return

    const deletedFolders = folders.filter((item) => subtreeIds.has(item.id))
    const deletedDocuments = documents.filter(
      (doc) => doc.folderId && subtreeIds.has(doc.folderId),
    )
    const deletedFolderIds = new Set(deletedFolders.map((item) => item.id))
    const deletedDocumentIds = deletedDocuments.map((doc) => doc.id)
    const previousExpandedIds = expandedIds
    const previousActiveId = activeId

    dispatch(updateFolders((prev) => prev.filter((item) => !deletedFolderIds.has(item.id))))
    removeDocumentsFromLibraryUi({
      ids: deletedDocumentIds,
      documents,
      activeId,
      openDocumentIds,
      secondaryDocumentId,
      dispatch,
      navigate,
    })
    dispatch(
      updateExpandedFolderIds((prev) => prev.filter((folderId) => !deletedFolderIds.has(folderId))),
    )

    try {
      const result = await deleteFolder(id)

      for (const documentId of result.deletedDocumentIds) {
        invalidateDocumentCache(documentId)
      }

      toast.success(t('toasts.folderDeleted'), name)
    } catch (error) {
      dispatch(updateFolders((prev) => [...prev, ...deletedFolders]))
      dispatch(updateDocuments((prev) => [...prev, ...deletedDocuments]))
      dispatch(updateExpandedFolderIds(() => previousExpandedIds))
      if (previousActiveId && deletedDocumentIds.includes(previousActiveId)) {
        dispatch(setActiveDocumentId(previousActiveId))
        const cached = peekCachedDocument(previousActiveId)
        if (cached) dispatch(setActiveDocument(cached))
        navigate(ROUTES.document(previousActiveId))
      }
      toast.error(t('toasts.folderDeleteError'), String(error))
    }
  }, [activeId, dispatch, documents, expandedIds, folders, navigate, openDocumentIds, secondaryDocumentId, t])

  const handleDeleteDocument = useCallback(async (id: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const deleted = documents.find((doc) => doc.id === id)
    if (!deleted) return

    try {
      await trashDocuments({
        ids: [id],
        documents,
        activeId,
        openDocumentIds,
        secondaryDocumentId,
        dispatch,
        navigate,
      })
      toast.success(t('toasts.documentTrashed'), deleted.title.trim() || t('common.untitled'))
    } catch (error) {
      toast.error(t('toasts.trashError'), String(error))
    }
  }, [activeId, dispatch, documents, navigate, openDocumentIds, secondaryDocumentId, t])

  const openDocument = useCallback((id: string) => {
    dispatch(setActiveDocumentId(id))
    const cached = peekCachedDocument(id)
    if (cached) dispatch(setActiveDocument(cached))
    navigate(ROUTES.document(id))
    onNavigate?.()
  }, [dispatch, navigate, onNavigate])

  const handleToggleFavorite = useCallback(async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const current = documents.find((doc) => doc.id === id)
    if (!current) return
    const next = !current.isFavorite
    dispatch(
      updateDocuments((prev) =>
        prev.map((doc) => (doc.id === id ? { ...doc, isFavorite: next } : doc)),
      ),
    )
    try {
      await setDocumentFavorite(id, next)
    } catch (error) {
      dispatch(
        updateDocuments((prev) =>
          prev.map((doc) => (doc.id === id ? { ...doc, isFavorite: !next } : doc)),
        ),
      )
      toast.error(t('toasts.favoriteError'), String(error))
    }
  }, [dispatch, documents, t])

  const handleToggleDocumentPin = useCallback(async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const current = documents.find((doc) => doc.id === id)
    if (!current) return
    const next = !current.isPinned
    dispatch(
      updateDocuments((prev) =>
        prev.map((doc) => (doc.id === id ? { ...doc, isPinned: next } : doc)),
      ),
    )
    try {
      await setDocumentPinned(id, next)
    } catch (error) {
      dispatch(
        updateDocuments((prev) =>
          prev.map((doc) => (doc.id === id ? { ...doc, isPinned: !next } : doc)),
        ),
      )
      toast.error(t('toasts.pinError'), String(error))
    }
  }, [dispatch, documents, t])

  const handleToggleFolderPin = useCallback(async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const current = folders.find((folder) => folder.id === id)
    if (!current) return
    const next = !current.isPinned
    dispatch(
      updateFolders((prev) =>
        prev.map((folder) => (folder.id === id ? { ...folder, isPinned: next } : folder)),
      ),
    )
    try {
      await setFolderPinned(id, next)
    } catch (error) {
      dispatch(
        updateFolders((prev) =>
          prev.map((folder) => (folder.id === id ? { ...folder, isPinned: !next } : folder)),
        ),
      )
      toast.error(t('toasts.pinError'), String(error))
    }
  }, [dispatch, folders, t])

  const pinnedFolders = useMemo(
    () => folders.filter((folder) => folder.isPinned).sort((a, b) => a.name.localeCompare(b.name)),
    [folders],
  )
  const pinnedDocuments = useMemo(
    () =>
      documents
        .filter((doc) => doc.isPinned && doc.deletedAt == null)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [documents],
  )

  const handleEditTags = useCallback(async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const current = documents.find((doc) => doc.id === id)
    if (!current) return
    let description = t('library.documentTagsHint')
    try {
      const status = await nlpStatus()
      if (!status.enabled || !status.sidecarOk) {
        const hint = describeNlpTagSuggestionFailure(status, null)
        description = `${description}\n\n${hint.startsWith('nlp.') ? t(hint) : hint}`
      } else {
        const suggestions = await nlpSuggestTags(id)
        if (suggestions.tagSuggestions.length > 0) {
          description = `${description}\n\n${t('library.nlpTagSuggestions')}: ${suggestions.tagSuggestions.join(', ')}`
        }
      }
    } catch (error) {
      const status = await nlpStatus().catch(() => null)
      const hint = describeNlpTagSuggestionFailure(status, error)
      toast.error(t('library.nlpTagSuggestionsError'), hint.startsWith('nlp.') ? t(hint) : hint)
    }
    const value = await promptInput({
      title: t('library.documentTags'),
      description,
      defaultValue: current.tags.join(', '),
      placeholder: t('library.documentTagsHint'),
      confirmLabel: t('common.save'),
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
    const previousTags = current.tags
    dispatch(updateDocuments((prev) => prev.map((doc) => (doc.id === id ? { ...doc, tags } : doc))))
    try {
      await setDocumentTags(id, tags)
    } catch (error) {
      dispatch(
        updateDocuments((prev) =>
          prev.map((doc) => (doc.id === id ? { ...doc, tags: previousTags } : doc)),
        ),
      )
      toast.error(t('toasts.tagsError'), String(error))
    }
  }, [dispatch, documents, t])

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
      const previous = folders.find((item) => item.id === folderDragId)
      if (!previous) return

      dispatch(
        updateFolders((prev) =>
          prev.map((item) =>
            item.id === folderDragId ? { ...item, parentId: folderId } : item,
          ),
        ),
      )

      try {
        const folder = await moveFolder(folderDragId, folderId)
        dispatch(updateFolders((prev) => prev.map((item) => (item.id === folder.id ? folder : item))))
        toast.success(t('toasts.folderMoved'), folder.name)
      } catch (error) {
        dispatch(
          updateFolders((prev) =>
            prev.map((item) => (item.id === folderDragId ? previous : item)),
          ),
        )
        toast.error(t('toasts.folderMoveError'), String(error))
      }
    }
  }, [dispatch, documents, folders, moveDocument, t])

  const handleFolderDragStart = useCallback((id: string, event: React.DragEvent) => {
    setFolderDragData(event, id)
  }, [])

  const handleDocumentDragStart = useCallback((id: string, event: React.DragEvent) => {
    setDocumentDragData(event, id)
  }, [])

  const handleToggleSelect = useCallback(
    (id: string, event: React.MouseEvent) => {
      event.stopPropagation()
      dispatch(toggleSelectedDocument(id))
    },
    [dispatch],
  )

  const selectionProps = {
    isSelected: (id: string) => selectedDocumentIds.includes(id),
    onToggleSelect: handleToggleSelect,
  }

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
      {!query && (pinnedFolders.length > 0 || pinnedDocuments.length > 0) && (
        <div className="mb-2 border-b border-[var(--color-border)] pb-2">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
            {t('library.pinnedSection')}
          </p>
          {pinnedFolders.map((folder) => (
            <FolderTreeFolderRow
              key={`pin-folder-${folder.id}`}
              folder={folder}
              depth={0}
              documentCount={countDocumentsInFolders(
                documents,
                collectFolderSubtreeIds(folders, folder.id),
              )}
              isExpanded={expandedIds.includes(folder.id)}
              isDragOver={dragOverId === folder.id}
              onToggle={toggleFolder}
              onRename={(id, name) => void handleRenameFolder(id, name)}
              onCreateChild={(parentId) => void handleCreateFolder(parentId)}
              onTrashDocuments={(id, folderName, event) =>
                void handleTrashFolderDocuments(id, folderName, event)
              }
              onDelete={(id, folderName, event) => void handleDeleteFolder(id, folderName, event)}
              onTogglePin={(id, event) => void handleToggleFolderPin(id, event)}
              onDragStart={handleFolderDragStart}
              onDragOver={handleFolderDragOver}
              onDragLeave={handleFolderDragLeave}
              onDrop={(folderId, event) => void handleDropOnFolder(folderId, event)}
            />
          ))}
          {pinnedDocuments.map((document) => (
            <FolderTreeDocumentRow
              key={`pin-doc-${document.id}`}
              document={document}
              depth={0}
              isActive={activeId === document.id}
              isSelected={selectionProps.isSelected(document.id)}
              onOpen={openDocument}
              onDelete={(id, event) => void handleDeleteDocument(id, event)}
              onToggleFavorite={(id, event) => void handleToggleFavorite(id, event)}
              onTogglePin={(id, event) => void handleToggleDocumentPin(id, event)}
              onEditTags={(id, event) => void handleEditTags(id, event)}
              onToggleSelect={selectionProps.onToggleSelect}
              onDragStart={handleDocumentDragStart}
            />
          ))}
        </div>
      )}
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
            {query ? t('library.noResults') : t('library.noDocumentsYet')}
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
                      isExpanded={expandedIds.includes(item.folder.id)}
                      isDragOver={dragOverId === item.folder.id}
                      onToggle={toggleFolder}
                      onRename={(id, name) => void handleRenameFolder(id, name)}
                      onCreateChild={(parentId) => void handleCreateFolder(parentId)}
                      onTrashDocuments={(id, folderName, event) =>
                        void handleTrashFolderDocuments(id, folderName, event)
                      }
                      onDelete={(id, folderName, event) => void handleDeleteFolder(id, folderName, event)}
                      onTogglePin={(id, event) => void handleToggleFolderPin(id, event)}
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
                      isSelected={selectionProps.isSelected(item.document.id)}
                      onOpen={openDocument}
                      onDelete={(id, event) => void handleDeleteDocument(id, event)}
                      onToggleFavorite={(id, event) => void handleToggleFavorite(id, event)}
                      onTogglePin={(id, event) => void handleToggleDocumentPin(id, event)}
                      onEditTags={(id, event) => void handleEditTags(id, event)}
                      onToggleSelect={selectionProps.onToggleSelect}
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
