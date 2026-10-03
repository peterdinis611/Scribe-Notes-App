import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Focus, Loader2, Maximize2, Tags, Trash2 } from 'lucide-react'
import {
  listLinkGraph,
  type LinkGraphEdge,
  type LinkGraphOrphan,
  type SearchHit,
} from '@/lib/db/api'
import { nlpSimilarDocuments, nlpStatus, nlpSuggestTags, type NlpEntity } from '@/lib/db/nlp-api'
import { degreeById, type ForceNodeKind } from '@/lib/link-graph/force-layout'
import { isUntitledOrphanTitle, partitionOrphans } from '@/lib/link-graph/orphan-cleanup'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { trashDocuments } from '@/lib/trash-document'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId } from '@/store/documentsSlice'
import { Button } from '@/components/ui/button'
import { LinkGraphEmptyState } from '@/components/LinkGraphEmptyState'
import { LinkGraphFlow } from '@/components/link-graph/LinkGraphFlow'

const NLP_ENTITY_DOC_CAP = 24

type GraphSeedNode = {
  id: string
  title: string
  orphan: boolean
  degree: number
  color?: string
  kind?: ForceNodeKind
}

function neighborIds(edges: LinkGraphEdge[], centerId: string): Set<string> {
  const ids = new Set<string>([centerId])
  for (const edge of edges) {
    if (edge.sourceId === centerId) ids.add(edge.targetId)
    if (edge.targetId === centerId) ids.add(edge.sourceId)
  }
  return ids
}

function hashHue(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash % 360
}

