import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { LayoutTemplate, PlusSquare, Type, Wrench } from 'lucide-react'
import { InsertTab } from '@/components/editor-toolbar/InsertTab'
import { LayoutTab } from '@/components/editor-toolbar/LayoutTab'
import { TextTab } from '@/components/editor-toolbar/TextTab'
import { ToolsTab } from '@/components/editor-toolbar/ToolsTab'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'text', label: 'Text', icon: Type },
  { id: 'layout', label: 'Rozloženie', icon: LayoutTemplate },
  { id: 'insert', label: 'Vložiť', icon: PlusSquare },
  { id: 'tools', label: 'Nástroje', icon: Wrench },
] as const

type ToolbarTab = (typeof TABS)[number]['id']

interface EditorToolbarProps {
  editor: Editor | null
  onInsertImages: (files: File[]) => Promise<void>
}

export function EditorToolbar({ editor, onInsertImages }: EditorToolbarProps) {
  const [activeTab, setActiveTab] = useState<ToolbarTab>('text')

  if (!editor) return null

  return (
    <div className="editor-toolbar titlebar-no-drag">
      <div className="toolbar-tabs" role="tablist" aria-label="Nástroje editora">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            className={cn('toolbar-tab', activeTab === id && 'is-active')}
            onClick={() => setActiveTab(id)}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="toolbar-tab-label">{label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-body" role="tabpanel">
        {activeTab === 'text' && <TextTab editor={editor} />}
        {activeTab === 'layout' && <LayoutTab editor={editor} />}
        {activeTab === 'insert' && <InsertTab editor={editor} onInsertImages={onInsertImages} />}
        {activeTab === 'tools' && <ToolsTab editor={editor} />}
      </div>
    </div>
  )
}
