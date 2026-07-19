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
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
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
  const { t } = useTranslation()
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
      label: t('floatingMenu.heading'),
      hint: t('floatingMenu.headingHint'),
      icon: Heading2,
      run: (currentEditor) => {
        currentEditor.chain().focus().toggleHeading({ level: 2 }).run()
      },
    },
    {
      id: 'list',
      label: t('floatingMenu.list'),
      hint: t('floatingMenu.listHint'),
      icon: List,
      run: (currentEditor) => {
        insertBulletList(currentEditor)
      },
    },
    {
      id: 'ordered',
      label: t('floatingMenu.ordered'),
      hint: t('floatingMenu.orderedHint'),
      icon: ListOrdered,
      run: (currentEditor) => {
        insertOrderedList(currentEditor)
      },
    },
    {
      id: 'tasks',
      label: t('floatingMenu.tasks'),
      hint: t('floatingMenu.tasksHint'),
      icon: CheckSquare,
      run: (currentEditor) => {
        insertTaskList(currentEditor)
      },
    },
    {
      id: 'quote',
      label: t('floatingMenu.quote'),
      hint: t('floatingMenu.quoteHint'),
      icon: Quote,
      run: (currentEditor) => {
        currentEditor.chain().focus().toggleBlockquote().run()
      },
    },
    {
      id: 'code',
      label: t('floatingMenu.code'),
      hint: t('floatingMenu.codeHint'),
      icon: SquareCode,
      run: (currentEditor) => {
        currentEditor.chain().focus().toggleCodeBlock().run()
      },
    },
    {
      id: 'table',
      label: t('floatingMenu.table'),
      hint: t('floatingMenu.tableHint'),
      icon: Table2,
      run: (currentEditor) => {
        currentEditor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      },
    },
    {
      id: 'image',
      label: t('floatingMenu.image'),
      hint: t('floatingMenu.imageHint'),
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
      className={cn(
        'titlebar-no-drag',
        expanded
          ? 'flex w-max max-w-[min(320px,calc(100vw-48px))] flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-background)] p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.14)]'
          : 'flex items-center',
      )}
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
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent bg-transparent text-[var(--color-muted-foreground)] opacity-55 transition-[opacity,background,color,border-color] duration-120 hover:border-[var(--color-border)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)] hover:opacity-100 focus-visible:border-[var(--color-border)] focus-visible:bg-[var(--color-hover)] focus-visible:text-[var(--color-foreground)] focus-visible:opacity-100"
          aria-label={t('editorActions.insertBlock')}
          title={t('editorActions.insertBlockHint')}
          onClick={() => setExpanded(true)}
        >
          <Plus className="h-4 w-4" />
        </button>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2.5 px-0.5 pt-0.5">
            <div className="min-w-0">
              <p className="m-0 text-[12px] font-bold tracking-[-0.01em] text-[var(--color-foreground)]">
                {t('editorActions.insertBlock')}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-muted-foreground)]">
                {t('floatingMenu.slashHint')}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-none bg-transparent text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]"
              aria-label={t('common.close')}
              onClick={collapseMenu}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5 max-[720px]:grid-cols-1">
            {quickInsertItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  className="flex min-h-[52px] items-center gap-2.5 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-left transition-[background,border-color,transform] duration-120 hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))] hover:bg-[var(--color-selection)]"
                  onClick={() => void runInsertItem(item)}
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-background)] text-[var(--color-accent)]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-px">
                    <span className="text-[12px] font-semibold text-[var(--color-foreground)]">
                      {item.label}
                    </span>
                    <span className="text-[10px] text-[var(--color-muted-foreground)]">{item.hint}</span>
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
