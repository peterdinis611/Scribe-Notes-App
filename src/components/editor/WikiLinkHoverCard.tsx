import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { getDocument } from '@/lib/db/api'
import { formatRelativeTime } from '@/lib/utils'
import { useAppSelector } from '@/store/hooks'

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
  const documents = useAppSelector((state) => state.documents.documents)
  const [hover, setHover] = useState<HoverState | null>(null)
  const timerRef = useRef<number | null>(null)
  const tokenRef = useRef(0)

  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom

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
              title: doc.title || summary?.title || 'Bez názvu',
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
              title: summary?.title ?? 'Dokument sa nenašiel',
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
  }, [editor, documents])

  if (!hover) return null

  const left = Math.min(hover.x, window.innerWidth - 320)
  const top = Math.min(hover.y, window.innerHeight - 140)

  return (
    <div
      className="wiki-link-hover-card"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      role="tooltip"
    >
      <div className="wiki-link-hover-title">{hover.title}</div>
      {hover.updatedAt != null && (
        <div className="wiki-link-hover-time">Upravené {formatRelativeTime(hover.updatedAt)}</div>
      )}
      {hover.snippet ? (
        <p className="wiki-link-hover-snippet">{hover.snippet}</p>
      ) : (
        <p className="wiki-link-hover-snippet wiki-link-hover-snippet--empty">Prázdny dokument</p>
      )}
    </div>
  )
}
