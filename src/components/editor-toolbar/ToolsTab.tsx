import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { Eye, EyeOff, History, Redo, SpellCheck, Trash2, Undo } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
import { cacheDocument } from '@/lib/cache/document-cache'
import { safeEditorCanRedo, safeEditorCanUndo, setEditorContent } from '@/lib/editor/view-ready'
import { cn, formatRelativeTime } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocument, updateDocuments } from '@/store/documentsSlice'
import { setSpellCheckEnabled } from '@/store/settingsSlice'

export function ToolsTab({ editor }: { editor: Editor }) {
  const { t } = useTranslation()
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const spellCheckEnabled = useAppSelector((state) => state.settings.spellCheckEnabled)
  const dispatch = useAppDispatch()
  const [revisions, setRevisions] = useState<DocumentRevision[]>([])

  const deleteState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      hasSelection: hasEditorSelection(currentEditor),
      canDeleteBlock: canDeleteCurrentBlock(currentEditor),
      blockDeleteLabel: getActiveBlockDeleteLabel(currentEditor),
      showInvisible: currentEditor.storage.invisibleCharacters.visibility(),
      canUndo: safeEditorCanUndo(currentEditor),
      canRedo: safeEditorCanRedo(currentEditor),
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
    try {
      const restored = cacheDocument(await restoreDocumentRevision(revisionId))
      dispatch(setActiveDocument(restored))
      dispatch(
        updateDocuments((prev) =>
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
        ),
      )
      setEditorContent(editor, JSON.parse(restored.contentJson), { emitUpdate: false })
      if (activeId) {
        const next = await listDocumentRevisions(activeId, 15)
        setRevisions(next)
      }
      toast.success(t('toolbar.toasts.revisionRestored'))
    } catch {
      toast.error(t('toolbar.toasts.revisionRestoreFailed'))
    }
  }

  const characters = editor.storage.characterCount.characters()
  const words = editor.storage.characterCount.words()

  return (
    <div className="toolbar-panel">
      <ToolbarGroup label={t('toolbar.groups.history')}>
        <ToolbarButton
          label={t('toolbar.actions.undo')}
          disabled={!deleteState.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton
          label={t('toolbar.actions.redo')}
          disabled={!deleteState.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="toolbar-btn" title={t('toolbar.actions.savedVersions')}>
              <History className="h-4 w-4 stroke-[1.75]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="revision-menu">
            {revisions.length === 0 ? (
              <DropdownMenuItem disabled>{t('toolbar.actions.noSavedVersions')}</DropdownMenuItem>
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

      <ToolbarGroup label={t('toolbar.groups.deletion')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'toolbar-btn',
                (deleteState.hasSelection || deleteState.canDeleteBlock) && 'is-active',
              )}
              title={t('editorActions.deleteSelection')}
            >
              <Trash2 className="h-4 w-4 stroke-[1.75]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px]">
            <DropdownMenuItem
              disabled={!deleteState.hasSelection}
              onClick={() => deleteEditorSelection(editor)}
            >
              {t('editorActions.deleteSelectedText')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!deleteState.canDeleteBlock}
              onClick={() => deleteCurrentBlock(editor)}
            >
              {deleteState.blockDeleteLabel ?? t('editorActions.deleteBlock')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
              {t('editorActions.clearFormatting')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-[var(--color-destructive)]"
              onClick={() => editor.chain().focus().clearContent().run()}
            >
              {t('editorActions.clearDocument')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>

      <ToolbarGroup label={t('toolbar.groups.display')}>
        <ToolbarButton
          label={spellCheckEnabled ? t('toolbar.actions.spellcheckOff') : t('toolbar.actions.spellcheckOn')}
          active={spellCheckEnabled}
          onClick={() => dispatch(setSpellCheckEnabled(!spellCheckEnabled))}
        >
          <SpellCheck className="h-4 w-4 stroke-[1.75]" />
        </ToolbarButton>
        <ToolbarButton
          label={deleteState.showInvisible ? t('toolbar.actions.hideInvisible') : t('toolbar.actions.showInvisible')}
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
        <span>{t('toolbar.stats.word', { count: words })}</span>
        <span className="toolbar-stats-sep">·</span>
        <span>{t('toolbar.stats.characters', { count: characters })}</span>
      </div>
    </div>
  )
}
