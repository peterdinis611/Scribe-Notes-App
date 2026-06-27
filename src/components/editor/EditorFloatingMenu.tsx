import { useCallback, useEffect, useRef, useState } from 'react'
import { FloatingMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import type { LucideIcon } from 'lucide-react'
import {
  CheckSquare,
  Heading2,
  ImagePlus,
  List,
  ListOrdered,
  Plus,
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

export function EditorFloatingMenu({ editor, onInsertImages }: EditorFloatingMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)

  const collapseMenu = useCallback(() => {
    setExpanded(false)
  }, [])

  useEffect(() => {
    if (!editor) return

    const onSelectionUpdate = () => {
      if (!shouldShowInsertMenu(editor, null)) {
        setExpanded(false)
      }
    }

    const onUpdate = () => {
      const { $from } = editor.state.selection
      if ($from.parent.textContent.length > 0) {
        setExpanded(false)
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!expanded) return
      if (menuRef.current?.contains(event.target as Node)) return
      setExpanded(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !editor.isFocused || !expanded) return
      event.preventDefault()
      setExpanded(false)
    }

    editor.on('selectionUpdate', onSelectionUpdate)
    editor.on('update', onUpdate)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      editor.off('selectionUpdate', onSelectionUpdate)
      editor.off('update', onUpdate)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [editor, expanded])

  if (!editor) return null

  async function handlePickImage() {
    const files = await pickImageFiles()
    if (files.length) await onInsertImages(files)
  }

  async function runInsertItem(item: QuickInsertItem) {
    await item.run(editor!)
    setExpanded(false)
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
      className={expanded ? 'editor-insert-menu titlebar-no-drag' : 'editor-insert-trigger-wrap titlebar-no-drag'}
      options={{
        placement: expanded ? 'bottom-start' : 'left',
        offset: expanded ? 8 : 6,
        flip: { padding: 12 },
        shift: { padding: 12 },
      }}
      shouldShow={({ editor: currentEditor }) => shouldShowInsertMenu(currentEditor, null)}
    >
      {!expanded ? (
        <button
          type="button"
          className="editor-insert-trigger"
          aria-label="Vložiť blok"
          title="Vložiť blok alebo napíšte /"
          onClick={() => setExpanded(true)}
        >
          <Plus className="h-4 w-4" />
        </button>
      ) : (
        <>
          <div className="editor-insert-menu-header">
            <div className="editor-insert-menu-heading">
              <p className="editor-insert-menu-title">Vložiť blok</p>
              <p className="editor-insert-menu-subtitle">Alebo napíšte / pre všetky príkazy</p>
            </div>
            <button
              type="button"
              className="editor-insert-menu-close"
              aria-label="Zavrieť"
              onClick={collapseMenu}
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
                  onClick={() => void runInsertItem(item)}
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
        </>
      )}
    </FloatingMenu>
  )
}
