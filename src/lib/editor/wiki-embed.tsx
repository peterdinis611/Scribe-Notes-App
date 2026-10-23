import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Columns2, ExternalLink, FileText, ListTodo } from 'lucide-react'
import { getDocument } from '@/lib/db/api'
import { nlpListOpenTasks } from '@/lib/db/nlp-api'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import {
  filterDocumentsByLiveQuery,
  formatAgendaEmbedLines,
  parseLiveQuery,
} from '@/lib/editor/live-query-embed'
import { findDocumentByTitleOrAlias } from '@/lib/library/wiki-aliases'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId, setSecondaryDocumentId } from '@/store/documentsSlice'
import { store } from '@/store/index'

function resolveTitle(title: string): { targetId: string | null; label: string; query: string | null } {
  const live = parseLiveQuery(title)
  if (live) {
    return { targetId: null, label: title, query: title }
  }
  const { documents: docs, activeDocumentId: activeId } = store.getState().documents
  const match = findDocumentByTitleOrAlias(docs, title, activeId)
  return match
    ? { targetId: match.id, label: match.title, query: null }
    : { targetId: null, label: title, query: null }
}

function WikiEmbedView({ node, selected }: NodeViewProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const targetId = (node.attrs.targetId as string | null) ?? null
  const label = (node.attrs.label as string) ?? t('common.untitled')
  const queryRaw = (node.attrs.query as string | null) ?? null
  const documents = useAppSelector((state) => state.documents.documents)
  const summary = useAppSelector((state) =>
    targetId
      ? state.documents.documents.find((doc) => doc.id === targetId && doc.deletedAt == null)
      : null,
  )
  const [excerpt, setExcerpt] = useState('')
  const [loading, setLoading] = useState(Boolean(targetId || queryRaw))
  const liveQuery = queryRaw ? parseLiveQuery(queryRaw) : null

  useEffect(() => {
    let cancelled = false
    if (liveQuery?.kind === 'agenda') {
      setLoading(true)
      void nlpListOpenTasks(120, null)
        .then((tasks) => {
          if (cancelled) return
          setExcerpt(formatAgendaEmbedLines(tasks).join('\n') || t('wikiEmbed.empty'))
        })
        .catch(() => {
          if (!cancelled) setExcerpt('')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => {
        cancelled = true
      }
    }
    if (liveQuery) {
      const rows = filterDocumentsByLiveQuery(documents, liveQuery)
      setExcerpt(
        rows.length
          ? rows.map((doc) => `• ${doc.title.trim() || t('common.untitled')}`).join('\n')
          : t('wikiEmbed.empty'),
      )
      setLoading(false)
      return
    }
    if (!targetId) {
      setExcerpt('')
      setLoading(false)
      return
    }
    setLoading(true)
    void getDocument(targetId)
      .then((doc) => {
        if (cancelled) return
        const plain = tiptapToPlainText(doc.contentJson)
        setExcerpt(plain.slice(0, 420))
      })
      .catch(() => {
        if (!cancelled) setExcerpt('')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [documents, liveQuery, t, targetId])

  function openTarget() {
    if (!targetId) return
    dispatch(setActiveDocumentId(targetId))
    void navigate(ROUTES.document(targetId))
  }

  function openInSplit() {
    if (!targetId) return
    dispatch(setSecondaryDocumentId(targetId))
  }

  const isQuery = Boolean(liveQuery)

  return (
    <NodeViewWrapper
      className={cn('wiki-embed', selected && 'is-selected', isQuery && 'is-query')}
      data-drag-handle
    >
      <div className="wiki-embed-card" contentEditable={false}>
        <div className="wiki-embed-head">
          {isQuery ? (
            <ListTodo className="h-3.5 w-3.5 opacity-70" />
          ) : (
            <FileText className="h-3.5 w-3.5 opacity-70" />
          )}
          <span className="wiki-embed-title">{summary?.title || label}</span>
          {targetId && (
            <>
              <button
                type="button"
                className="wiki-embed-open"
                onClick={openInSplit}
                title={t('wikiEmbed.openSplit')}
              >
                <Columns2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="wiki-embed-open"
                onClick={openTarget}
                title={t('wikiEmbed.open')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        <div className="wiki-embed-body whitespace-pre-wrap">
          {!targetId && !isQuery
            ? t('wikiEmbed.missing')
            : loading
              ? t('common.loading')
              : excerpt || t('wikiEmbed.empty')}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

export const WikiEmbed = Node.create({
  name: 'wikiEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      targetId: { default: null },
      label: { default: '' },
      query: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="wiki-embed"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'wiki-embed', class: 'wiki-embed' }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiEmbedView)
  },

  addInputRules() {
    return [
      new InputRule({
        find: /!\[\[([^[\]\n]+)]]$/,
        handler: ({ range, match, chain }) => {
          const title = match[1]?.trim()
          if (!title) return
          const { targetId, label, query } = resolveTitle(title)
          chain()
            .insertContentAt({ from: range.from, to: range.to }, {
              type: this.name,
              attrs: { targetId, label, query },
            })
            .run()
        },
      }),
    ]
  },
})
