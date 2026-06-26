import type { Editor } from '@tiptap/react'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  CheckSquare,
  List,
  ListChevronsDownUp,
  ListOrdered,
  Minus,
  Quote,
} from 'lucide-react'
import { ToolbarButton, ToolbarGroup } from '@/components/editor-toolbar/primitives'
import { insertDetailsBlock } from '@/lib/editor/insert-helpers'
import { insertBulletList, insertOrderedList, insertTaskList } from '@/lib/editor/list-commands'

export function LayoutTab({ editor }: { editor: Editor }) {
  return (
    <div className="toolbar-panel">
      <ToolbarGroup label="Zarovnanie">
        <ToolbarButton label="Vľavo" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          <AlignLeft className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Na stred" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          <AlignCenter className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Vpravo" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          <AlignRight className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Do bloku" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
          <AlignJustify className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label="Zoznamy">
        <ToolbarButton label="Odrážky" active={editor.isActive('bulletList')} onClick={() => insertBulletList(editor)}>
          <List className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Číslovaný zoznam" active={editor.isActive('orderedList')} onClick={() => insertOrderedList(editor)}>
          <ListOrdered className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Checklist" active={editor.isActive('taskList')} onClick={() => insertTaskList(editor)}>
          <CheckSquare className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label="Bloky">
        <ToolbarButton label="Citácia" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton label="Oddeľovač" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton
          label="Rozbaľovacia sekcia"
          active={editor.isActive('details')}
          onClick={() => insertDetailsBlock(editor)}
        >
          <ListChevronsDownUp className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>
    </div>
  )
}
