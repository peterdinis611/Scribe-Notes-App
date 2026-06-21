import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Eye, EyeOff, History, Redo, Trash2, Undo } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ToolbarButton, ToolbarGroup } from '@/components/editor-toolbar/primitives'
import {
  canDeleteCurrentBlock,
  deleteCurrentBlock,
  deleteEditorSelection,
  getActiveBlockDeleteLabel,
  hasEditorSelection,
} from '@/lib/editor/delete-content'
import { listDocumentRevisions, restoreDocumentRevision, type DocumentRevision } from '@/lib/db/api'
import { cn, formatRelativeTime } from '@/lib/utils'
import { activeDocumentAtom, activeDocumentIdAtom, documentsAtom } from '@/store/documents'

export function ToolsTab({ editor }: { editor: Editor }) {
  const activeId = useAtomValue(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const [revisions, setRevisions] = useState<DocumentRevision[]>([])

  const deleteState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      hasSelection: hasEditorSelection(currentEditor),
      canDeleteBlock: canDeleteCurrentBlock(currentEditor),
      blockDeleteLabel: getActiveBlockDeleteLabel(currentEditor),
      showInvisible: currentEditor.storage.invisibleCharacters.visibility(),
      canUndo: currentEditor.can().undo(),
      canRedo: currentEditor.can().redo(),
    }),
  })

  useEffect(() => {
    if (!activeId) {
      setRevisions([])
      return
    }
    void listDocumentRevisions(activeId, 15).then(setRevisions).catch(() => setRevisions([]))
  }, [activeId])

  async function handleRestoreRevision(revisionId: string) {
    const restored = await restoreDocumentRevision(revisionId)
    setActiveDocument(restored)
    setDocuments((prev) =>
      prev.map((item) =>
        item.id === restored.id
          ? {
              ...item,
              title: restored.title,
              filePath: restored.filePath,
              updatedAt: restored.updatedAt,
            }
          : item,
      ),
    )
    editor.commands.setContent(JSON.parse(restored.contentJson), { emitUpdate: false })
    if (activeId) {
      const next = await listDocumentRevisions(activeId, 15)
      setRevisions(next)
    }
  }

  const characters = editor.storage.characterCount.characters()
  const words = editor.storage.characterCount.words()

  return (
    <div className="toolbar-panel">
      <ToolbarGroup label="História">
        <ToolbarButton
          label="Späť (⌘Z)"
          disabled={!deleteState.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton
          label="Znovu (⌘⇧Z)"
          disabled={!deleteState.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-btn" title="Uložené verzie dokumentu">
              <History className="h-4 w-4 stroke-[1.75]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="revision-menu">
            {revisions.length === 0 ? (
              <DropdownMenuItem disabled>Žiadne uložené verzie</DropdownMenuItem>
            ) : (
              revisions.map((revision) => (
                <DropdownMenuItem
                  key={revision.id}
                  onClick={() => void handleRestoreRevision(revision.id)}
                >
                  <span className="revision-menu-title">{revision.title}</span>
                  <span className="revision-menu-time">{formatRelativeTime(revision.createdAt)}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>

      <ToolbarGroup label="Mazanie">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'toolbar-btn',
                (deleteState.hasSelection || deleteState.canDeleteBlock) && 'is-active',
              )}
              title="Odstrániť"
            >
              <Trash2 className="h-4 w-4 stroke-[1.75]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px]">
            <DropdownMenuItem
              disabled={!deleteState.hasSelection}
              onClick={() => deleteEditorSelection(editor)}
            >
              Odstrániť výber
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!deleteState.canDeleteBlock}
              onClick={() => deleteCurrentBlock(editor)}
            >
              {deleteState.blockDeleteLabel ?? 'Odstrániť blok'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
              Odstrániť formátovanie
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-[var(--color-destructive)]"
              onClick={() => editor.chain().focus().clearContent().run()}
            >
              Vyčistiť celý dokument
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>

      <ToolbarGroup label="Zobrazenie">
        <ToolbarButton
          label={deleteState.showInvisible ? 'Skryť neviditeľné znaky' : 'Zobraziť neviditeľné znaky'}
          active={deleteState.showInvisible}
          onClick={() => editor.chain().focus().toggleInvisibleCharacters().run()}
        >
          {deleteState.showInvisible ? (
            <EyeOff className="h-4 w-4 stroke-[1.75]" />
          ) : (
            <Eye className="h-4 w-4 stroke-[1.75]" />
          )}
        </ToolbarButton>
      </ToolbarGroup>

      <div className="toolbar-stats" aria-live="polite">
        <span>{words} {words === 1 ? 'slovo' : words < 5 ? 'slová' : 'slov'}</span>
        <span className="toolbar-stats-sep">·</span>
        <span>{characters} znakov</span>
      </div>
    </div>
  )
}
