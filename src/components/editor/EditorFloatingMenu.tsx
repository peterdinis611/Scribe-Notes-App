import { useCallback, useEffect, useRef } from 'react'
import { FloatingMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { CheckSquare, Heading2, ImagePlus, List, Table2, X } from 'lucide-react'
import { pickImageFiles } from '@/lib/editor/image-utils'

const FLOATING_MENU_PLUGIN_KEY = 'floatingMenu'

type EditorFloatingMenuProps = {
  editor: Editor | null
  onInsertImages: (files: File[]) => Promise<void>
}

function getBlockPos(editor: Editor) {
  const { $from } = editor.state.selection
  return $from.before($from.depth)
}

function wouldShowFloatingMenu(editor: Editor) {
  const { $from, empty } = editor.state.selection
  if (!empty) return false

  const isEmptyTextblock = $from.parent.isTextblock && $from.parent.textContent.length === 0
  return isEmptyTextblock && editor.isEditable && !editor.isActive('table')
}

export function EditorFloatingMenu({ editor, onInsertImages }: EditorFloatingMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const dismissedBlockPosRef = useRef<number | null>(null)

  const dismissMenu = useCallback(() => {
    if (!editor || !wouldShowFloatingMenu(editor)) return

    dismissedBlockPosRef.current = getBlockPos(editor)
    editor.view.dispatch(editor.state.tr.setMeta(FLOATING_MENU_PLUGIN_KEY, 'hide'))
  }, [editor])

  useEffect(() => {
    if (!editor) return

    const resetDismissIfNeeded = () => {
      const blockPos = getBlockPos(editor)
      if (dismissedBlockPosRef.current !== null && dismissedBlockPosRef.current !== blockPos) {
        dismissedBlockPosRef.current = null
      }
    }

    const onUpdate = () => {
      resetDismissIfNeeded()

      const blockPos = getBlockPos(editor)
      if (dismissedBlockPosRef.current !== blockPos) return

      const { $from } = editor.state.selection
      if ($from.parent.textContent.length > 0) {
        dismissedBlockPosRef.current = null
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      if (!wouldShowFloatingMenu(editor)) return
      dismissMenu()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (!editor.isFocused || !wouldShowFloatingMenu(editor)) return
      event.preventDefault()
      dismissMenu()
    }

    editor.on('selectionUpdate', resetDismissIfNeeded)
    editor.on('update', onUpdate)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      editor.off('selectionUpdate', resetDismissIfNeeded)
      editor.off('update', onUpdate)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [editor, dismissMenu])

  if (!editor) return null

  async function handlePickImage() {
    const files = await pickImageFiles()
    if (files.length) await onInsertImages(files)
  }

  return (
    <FloatingMenu
      ref={menuRef}
      editor={editor}
      pluginKey={FLOATING_MENU_PLUGIN_KEY}
      className="editor-floating-menu titlebar-no-drag"
      shouldShow={({ editor: currentEditor, state }) => {
        const blockPos = state.selection.$from.before(state.selection.$from.depth)
        if (dismissedBlockPosRef.current === blockPos) return false

        const { $from } = state.selection
        const isEmptyTextblock = $from.parent.isTextblock && $from.parent.textContent.length === 0
        return isEmptyTextblock && currentEditor.isEditable && !currentEditor.isActive('table')
      }}
    >
      <button type="button" className="editor-floating-btn" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-4 w-4" />
        Nadpis
      </button>
      <button type="button" className="editor-floating-btn" onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-4 w-4" />
        Zoznam
      </button>
      <button type="button" className="editor-floating-btn" onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <CheckSquare className="h-4 w-4" />
        Úlohy
      </button>
      <button type="button" className="editor-floating-btn" onClick={() => void handlePickImage()}>
        <ImagePlus className="h-4 w-4" />
        Obrázok
      </button>
      <button
        type="button"
        className="editor-floating-btn"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <Table2 className="h-4 w-4" />
        Tabuľka
      </button>
      <button
        type="button"
        className="editor-floating-btn editor-floating-btn-dismiss"
        aria-label="Zavrieť"
        onClick={dismissMenu}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </FloatingMenu>
  )
}
