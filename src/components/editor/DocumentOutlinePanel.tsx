import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  Calculator,
  CheckSquare,
  ChevronRight,
  Code2,
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
}

function OutlineRow({
  item,
  active,
  onSelect,
}: {
  item: DocumentOutlineItem
  active: boolean
  onSelect: () => void
}) {
  const Icon = OUTLINE_ICONS[item.kind]

  return (
    <button
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

export function DocumentOutlinePanel({ editor, onClose }: DocumentOutlinePanelProps) {
  const { t } = useTranslation()
  const outlineState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) {
        return { items: [] as DocumentOutlineItem[], activeId: null as string | null }
      }

      const outlineItems = collectDocumentOutline(currentEditor)
      return {
        items: outlineItems,
        activeId: getActiveOutlineItemId(outlineItems, currentEditor.state.selection.from),
      }
    },
  })

  const items = outlineState?.items ?? []
  const activeId = outlineState?.activeId ?? null

  return (
    <EditorSidePanel width={280} className="titlebar-no-drag" aria-label={t('editorPanels.outline')}>
      <EditorSidePanelHeader
        title={t('panels.outline.title')}
        subtitle={t('panels.outline.elementCount', { count: items.length })}
        actions={
          <EditorSidePanelIconButton aria-label={t('panels.outline.hide')} onClick={onClose}>
            <PanelRightClose className="h-4 w-4" />
          </EditorSidePanelIconButton>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="px-2 py-3 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
            {t('panels.outline.empty')}
          </p>
        ) : (
          items.map((item) => (
            <OutlineRow
              key={item.id}
              item={item}
              active={activeId === item.id}
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
