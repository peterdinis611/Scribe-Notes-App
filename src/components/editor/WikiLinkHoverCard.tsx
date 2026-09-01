import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight } from 'lucide-react'
import { useEditorViewEffect } from '@/lib/editor/view-ready'
import { getDocument } from '@/lib/db/api'
import { navigateViaWikiLink } from '@/lib/navigation'
import { formatRelativeTime } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'

type HoverState = {
  targetId: string
  title: string
  snippet: string
  updatedAt: number | null
  x: number
  y: number
}

const SHOW_DELAY = 260
const MAX_SNIPPET = 200

function extractText(value: unknown, parts: string[]): void {
  if (parts.join(' ').length > MAX_SNIPPET + 40) return
  if (Array.isArray(value)) {
    for (const item of value) extractText(item, parts)
    return
  }
  if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>
    if (typeof node.text === 'string' && node.text.trim()) parts.push(node.text.trim())
    if (node.content) extractText(node.content, parts)
  }
}

function snippetFromContent(contentJson: string): string {
  try {
    const parts: string[] = []
    extractText(JSON.parse(contentJson), parts)
    const text = parts.join(' ').replace(/\s+/g, ' ').trim()
    return text.length > MAX_SNIPPET ? `${text.slice(0, MAX_SNIPPET)}…` : text
  } catch {
    return ''
  }
}

export function WikiLinkHoverCard({ editor }: { editor: Editor | null }) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const documents = useAppSelector((state) => state.documents.documents)
  const [hover, setHover] = useState<HoverState | null>(null)
  const timerRef = useRef<number | null>(null)
  const tokenRef = useRef(0)

  function openHovered(targetId: string) {
    navigateViaWikiLink({
      fromId: activeId,
      targetId,
      dispatch,
      navigate: (route) => void navigate(route),
    })
    tokenRef.current += 1
    setHover(null)
  }

  useEditorViewEffect(
    editor,
    (_editor, dom) => {
      const clear = () => {
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = null
        tokenRef.current += 1
        setHover(null)
      }

      const handleOver = (event: MouseEvent) => {
        const anchor = (event.target as HTMLElement | null)?.closest?.(
          'a[data-wiki-link]',
        ) as HTMLElement | null
        const targetId = anchor?.getAttribute('data-target-id')
        if (!anchor || !targetId) return

        if (timerRef.current) window.clearTimeout(timerRef.current)
        const rect = anchor.getBoundingClientRect()
        const token = ++tokenRef.current
        const summary = documents.find((doc) => doc.id === targetId)

        timerRef.current = window.setTimeout(() => {
          getDocument(targetId)
            .then((doc) => {
              if (tokenRef.current !== token) return
              setHover({
                targetId,
                title: doc.title || summary?.title || t('common.untitled'),
                snippet: snippetFromContent(doc.contentJson),
                updatedAt: doc.updatedAt ?? summary?.updatedAt ?? null,
                x: rect.left,
                y: rect.bottom + 6,
              })
            })
            .catch(() => {
              if (tokenRef.current !== token) return
              setHover({
                targetId,
                title: summary?.title ?? t('editorActions.documentNotFound'),
                snippet: '',
                updatedAt: summary?.updatedAt ?? null,
                x: rect.left,
                y: rect.bottom + 6,
              })
            })
        }, SHOW_DELAY)
      }

      const handleOut = (event: MouseEvent) => {
        const related = event.relatedTarget as HTMLElement | null
        if (related?.closest?.('.wiki-link-hover-card')) return
        if (related?.closest?.('a[data-wiki-link]')) return
        clear()
      }

      dom.addEventListener('mouseover', handleOver)
      dom.addEventListener('mouseout', handleOut)
      return () => {
        dom.removeEventListener('mouseover', handleOver)
        dom.removeEventListener('mouseout', handleOut)
        if (timerRef.current) window.clearTimeout(timerRef.current)
      }
    },
    [documents, t],
  )

  if (!hover) return null

  const left = Math.min(hover.x, window.innerWidth - 320)
  const top = Math.min(hover.y, window.innerHeight - 160)

  return (
    <div
      className="wiki-link-hover-card"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      role="tooltip"
      onMouseLeave={() => setHover(null)}
    >
      <div className="wiki-link-hover-title">{hover.title}</div>
      {hover.updatedAt != null && (
        <div className="wiki-link-hover-time">{t('wikiLink.modified', { time: formatRelativeTime(hover.updatedAt) })}</div>
      )}
      {hover.snippet ? (
        <p className="wiki-link-hover-snippet">{hover.snippet}</p>
      ) : (
        <p className="wiki-link-hover-snippet wiki-link-hover-snippet--empty">{t('wikiLink.emptyDocument')}</p>
      )}
      <p className="wiki-link-hover-hint">{t('wikiLink.previewHint')}</p>
      <button
        type="button"
        className="wiki-link-hover-open"
        onClick={() => openHovered(hover.targetId)}
      >
        {t('wikiLink.openDocument')}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
