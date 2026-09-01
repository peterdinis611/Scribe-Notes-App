import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelLeftClose } from 'lucide-react'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { cn } from '@/lib/utils'
import {
  collectHeadingOutline,
  getActiveOutlineItemId,
  type DocumentOutlineItem,
} from '@/lib/editor/document-outline'
import { jumpToOutlineItem } from '@/lib/editor/outline-jump'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setDocumentTocLeftOpen } from '@/store/documentsSlice'

type DocumentTocRailProps = {
  editor: Editor | null
  scrollRef: React.RefObject<HTMLElement | null>
  scrollActiveId?: string | null
}

function TocRow({
  item,
  active,
  onSelect,
  rowRef,
}: {
  item: DocumentOutlineItem
  active: boolean
  onSelect: () => void
  rowRef?: (node: HTMLButtonElement | null) => void
}) {
  return (
    <button
      ref={rowRef}
      type="button"
      className={cn(
        'document-toc-rail-row',
        active && 'is-active',
      )}
      style={{ paddingLeft: `${10 + item.depth * 12}px` }}
      onClick={onSelect}
      title={item.preview || item.label}
    >
      <span className="document-toc-rail-label">{item.preview || item.label}</span>
    </button>
  )
}

export function DocumentTocRail({ editor, scrollRef, scrollActiveId = null }: DocumentTocRailProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const activeDocumentId = useAppSelector((state) => state.documents.activeDocumentId)
  const activeRowRef = useRef<HTMLButtonElement | null>(null)

  const outlineState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) {
        return { items: [] as DocumentOutlineItem[], caretActiveId: null as string | null }
      }
      const items = collectHeadingOutline(currentEditor)
      return {
        items,
        caretActiveId: getActiveOutlineItemId(items, currentEditor.state.selection.from),
      }
    },
  })

  const items = outlineState?.items ?? []
  const activeId =
    (scrollActiveId && items.some((item) => item.id === scrollActiveId) ? scrollActiveId : null) ??
    (outlineState?.caretActiveId && items.some((item) => item.id === outlineState.caretActiveId)
      ? outlineState.caretActiveId
      : null) ??
    items[0]?.id ??
    null

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  if (items.length === 0) return null

  return (
    <aside className="document-toc-rail titlebar-no-drag" aria-label={t('panels.outline.title')}>
      <div className="document-toc-rail-head">
        <span className="document-toc-rail-title">{t('panels.outline.title')}</span>
        <button
          type="button"
          className="document-toc-rail-close"
          aria-label={t('panels.outline.hideLeft')}
          onClick={() => dispatch(setDocumentTocLeftOpen(false))}
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="document-toc-rail-hint">{t('panels.outline.leftHint')}</p>
      <div className="document-toc-rail-list">
        {items.map((item) => (
          <TocRow
            key={item.id}
            item={item}
            active={activeId === item.id}
            rowRef={activeId === item.id ? (node) => { activeRowRef.current = node } : undefined}
            onSelect={() => {
              if (!editor) return
              jumpToOutlineItem(editor, scrollRef, item, activeDocumentId, dispatch)
            }}
          />
        ))}
      </div>
    </aside>
  )
}
