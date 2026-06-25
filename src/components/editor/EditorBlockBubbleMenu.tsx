import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import {
  canMoveBlockDown,
  canMoveBlockUp,
  getBlockPage,
  moveBlockDown,
  moveBlockToPage,
  moveBlockUp,
  shouldShowBlockMoveMenu,
} from '@/lib/editor/block-move'
import {
  canDeleteCurrentBlock,
  deleteCurrentBlock,
  getActiveBlockDeleteLabel,
  hasEditorSelection,
  shouldShowBlockBubble,
} from '@/lib/editor/delete-content'

type EditorBlockBubbleMenuProps = {
  editor: Editor | null
  pageCount: number
  canvasRef: React.RefObject<HTMLDivElement | null>
}

export function EditorBlockBubbleMenu({ editor, pageCount, canvasRef }: EditorBlockBubbleMenuProps) {
  if (!editor) return null

  const showDelete = shouldShowBlockBubble(editor)
  const blockPage = getBlockPage(editor, canvasRef.current)

  return (
    <BubbleMenu
      editor={editor}
      className="editor-bubble-menu editor-bubble-menu--block titlebar-no-drag"
      shouldShow={({ editor: currentEditor }) =>
        !hasEditorSelection(currentEditor) &&
        (shouldShowBlockMoveMenu(currentEditor) || shouldShowBlockBubble(currentEditor))
      }
    >
      {shouldShowBlockMoveMenu(editor) && (
        <>
          <button
            type="button"
            className="editor-bubble-icon-btn"
            disabled={!canMoveBlockUp(editor)}
            onClick={() => moveBlockUp(editor)}
            title="Presunúť vyššie"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="editor-bubble-icon-btn"
            disabled={!canMoveBlockDown(editor)}
            onClick={() => moveBlockDown(editor)}
            title="Presunúť nižšie"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          {pageCount > 1 && (
            <label className="editor-bubble-page-move">
              <span className="sr-only">Presunúť na stranu</span>
              <select
                className="editor-bubble-page-select"
                value={blockPage}
                onChange={(event) => {
                  const page = Number(event.target.value)
                  if (page !== blockPage) {
                    moveBlockToPage(editor, page, canvasRef.current, pageCount)
                  }
                }}
                title="Presunúť na stranu"
              >
                {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
                  <option key={page} value={page}>
                    Strana {page}
                  </option>
                ))}
              </select>
            </label>
          )}
          {showDelete && <span className="editor-bubble-divider" aria-hidden="true" />}
        </>
      )}

      {showDelete && (
        <button type="button" className="editor-bubble-btn" onClick={() => deleteCurrentBlock(editor)}>
          <Trash2 className="h-3.5 w-3.5" />
          {getActiveBlockDeleteLabel(editor) ?? 'Odstrániť'}
        </button>
      )}

      {canDeleteCurrentBlock(editor) && editor.isActive('image') && (
        <button
          type="button"
          className="editor-bubble-btn editor-bubble-btn--neutral"
          onClick={() => editor.chain().focus().setNodeSelection(editor.state.selection.from).run()}
        >
          Vybrať obrázok
        </button>
      )}
    </BubbleMenu>
  )
}
