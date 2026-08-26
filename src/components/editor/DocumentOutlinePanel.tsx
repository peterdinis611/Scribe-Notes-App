import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  Calculator,
  CheckSquare,
  ChevronRight,
  Code2,
  GitBranch,
  Heading,
  Image,
  List,
  Minus,
  PanelRightClose,
  Quote,
  SquareSplitVertical,
  Table2,
  Text,
  Video,
} from 'lucide-react'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { cn } from '@/lib/utils'
import {
  collectDocumentOutline,
  collectHeadingOutline,
  focusOutlineItem,
  getActiveOutlineItemId,
  type DocumentOutlineItem,
  type DocumentOutlineKind,
} from '@/lib/editor/document-outline'
import {
  EditorSidePanel,
  EditorSidePanelHeader,
  EditorSidePanelIconButton,
} from '@/components/editor/EditorSidePanelPrimitives'

type DocumentOutlinePanelProps = {
  editor: Editor | null
  onClose: () => void
  /** Scroll-driven active heading id (preferred over caret when scrolling). */
  scrollActiveId?: string | null
}

const OUTLINE_ICONS: Record<DocumentOutlineKind, LucideIcon> = {
  heading: Heading,
  paragraph: Text,
  blockquote: Quote,
  codeBlock: Code2,
  horizontalRule: Minus,
  listItem: List,
  taskItem: CheckSquare,
  table: Table2,
  image: Image,
  youtube: Video,
  details: ChevronRight,
  pageBreak: SquareSplitVertical,
  mathInline: Calculator,
  mathBlock: Calculator,
  mermaidDiagram: GitBranch,
}

function OutlineRow({
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
  const Icon = OUTLINE_ICONS[item.kind]

  return (
    <button
      ref={rowRef}
      type="button"
      className={cn(
        'flex w-full items-start gap-2 rounded-lg border-none bg-transparent p-2 text-left hover:bg-[var(--color-selection)]',
        active && 'bg-[var(--color-selection)]',
      )}
      style={{ paddingLeft: `${12 + item.depth * 14}px` }}
      onClick={onSelect}
      title={item.preview || item.label}
    >
      <Icon
        className={cn(
          'mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]',
          active && 'text-[var(--color-accent)]',
        )}
        aria-hidden="true"
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            'text-[11px] font-bold text-[var(--color-muted-foreground)]',
            active && 'text-[var(--color-accent)]',
          )}
        >
          {item.label}
        </span>
        {item.preview ? (
          <span className="truncate text-[12px] leading-snug text-[var(--color-foreground)]">
            {item.preview}
          </span>
        ) : null}
      </span>
    </button>
  )
}

export function DocumentOutlinePanel({
  editor,
  onClose,
  scrollActiveId = null,
}: DocumentOutlinePanelProps) {
  const { t } = useTranslation()
  const [headingsOnly, setHeadingsOnly] = useState(true)
  const activeRowRef = useRef<HTMLButtonElement | null>(null)

  const outlineState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) {
        return {
          allItems: [] as DocumentOutlineItem[],
          headingItems: [] as DocumentOutlineItem[],
          caretActiveId: null as string | null,
        }
      }

      const allItems = collectDocumentOutline(currentEditor)
      const headingItems = collectHeadingOutline(currentEditor)
      return {
        allItems,
        headingItems,
        caretActiveId: getActiveOutlineItemId(allItems, currentEditor.state.selection.from),
      }
    },
  })

  const allItems = outlineState?.allItems ?? []
  const headingItems = outlineState?.headingItems ?? []
  const items = headingsOnly ? headingItems : allItems
  const caretActiveId = outlineState?.caretActiveId ?? null

  const activeId = useMemo(() => {
    if (scrollActiveId && items.some((item) => item.id === scrollActiveId)) {
      return scrollActiveId
    }
    if (headingsOnly && scrollActiveId) {
      return scrollActiveId
    }
    if (caretActiveId && items.some((item) => item.id === caretActiveId)) {
      return caretActiveId
    }
    return items[0]?.id ?? null
  }, [caretActiveId, headingsOnly, items, scrollActiveId])

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  return (
    <EditorSidePanel width={280} className="titlebar-no-drag" aria-label={t('editorPanels.outline')}>
      <EditorSidePanelHeader
        title={t('panels.outline.title')}
        subtitle={t('panels.outline.navHint')}
        actions={
          <EditorSidePanelIconButton aria-label={t('panels.outline.hide')} onClick={onClose}>
            <PanelRightClose className="h-4 w-4" />
          </EditorSidePanelIconButton>
        }
      />

      <div className="mx-3 mt-2 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
        <button
          type="button"
          className={cn(
            'flex-1 rounded-md border-none px-2 py-1.5 text-[11px] font-semibold',
            headingsOnly
              ? 'bg-[var(--color-accent)] text-white'
              : 'bg-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
          )}
          onClick={() => setHeadingsOnly(true)}
        >
          {t('panels.outline.headingsOnly')}
        </button>
        <button
          type="button"
          className={cn(
            'flex-1 rounded-md border-none px-2 py-1.5 text-[11px] font-semibold',
            !headingsOnly
              ? 'bg-[var(--color-accent)] text-white'
              : 'bg-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
          )}
          onClick={() => setHeadingsOnly(false)}
        >
          {t('panels.outline.allBlocks')}
        </button>
      </div>

      <p className="m-0 mx-3 mt-2 text-[10px] leading-snug text-[var(--color-muted-foreground)]">
        {headingsOnly
          ? t('panels.outline.headingsHint')
          : t('panels.outline.elementCount', { count: items.length })}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="px-2 py-3 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
            {headingsOnly ? t('panels.outline.emptyHeadings') : t('panels.outline.empty')}
          </p>
        ) : (
          items.map((item) => (
            <OutlineRow
              key={item.id}
              item={item}
              active={activeId === item.id}
              rowRef={activeId === item.id ? (node) => { activeRowRef.current = node } : undefined}
              onSelect={() => {
                if (!editor) return
                focusOutlineItem(editor, item)
              }}
            />
          ))
        )}
      </div>
    </EditorSidePanel>
  )
}
