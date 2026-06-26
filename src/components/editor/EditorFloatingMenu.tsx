import { useCallback, useEffect, useRef } from 'react'
import { FloatingMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import type { LucideIcon } from 'lucide-react'
import {
  CheckSquare,
  Heading2,
  ImagePlus,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Table2,
  X,
} from 'lucide-react'
import { pickImageFiles } from '@/lib/editor/image-utils'
import {
  insertBulletList,
  insertOrderedList,
  insertTaskList,
  shouldShowInsertMenu,
} from '@/lib/editor/list-commands'

const FLOATING_MENU_PLUGIN_KEY = 'floatingMenu'

type QuickInsertItem = {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  run: (editor: Editor) => void | Promise<void>
}

type EditorFloatingMenuProps = {
  editor: Editor | null
  onInsertImages: (files: File[]) => Promise<void>
}

function getBlockPos(editor: Editor) {
  const { $from } = editor.state.selection
  return $from.before($from.depth)
}

function wouldShowFloatingMenu(editor: Editor) {
  return shouldShowInsertMenu(editor, null)
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

  const quickInsertItems: QuickInsertItem[] = [
    {
      id: 'heading',
      label: 'Nadpis',
      hint: 'H2',
      icon: Heading2,
      run: (currentEditor) => {
        currentEditor.chain().focus().toggleHeading({ level: 2 }).run()
      },
    },
    {
      id: 'list',
      label: 'Zoznam',
      hint: 'Odrážky',
      icon: List,
      run: (currentEditor) => {
        insertBulletList(currentEditor)
      },
    },
    {
      id: 'ordered',
      label: 'Číslovaný',
      hint: '1. 2. 3.',
      icon: ListOrdered,
      run: (currentEditor) => {
        insertOrderedList(currentEditor)
      },
    },
    {
      id: 'tasks',
      label: 'Úlohy',
      hint: 'Checklist',
      icon: CheckSquare,
      run: (currentEditor) => {
        insertTaskList(currentEditor)
      },
    },
    {
      id: 'quote',
      label: 'Citácia',
      hint: 'Blok',
      icon: Quote,
      run: (currentEditor) => {
        currentEditor.chain().focus().toggleBlockquote().run()
      },
    },
    {
      id: 'code',
      label: 'Kód',
      hint: 'Blok',
      icon: SquareCode,
      run: (currentEditor) => {
        currentEditor.chain().focus().toggleCodeBlock().run()
      },
    },
    {
      id: 'table',
      label: 'Tabuľka',
      hint: '3×3',
      icon: Table2,
      run: (currentEditor) => {
        currentEditor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      },
    },
    {
      id: 'image',
      label: 'Obrázok',
      hint: 'Súbor',
      icon: ImagePlus,
      run: async () => {
        await handlePickImage()
      },
    },
  ]

  return (
    <FloatingMenu
      ref={menuRef}
      editor={editor}
      pluginKey={FLOATING_MENU_PLUGIN_KEY}
      className="editor-insert-menu titlebar-no-drag"
      options={{
        placement: 'bottom-start',
        offset: 8,
        flip: { padding: 12 },
        shift: { padding: 12 },
      }}
      shouldShow={({ editor: currentEditor }) =>
        shouldShowInsertMenu(currentEditor, dismissedBlockPosRef.current)
      }
    >
      <div className="editor-insert-menu-header">
        <div className="editor-insert-menu-heading">
          <p className="editor-insert-menu-title">Vložiť blok</p>
          <p className="editor-insert-menu-subtitle">Alebo napíšte / pre všetky príkazy</p>
        </div>
        <button
          type="button"
          className="editor-insert-menu-close"
          aria-label="Skryť menu"
          onClick={dismissMenu}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="editor-insert-menu-grid">
        {quickInsertItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              className="editor-insert-menu-item"
              onClick={() => void item.run(editor)}
            >
              <span className="editor-insert-menu-item-icon">
                <Icon className="h-4 w-4" />
              </span>
              <span className="editor-insert-menu-item-text">
                <span className="editor-insert-menu-item-label">{item.label}</span>
                <span className="editor-insert-menu-item-hint">{item.hint}</span>
              </span>
            </button>
          )
        })}
      </div>
    </FloatingMenu>
  )
}
