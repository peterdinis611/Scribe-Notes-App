import type { Editor } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()

  return (
    <div className="toolbar-panel">
      <ToolbarGroup label={t('toolbar.groups.alignment')}>
        <ToolbarButton
          label={t('toolbar.actions.alignLeft')}
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        >
          <AlignLeft className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton
          label={t('toolbar.actions.alignCenter')}
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        >
          <AlignCenter className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton
          label={t('toolbar.actions.alignRight')}
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          <AlignRight className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton
          label={t('toolbar.actions.alignJustify')}
          active={editor.isActive({ textAlign: 'justify' })}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        >
          <AlignJustify className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label={t('toolbar.groups.lists')}>
        <ToolbarButton
          label={t('toolbar.actions.bulletList')}
          active={editor.isActive('bulletList')}
          onClick={() => insertBulletList(editor)}
        >
          <List className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton
          label={t('toolbar.actions.orderedList')}
          active={editor.isActive('orderedList')}
          onClick={() => insertOrderedList(editor)}
        >
          <ListOrdered className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton
          label={t('toolbar.actions.taskList')}
          active={editor.isActive('taskList')}
          onClick={() => insertTaskList(editor)}
        >
          <CheckSquare className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label={t('toolbar.groups.blocks')}>
        <ToolbarButton
          label={t('toolbar.actions.quote')}
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton
          label={t('toolbar.actions.divider')}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton
          label={t('toolbar.actions.detailsBlock')}
          active={editor.isActive('details')}
          onClick={() => insertDetailsBlock(editor)}
        >
          <ListChevronsDownUp className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
      </ToolbarGroup>
    </div>
  )
}
