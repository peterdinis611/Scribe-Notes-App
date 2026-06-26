import { useEditorState, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { ListTree } from 'lucide-react'
import { collectHeadingEntries } from '@/lib/editor/table-of-contents'
import { cn } from '@/lib/utils'

export function TableOfContentsView({ editor, node, selected }: NodeViewProps) {
  const maxLevel = Number(node.attrs.maxLevel ?? 3)

  const headings = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => collectHeadingEntries(currentEditor, maxLevel),
  })

  function jumpTo(pos: number) {
    editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run()
  }

  return (
    <NodeViewWrapper
      as="nav"
      className={cn('table-of-contents-block titlebar-no-drag', selected && 'is-selected')}
      data-table-of-contents=""
      data-max-level={maxLevel}
      contentEditable={false}
    >
      <div className="table-of-contents-header">
        <ListTree className="h-4 w-4" />
        <span>Obsah</span>
      </div>

      {headings.length === 0 ? (
        <p className="table-of-contents-empty">Pridajte nadpisy (H1–H3) a obsah sa aktualizuje automaticky.</p>
      ) : (
        <ol className="table-of-contents-list">
          {headings.map((entry) => (
            <li
              key={`${entry.pos}-${entry.text}`}
              className="table-of-contents-item"
              data-level={entry.level}
              style={{ paddingLeft: `${(entry.level - 1) * 14}px` }}
            >
              <button type="button" className="table-of-contents-link" onClick={() => jumpTo(entry.pos)}>
                {entry.text}
              </button>
            </li>
          ))}
        </ol>
      )}
    </NodeViewWrapper>
  )
}
