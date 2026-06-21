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
      className={cn('document-outline-item', active && 'is-active')}
      style={{ paddingLeft: `${12 + item.depth * 14}px` }}
      onClick={onSelect}
      title={item.preview || item.label}
    >
      <Icon className="document-outline-item-icon" aria-hidden="true" />
      <span className="document-outline-item-body">
        <span className="document-outline-item-label">{item.label}</span>
        {item.preview ? <span className="document-outline-item-preview">{item.preview}</span> : null}
      </span>
    </button>
  )
}

export function DocumentOutlinePanel({ editor, onClose }: DocumentOutlinePanelProps) {
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
    <aside className="document-outline-panel titlebar-no-drag" aria-label="Štruktúra dokumentu">
      <div className="document-outline-header">
        <div>
          <h2 className="document-outline-title">Štruktúra</h2>
          <p className="document-outline-subtitle">{items.length} elementov</p>
        </div>
        <button type="button" className="document-outline-close" aria-label="Skryť štruktúru" onClick={onClose}>
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      <div className="document-outline-list">
        {items.length === 0 ? (
          <p className="document-outline-empty">Dokument zatiaľ nemá žiadne bloky na zobrazenie.</p>
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
    </aside>
  )
}