function colorForKey(key: string | null | undefined): string | undefined {
  if (!key) return undefined
  const hue = hashHue(key)
  return `hsl(${hue} 72% 58%)`
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function tagNodeId(tag: string): string {
  return `tag:${normalizeKey(tag)}`
}

function entityNodeId(kind: string, text: string): string {
  return `entity:${normalizeKey(kind)}:${normalizeKey(text)}`
}

function isSyntheticNodeId(id: string): boolean {
  return id.startsWith('tag:') || id.startsWith('entity:')
}

function parseTagFromNodeId(id: string, title: string): string | null {
  if (!id.startsWith('tag:')) return null
  const fromTitle = title.startsWith('#') ? title.slice(1).trim() : title.trim()
  return fromTitle || id.slice(4)
}

function collectVisible(
  edges: LinkGraphEdge[],
  orphans: LinkGraphOrphan[],
  centerId: string | null,
  showOrphans: boolean,
  aroundActive: boolean,
  titleById: Map<string, string>,
  documentFallback: string,
  options: {
    favoritesOnly: boolean
    tagFilter: string | null
    colorMode: 'none' | 'tag' | 'folder'
    metaById: Map<string, { tags: string[]; folderId: string | null; isFavorite: boolean }>
  },
): {
  nodes: GraphSeedNode[]
  visibleEdges: LinkGraphEdge[]
} {
  const focusIds = aroundActive && centerId ? neighborIds(edges, centerId) : null
  let visibleEdges = focusIds
    ? edges.filter((edge) => focusIds.has(edge.sourceId) && focusIds.has(edge.targetId))
    : edges

  const allowed = (id: string) => {
    const meta = options.metaById.get(id)
    if (options.favoritesOnly && !meta?.isFavorite) return false
    if (options.tagFilter) {
      if (!meta?.tags.some((tag) => tag.toLowerCase() === options.tagFilter!.toLowerCase())) {
        return false
      }
    }
    return true
  }

  if (options.favoritesOnly || options.tagFilter) {
    visibleEdges = visibleEdges.filter(
      (edge) => allowed(edge.sourceId) && allowed(edge.targetId),
    )
  }

  const degrees = degreeById(
    visibleEdges.map((edge) => ({ sourceId: edge.sourceId, targetId: edge.targetId })),
  )
  const ids = new Set<string>()
  const titles = new Map<string, string>(titleById)

  for (const edge of visibleEdges) {
    ids.add(edge.sourceId)
    ids.add(edge.targetId)
    titles.set(edge.sourceId, edge.sourceTitle)
    titles.set(edge.targetId, edge.targetTitle)
  }
  for (const orphan of orphans) {
    titles.set(orphan.id, orphan.title || documentFallback)
  }
  if (aroundActive && centerId && !ids.has(centerId) && allowed(centerId)) ids.add(centerId)

  const orphanIds = new Set(orphans.map((orphan) => orphan.id))

  function nodeColor(id: string): string | undefined {
    const meta = options.metaById.get(id)
    if (options.colorMode === 'tag') {
      const tag = meta?.tags[0]
      return colorForKey(tag ?? id)
    }
    if (options.colorMode === 'folder') {
      return colorForKey(meta?.folderId ?? id)
    }
    return undefined
  }

  const nodes: GraphSeedNode[] = [...ids]
    .filter((id) => allowed(id))
    .map((id) => ({
      id,
      title: titles.get(id) ?? documentFallback,
      orphan:
        orphanIds.has(id) &&
        !visibleEdges.some((edge) => edge.sourceId === id || edge.targetId === id),
      degree: degrees.get(id) ?? 0,
      color: nodeColor(id),
      kind: 'document' as const,
    }))

  if (showOrphans) {
    const placed = new Set(nodes.map((node) => node.id))
    for (const orphan of orphans) {
      if (placed.has(orphan.id)) continue
      if (aroundActive && centerId && orphan.id !== centerId) continue
      if (!allowed(orphan.id)) continue
      nodes.push({
        id: orphan.id,
        title: orphan.title || documentFallback,
        orphan: true,
        degree: 0,
        color: nodeColor(orphan.id),
        kind: 'document',
      })
    }
  }

  return { nodes, visibleEdges }
}

function filterGraphAround(
  nodes: GraphSeedNode[],
  edges: LinkGraphEdge[],
  centerId: string,
): { nodes: GraphSeedNode[]; visibleEdges: LinkGraphEdge[] } {
  const focusIds = neighborIds(edges, centerId)
  const visibleEdges = edges.filter(
    (edge) => focusIds.has(edge.sourceId) && focusIds.has(edge.targetId),
  )
  const degrees = degreeById(
    visibleEdges.map((edge) => ({ sourceId: edge.sourceId, targetId: edge.targetId })),
  )
  const filtered = nodes
    .filter((node) => focusIds.has(node.id))
    .map((node) => ({
      ...node,
      degree: degrees.get(node.id) ?? 0,
      orphan: node.orphan && (degrees.get(node.id) ?? 0) === 0,
    }))

  if (filtered.some((node) => node.id === centerId)) {
    return { nodes: filtered, visibleEdges }
  }

  const center = nodes.find((node) => node.id === centerId)
  if (center) {
    filtered.push({ ...center, degree: degrees.get(center.id) ?? 0 })
  }
  return { nodes: filtered, visibleEdges }
}

function buildEntityOverlay(
  documentNodes: GraphSeedNode[],
  metaById: Map<string, { tags: string[]; folderId: string | null; isFavorite: boolean }>,
  nlpByDocId: Map<string, NlpEntity[]>,
): { nodes: GraphSeedNode[]; edges: LinkGraphEdge[]; tagByNodeId: Map<string, string> } {
  const entityNodes = new Map<string, GraphSeedNode>()
  const edges: LinkGraphEdge[] = []
  const edgeKeys = new Set<string>()
  const tagByNodeId = new Map<string, string>()

  function addEdge(sourceId: string, sourceTitle: string, targetId: string, targetTitle: string) {
    const key = `${sourceId}->${targetId}`
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push({ sourceId, targetId, sourceTitle, targetTitle })
  }

  for (const doc of documentNodes) {
    if (doc.kind && doc.kind !== 'document') continue
    const meta = metaById.get(doc.id)
    const tags = meta?.tags ?? []
    for (const tag of tags) {
      const trimmed = tag.trim()
      if (!trimmed) continue
      const id = tagNodeId(trimmed)
      tagByNodeId.set(id, trimmed)
      if (!entityNodes.has(id)) {
        entityNodes.set(id, {
          id,
          title: `#${trimmed}`,
          orphan: false,
          degree: 0,
          color: colorForKey(trimmed),
          kind: 'tag',
        })
      }
      addEdge(doc.id, doc.title, id, `#${trimmed}`)
    }

    const entities = nlpByDocId.get(doc.id) ?? []
    for (const entity of entities) {
      const text = entity.text?.trim()
      const kind = entity.kind?.trim() || 'other'
      if (!text) continue
      const id = entityNodeId(kind, text)
      if (!entityNodes.has(id)) {
        entityNodes.set(id, {
          id,
          title: text,
          orphan: false,
          degree: 0,
          color: colorForKey(kind),
          kind: 'entity',
        })
      }
      addEdge(doc.id, doc.title, id, text)
    }
  }

  return { nodes: [...entityNodes.values()], edges, tagByNodeId }
}

function mergeWithDegrees(
  documentNodes: GraphSeedNode[],
  entityNodes: GraphSeedNode[],
  wikiEdges: LinkGraphEdge[],
  entityEdges: LinkGraphEdge[],
): { nodes: GraphSeedNode[]; visibleEdges: LinkGraphEdge[] } {
  const visibleEdges = [...wikiEdges, ...entityEdges]
  const degrees = degreeById(
    visibleEdges.map((edge) => ({ sourceId: edge.sourceId, targetId: edge.targetId })),
  )
  const nodes = [...documentNodes, ...entityNodes].map((node) => ({
    ...node,
    degree: degrees.get(node.id) ?? 0,
  }))
  return { nodes, visibleEdges }
}

export function LibraryLinkGraphView({
  initialAroundActive = false,
  onAroundActiveConsumed,
  variant = 'sidebar',
}: {
  initialAroundActive?: boolean
  onAroundActiveConsumed?: () => void
  variant?: 'sidebar' | 'page'
} = {}) {
  const isPage = variant === 'page'
  const [edges, setEdges] = useState<LinkGraphEdge[]>([])
  const [orphans, setOrphans] = useState<LinkGraphOrphan[]>([])
  const [loading, setLoading] = useState(true)
  const [showOrphans, setShowOrphans] = useState(false)
  const [showEntities, setShowEntities] = useState(false)
  const [entitiesLoading, setEntitiesLoading] = useState(false)
  const [nlpEntitiesByDoc, setNlpEntitiesByDoc] = useState<Map<string, NlpEntity[]>>(
    () => new Map(),
  )
  const [aroundActive, setAroundActive] = useState(initialAroundActive)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [colorMode, setColorMode] = useState<'none' | 'tag' | 'folder'>('tag')
  const [localCenterId, setLocalCenterId] = useState<string | null>(null)
  const [orphanSimilar, setOrphanSimilar] = useState<Array<{ id: string; title: string; similar: SearchHit[] }>>([])

  const nlpCacheRef = useRef<Map<string, NlpEntity[]>>(new Map())
  const tagByNodeIdRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (!initialAroundActive) return
    setAroundActive(true)
    onAroundActiveConsumed?.()
  }, [initialAroundActive, onAroundActiveConsumed])

  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const documents = useAppSelector((state) => state.documents.documents)
  const openDocumentIds = useAppSelector((state) => state.documents.openDocumentIds)
  const secondaryDocumentId = useAppSelector((state) => state.documents.secondaryDocumentId)
  const graphCenterId = localCenterId ?? activeId
  const documentsVersion = useAppSelector((state) => {
    const docs = state.documents.documents
    const active = state.documents.activeDocument
    return `${docs.length}:${active?.id ?? ''}:${active?.updatedAt ?? 0}`
  })
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const titleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const doc of documents) {
      if (doc.deletedAt == null) map.set(doc.id, doc.title)
    }
    return map
  }, [documents])

  const metaById = useMemo(() => {
    const map = new Map<string, { tags: string[]; folderId: string | null; isFavorite: boolean }>()
    for (const doc of documents) {
      if (doc.deletedAt != null) continue
      map.set(doc.id, {
        tags: doc.tags ?? [],
        folderId: doc.folderId ?? null,
        isFavorite: Boolean(doc.isFavorite),
      })
    }
    return map
  }, [documents])

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const meta of metaById.values()) {
      for (const tag of meta.tags) tags.add(tag)
    }
    return [...tags].sort((a, b) => a.localeCompare(b))
  }, [metaById])

  const [tagFilter, setTagFilter] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void listLinkGraph()
      .then((result) => {
        if (cancelled) return
        setEdges(result.edges)
        setOrphans(result.orphans)
      })
      .catch(() => {
        if (cancelled) return
        setEdges([])
        setOrphans([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [documentsVersion])

  useEffect(() => {
    if (!showOrphans || orphans.length === 0) {
      setOrphanSimilar([])
      return
    }
    let cancelled = false
    void nlpStatus()
      .then(async (status) => {
        if (!status.enabled || !status.sidecarOk) return []
        const slice = orphans.slice(0, 8)
        const rows = await Promise.all(
          slice.map(async (orphan) => {
            const similar = await nlpSimilarDocuments(orphan.id, 3).catch(() => [] as SearchHit[])
            return { id: orphan.id, title: orphan.title, similar: similar.filter((hit) => hit.documentId !== orphan.id) }
          }),
        )
        return rows.filter((row) => row.similar.length > 0)
      })
      .then((rows) => {
        if (!cancelled) setOrphanSimilar(rows ?? [])
      })
      .catch(() => {
        if (!cancelled) setOrphanSimilar([])
      })
    return () => {
      cancelled = true
    }
  }, [orphans, showOrphans])

  const centerIsSynthetic = Boolean(graphCenterId && isSyntheticNodeId(graphCenterId))

  const { nodes: wikiNodes, visibleEdges: wikiEdges } = useMemo(
    () =>
      collectVisible(
        edges,
        orphans,
        graphCenterId,
        showOrphans,
        // Synthetic centers (tag/entity) need the full filtered wiki set first;
        // neighborhood is applied after entity overlay merge.
        aroundActive && !centerIsSynthetic,
        titleById,
        t('common.document'),
        {
          favoritesOnly,
          tagFilter,
          colorMode,
          metaById,
        },
      ),
    [
      aroundActive,
      centerIsSynthetic,
      colorMode,
      edges,
      favoritesOnly,
      graphCenterId,
      metaById,
      orphans,
      showOrphans,
      t,
      tagFilter,
      titleById,
    ],
  )

  // Docs used for NLP fetch / tag overlay: ignore Around so entity focus can resolve neighbors.
  const overlaySourceNodes = useMemo(() => {
    if (!showEntities) return wikiNodes
    if (!aroundActive || !centerIsSynthetic) return wikiNodes
    return collectVisible(
      edges,
      orphans,
      graphCenterId,
      showOrphans,
      false,
      titleById,
      t('common.document'),
      {
        favoritesOnly,
        tagFilter,
        colorMode,
        metaById,
      },
    ).nodes
  }, [
    aroundActive,
    centerIsSynthetic,
    colorMode,
    edges,
    favoritesOnly,
    graphCenterId,
    metaById,
    orphans,
    showEntities,
    showOrphans,
    t,
    tagFilter,
    titleById,
    wikiNodes,
  ])

  useEffect(() => {
    if (!showEntities) {
      setEntitiesLoading(false)
      return
    }

    let cancelled = false
    const docIds = overlaySourceNodes
      .filter((node) => !isSyntheticNodeId(node.id))
      .map((node) => node.id)
      .slice(0, NLP_ENTITY_DOC_CAP)

    void (async () => {
      setEntitiesLoading(true)
      try {
        const status = await nlpStatus().catch(() => null)
        if (cancelled) return
        if (!status?.enabled || !status.sidecarOk) {
          setNlpEntitiesByDoc(new Map(nlpCacheRef.current))
          return
        }

        const missing = docIds.filter((id) => !nlpCacheRef.current.has(id))
        if (missing.length > 0) {
          const results = await Promise.allSettled(
            missing.map(async (documentId) => {
              const suggestions = await nlpSuggestTags(documentId)
              return { documentId, entities: suggestions.entities ?? [] }
            }),
          )
          if (cancelled) return
          for (const result of results) {
            if (result.status !== 'fulfilled') continue
            nlpCacheRef.current.set(result.value.documentId, result.value.entities)
          }
        }

        const next = new Map<string, NlpEntity[]>()
        for (const id of docIds) {
          next.set(id, nlpCacheRef.current.get(id) ?? [])
        }
        setNlpEntitiesByDoc(next)
      } finally {
        if (!cancelled) setEntitiesLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [overlaySourceNodes, showEntities])

  const { nodes: seedNodes, visibleEdges } = useMemo(() => {
    if (!showEntities) {
      tagByNodeIdRef.current = new Map()
      return { nodes: wikiNodes, visibleEdges: wikiEdges }
    }

    const baseDocs =
      aroundActive && centerIsSynthetic ? overlaySourceNodes : wikiNodes
    const baseWikiEdges =
      aroundActive && centerIsSynthetic
        ? collectVisible(
            edges,
            orphans,
            graphCenterId,
            showOrphans,
            false,
            titleById,
            t('common.document'),
            {
              favoritesOnly,
              tagFilter,
              colorMode,
              metaById,
            },
          ).visibleEdges
        : wikiEdges

    const overlay = buildEntityOverlay(baseDocs, metaById, nlpEntitiesByDoc)
    tagByNodeIdRef.current = overlay.tagByNodeId
    let merged = mergeWithDegrees(baseDocs, overlay.nodes, baseWikiEdges, overlay.edges)

    if (aroundActive && graphCenterId && centerIsSynthetic) {
      merged = filterGraphAround(merged.nodes, merged.visibleEdges, graphCenterId)
    }

    return merged
  }, [
    aroundActive,
    centerIsSynthetic,
    colorMode,
    edges,
    favoritesOnly,
    graphCenterId,
    metaById,
    nlpEntitiesByDoc,
    orphans,
    overlaySourceNodes,
    showEntities,
    showOrphans,
    t,
    tagFilter,
    titleById,
    wikiEdges,
    wikiNodes,
  ])

  const openDocument = useCallback(
    (id: string) => {
      dispatch(setActiveDocumentId(id))
      void navigate(ROUTES.document(id))
    },
    [dispatch, navigate],
  )

  const untitledOrphans = useMemo(() => partitionOrphans(orphans).untitled, [orphans])

  const archiveOrphans = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return
      try {
        const removed = await trashDocuments({
          ids,
          documents,
          activeId,
          openDocumentIds,
          secondaryDocumentId,
          dispatch,
          navigate,
        })
        if (removed.length) {
          setOrphans((prev) => prev.filter((orphan) => !ids.includes(orphan.id)))
          setOrphanSimilar((prev) => prev.filter((row) => !ids.includes(row.id)))
          toast.success(t('linkGraph.orphanArchiveUntitledDone', { count: removed.length }))
        }
      } catch (error) {
        toast.error(t('library.moveToTrash'), String(error))
      }
    },
    [activeId, dispatch, documents, navigate, openDocumentIds, secondaryDocumentId, t],
  )

  const activateTagNode = useCallback(
    (id: string, title: string) => {
      const fromMap = tagByNodeIdRef.current.get(id)
      const tag = fromMap ?? parseTagFromNodeId(id, title)
      if (tag) setTagFilter(tag)
      setLocalCenterId(null)
    },
    [],
  )

  const focusEntityNode = useCallback((id: string) => {
    setLocalCenterId(id)
    setAroundActive(true)
  }, [])

  const focusDocumentNode = useCallback(
    (id: string) => {
      setLocalCenterId(id)
      setAroundActive(true)
      dispatch(setActiveDocumentId(id))
    },
    [dispatch],
  )

  const shellClass = isPage ? 'link-graph-page-body' : 'px-3 py-3'
  const hasContent = edges.length > 0 || (showOrphans && orphans.length > 0)

  const toolbar = (
    <div
      className={cn(
        'link-graph-toolbar flex flex-wrap items-center gap-1',
        isPage ? 'link-graph-toolbar--overlay' : 'mb-2',
        isPage && 'mb-0 gap-1.5',
      )}
    >
      <Button
        type="button"
        variant={aroundActive ? 'default' : 'outline'}
        size="sm"
        className="h-7 gap-1 text-[11px]"
        disabled={!graphCenterId}
        title={t('linkGraph.filterAround')}
        onClick={() => {
          setAroundActive((value) => {
            if (value) setLocalCenterId(null)
            return !value
          })
        }}
      >
        <Focus className="h-3 w-3" />
        {t('linkGraph.filterAroundShort')}
      </Button>
      <Button
        type="button"
        variant={favoritesOnly ? 'default' : 'outline'}
        size="sm"
        className="h-7 text-[11px]"
        title={t('linkGraph.favoritesOnly')}
        onClick={() => setFavoritesOnly((value) => !value)}
      >
        {t('linkGraph.favoritesOnlyShort')}
      </Button>
      <Button
        type="button"
        variant={showOrphans ? 'default' : 'outline'}
        size="sm"
        className="h-7 text-[11px]"
        title={t('linkGraph.showOrphansTitle')}
        onClick={() => setShowOrphans((value) => !value)}
      >
        {t('linkGraph.showOrphans')}
      </Button>
      <Button
        type="button"
        variant={showEntities ? 'default' : 'outline'}
        size="sm"
        className="h-7 gap-1 text-[11px]"
        title={showEntities ? t('linkGraph.entitiesHint') : t('linkGraph.showEntities')}
        aria-pressed={showEntities}
        onClick={() => {
          setShowEntities((value) => {
            if (value) {
              if (localCenterId && isSyntheticNodeId(localCenterId)) {
                setLocalCenterId(null)
              }
            }
            return !value
          })
        }}
      >
        {entitiesLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Tags className="h-3 w-3" />
        )}
        {t('linkGraph.showEntitiesShort')}
      </Button>
      <Button
        type="button"
        variant={colorMode !== 'none' ? 'default' : 'outline'}
        size="sm"
        className="h-7 text-[11px]"
        title={t('linkGraph.colorMode')}
        onClick={() =>
          setColorMode((mode) =>
            mode === 'none' ? 'tag' : mode === 'tag' ? 'folder' : 'none',
          )
        }
      >
        {colorMode === 'none'
          ? t('linkGraph.colorNone')
          : colorMode === 'tag'
            ? t('linkGraph.colorTag')
            : t('linkGraph.colorFolder')}
      </Button>
      {allTags.length > 0 && (
        <select
          className="link-graph-tag-filter"
          value={tagFilter ?? ''}
          title={t('linkGraph.tagFilter')}
          onChange={(event) => setTagFilter(event.target.value || null)}
        >
          <option value="">{t('linkGraph.tagFilterAll')}</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              #{tag}
            </option>
          ))}
        </select>
      )}
      {!isPage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-[11px]"
          title={t('linkGraph.openFullMap')}
          onClick={() => void navigate(ROUTES.graph({ around: aroundActive }))}
        >
          <Maximize2 className="h-3 w-3" />
          {t('linkGraph.openFullMapShort')}
        </Button>
      )}
    </div>
  )

  if (loading) {
    return (
      <p
        className={cn(
          'text-center text-[12px] text-[var(--color-muted-foreground)]',
          isPage ? 'px-6 py-16' : 'px-3 py-6',
        )}
      >
        {t('linkGraph.loading')}
      </p>
    )
  }

  if (!hasContent) {
    return (
      <div className={cn(shellClass, isPage && 'relative flex min-h-0 flex-1 flex-col')}>
        {toolbar}
        <LinkGraphEmptyState
          orphanCount={orphans.length}
          showOrphans={showOrphans}
          compact={!isPage}
          onShowOrphans={() => setShowOrphans(true)}
        />
      </div>
    )
  }

  return (
    <div className={cn(shellClass, isPage && 'relative flex min-h-0 flex-1 flex-col')}>
      {toolbar}

      {!isPage && (
        <p className="mb-2 text-[11px] text-[var(--color-muted-foreground)]">
          {t('linkGraph.summary', {
            edges: visibleEdges.length,
            nodes: seedNodes.length,
          })}
          {showOrphans
            ? ` · ${t('linkGraph.orphanCount', {
                count: orphans.length,
              })}`
            : ''}
          {showEntities ? ` · ${t('linkGraph.entitiesHint')}` : ''}
          {entitiesLoading ? ` · ${t('linkGraph.loading')}` : ''}
        </p>
      )}

      {showOrphans && (orphanSimilar.length > 0 || untitledOrphans.length > 0) ? (
        <div className="library-orphan-cleanup mb-2">
          {untitledOrphans.length > 0 ? (
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                {t('linkGraph.orphanCleanupTitle')}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 gap-1 text-[10.5px]"
                onClick={() => void archiveOrphans(untitledOrphans.map((item) => item.id))}
              >
                <Trash2 className="h-3 w-3" />
                {t('linkGraph.orphanArchiveUntitled', { count: untitledOrphans.length })}
              </Button>
            </div>
          ) : null}
          {orphanSimilar.length > 0 ? (
            <ul className="library-orphan-rail">
              {orphanSimilar.map((row) => {
                const top = row.similar[0]
                return (
                  <li key={row.id}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => openDocument(row.id)}>
                        {row.title || t('libraryChat.untitled')}
                        {isUntitledOrphanTitle(row.title) ? (
                          <span className="ml-1 text-[10px] text-[var(--color-muted-foreground)]">
                            · {t('linkGraph.orphanUntitledBadge')}
                          </span>
                        ) : null}
                      </button>
                      {top ? (
                        <button
                          type="button"
                          className="text-[10.5px] text-[var(--color-accent)]"
                          onClick={() => openDocument(row.id)}
                          title={t('linkGraph.orphanSuggestHint', {
                            titles: row.similar
                              .slice(0, 2)
                              .map((hit) => hit.title)
                              .join(' · '),
                          })}
                        >
                          {t('linkGraph.orphanSuggestLink')} → {top.title}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-[10.5px] text-[var(--color-muted-foreground)]"
                        onClick={() => void archiveOrphans([row.id])}
                      >
                        {t('linkGraph.orphanArchiveOne')}
                      </button>
                    </div>
                    <span>
                      {row.similar
                        .slice(0, 2)
                        .map((hit) => hit.title)
                        .join(' · ')}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {seedNodes.length === 0 ? (
        <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-10 text-center text-[12px] text-[var(--color-muted-foreground)]">
          {aroundActive
            ? t('linkGraph.emptyAround')
            : showOrphans
              ? t('linkGraph.emptyOrphans')
              : t('linkGraph.empty')}
        </p>
      ) : (
        <div
          className={cn(
            'link-graph-canvas overflow-hidden',
            isPage ? 'link-graph-canvas--page min-h-0 flex-1' : 'rounded-xl border border-[var(--color-border)]',
          )}
        >
          {isPage && (
            <p className="link-graph-canvas-meta">
              {t('linkGraph.summary', {
                edges: visibleEdges.length,
                nodes: seedNodes.length,
              })}
              {showOrphans
                ? ` · ${t('linkGraph.orphanCount', { count: orphans.length })}`
                : ''}
              {showEntities ? ` · ${t('linkGraph.entitiesHint')}` : ''}
              {entitiesLoading ? ` · ${t('linkGraph.loading')}` : ''}
              {' · '}
              {t('linkGraph.obsidianHint')}
              {aroundActive ? ` · ${t('linkGraph.localGraphHint')}` : ''}
            </p>
          )}
          <LinkGraphFlow
            seeds={seedNodes}
            edges={visibleEdges}
            activeId={activeId}
            graphCenterId={graphCenterId}
            isPage={isPage}
            aroundActive={aroundActive}
            className={isPage ? 'h-full min-h-[min(78vh,900px)]' : 'h-[320px]'}
            onOpenDocument={openDocument}
            onActivateTag={activateTagNode}
            onFocusEntity={focusEntityNode}
            onFocusDocument={focusDocumentNode}
          />
        </div>
      )}

    </div>
  )
}
