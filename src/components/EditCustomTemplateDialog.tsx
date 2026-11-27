import { useEffect, useMemo, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Underline from '@tiptap/extension-underline'
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Plus,
  Quote,
  Underline as UnderlineIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { createAndStoreCategory } from '@/lib/db/template-collections'
import { useCustomCategoriesLive } from '@/hooks/useTemplateCollections'
import {
  BUILT_IN_TEMPLATE_CATEGORIES,
  getBuiltInCategoryLabel,
  type TemplateCategoryId,
} from '@/lib/templates'
import type { CustomDocumentTemplate } from '@/lib/templates/custom'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { IconTooltip } from '@/components/ui/tooltip'

export type EditCustomTemplateValues = {
  name: string
  description: string
  category: TemplateCategoryId
  title: string
  content: JSONContent
}

type EditCustomTemplateDialogProps = {
  open: boolean
  template: CustomDocumentTemplate | null
  onOpenChange: (open: boolean) => void
  onSave: (values: EditCustomTemplateValues) => void | Promise<void>
}

export function EditCustomTemplateDialog({
  open,
  template,
  onOpenChange,
  onSave,
}: EditCustomTemplateDialogProps) {
  const { t } = useTranslation()
  const { categories: customCategories } = useCustomCategoriesLive()
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TemplateCategoryId>('general')
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [saving, setSaving] = useState(false)

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
      }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: t('templates.editContentPlaceholder'),
      }),
    ],
    [t],
  )

  const editor = useEditor(
    {
      extensions,
      content: template?.content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
      editorProps: {
        attributes: {
          class: 'template-simple-editor__prose tiptap focus:outline-none',
        },
      },
    },
    [open, template?.id],
  )

  useEffect(() => {
    if (!open || !template) return
    setName(template.name)
    setTitle(template.title)
    setDescription(template.description)
    setCategory(template.category)
    setShowNewCategoryInput(false)
    setNewCategoryName('')
    setCreatingCategory(false)
    setSaving(false)
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(structuredClone(template.content), { emitUpdate: false })
    }
  }, [open, template, editor])

  useEffect(() => {
    if (open) return
    if (editor && !editor.isDestroyed) {
      editor.commands.clearContent(true)
    }
  }, [open, editor])

  function selectCategory(next: TemplateCategoryId) {
    setCategory(next)
    setShowNewCategoryInput(false)
    setNewCategoryName('')
  }

  async function handleCreateCategory() {
    const value = newCategoryName.trim()
    if (!value || creatingCategory) return
    setCreatingCategory(true)
    try {
      const created = await createAndStoreCategory(value, customCategories)
      selectCategory(created.id)
      toast.success(t('templates.categoryCreated'), created.name)
    } catch (error) {
      toast.error(t('templates.categoryCreateError'), String(error))
    } finally {
      setCreatingCategory(false)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!editor || !template || saving) return
    const nextTitle = title.trim()
    const nextName = name.trim() || nextTitle
    if (!nextTitle) return

    setSaving(true)
    try {
      await onSave({
        name: nextName,
        title: nextTitle,
        description: description.trim(),
        category,
        content: editor.getJSON(),
      })
      onOpenChange(false)
    } catch {
      // Parent shows toast; keep dialog open.
    } finally {
      setSaving(false)
    }
  }

  const canSave = Boolean(title.trim()) && Boolean(editor)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && template ? (
        <DialogContent className="titlebar-no-drag z-[90] flex max-h-[min(92vh,880px)] w-[min(920px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0">
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => void handleSubmit(e)}>
            <DialogHeader className="shrink-0 border-b border-[var(--color-border)] px-5 py-4">
              <DialogTitle>{t('templates.editTemplate')}</DialogTitle>
              <DialogDescription>{t('templates.editDialogDescription')}</DialogDescription>
            </DialogHeader>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-4 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div className="grid content-start gap-3">
                <label className="grid gap-1.5">
                  <span className="text-[12px] font-medium text-[var(--color-foreground)]">
                    {t('templates.nameLabel')}
                  </span>
                  <Input
                    value={name}
                    placeholder={t('templates.namePlaceholder')}
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                  />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[12px] font-medium text-[var(--color-foreground)]">
                    {t('templates.documentTitleLabel')}
                  </span>
                  <Input
                    value={title}
                    placeholder={t('templates.defaultDocumentTitle')}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[12px] font-medium text-[var(--color-foreground)]">
                    {t('templates.descriptionLabel')}
                  </span>
                  <Input
                    value={description}
                    placeholder={t('templates.descriptionPlaceholder')}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>

                <div className="grid gap-1.5">
                  <span className="text-[12px] font-medium text-[var(--color-foreground)]">
                    {t('templates.categoryLabel')}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {BUILT_IN_TEMPLATE_CATEGORIES.map((key) => (
                      <CategoryChip
                        key={key}
                        active={category === key}
                        onClick={() => selectCategory(key)}
                      >
                        {getBuiltInCategoryLabel(key)}
                      </CategoryChip>
                    ))}
                    {customCategories.map((item) => (
                      <CategoryChip
                        key={item.id}
                        active={category === item.id}
                        onClick={() => selectCategory(item.id)}
                      >
                        {item.name}
                      </CategoryChip>
                    ))}
                    <CategoryChip
                      active={showNewCategoryInput}
                      onClick={() => setShowNewCategoryInput((current) => !current)}
                    >
                      <Plus className="h-3 w-3" />
                      {t('templates.newCategoryChip')}
                    </CategoryChip>
                  </div>
                  {showNewCategoryInput ? (
                    <div className="flex gap-2">
                      <Input
                        value={newCategoryName}
                        placeholder={t('templates.newCategoryPlaceholder')}
                        onChange={(event) => setNewCategoryName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void handleCreateCategory()
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={!newCategoryName.trim() || creatingCategory}
                        onClick={() => void handleCreateCategory()}
                      >
                        {creatingCategory ? t('templates.saving') : t('templates.addCategory')}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="template-simple-editor flex min-h-[320px] flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-canvas)]">
                <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5">
                  <ToolbarButton
                    label={t('templates.editToolbar.bold')}
                    active={editor?.isActive('bold')}
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                  >
                    <Bold className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    label={t('templates.editToolbar.italic')}
                    active={editor?.isActive('italic')}
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                  >
                    <Italic className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    label={t('templates.editToolbar.underline')}
                    active={editor?.isActive('underline')}
                    onClick={() => editor?.chain().focus().toggleUnderline().run()}
                  >
                    <UnderlineIcon className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <span className="mx-1 h-4 w-px bg-[var(--color-border)]" aria-hidden />
                  <ToolbarButton
                    label={t('templates.editToolbar.heading2')}
                    active={editor?.isActive('heading', { level: 2 })}
                    onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                  >
                    <Heading2 className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    label={t('templates.editToolbar.heading3')}
                    active={editor?.isActive('heading', { level: 3 })}
                    onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                  >
                    <Heading3 className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <span className="mx-1 h-4 w-px bg-[var(--color-border)]" aria-hidden />
                  <ToolbarButton
                    label={t('templates.editToolbar.bulletList')}
                    active={editor?.isActive('bulletList')}
                    onClick={() => editor?.chain().focus().toggleBulletList().run()}
                  >
                    <List className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    label={t('templates.editToolbar.orderedList')}
                    active={editor?.isActive('orderedList')}
                    onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                  >
                    <ListOrdered className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    label={t('templates.editToolbar.taskList')}
                    active={editor?.isActive('taskList')}
                    onClick={() => editor?.chain().focus().toggleTaskList().run()}
                  >
                    <ListTodo className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    label={t('templates.editToolbar.blockquote')}
                    active={editor?.isActive('blockquote')}
                    onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                  >
                    <Quote className="h-3.5 w-3.5" />
                  </ToolbarButton>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  <EditorContent editor={editor} />
                </div>
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t border-[var(--color-border)] px-5 py-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="default" size="sm" disabled={!canSave || saving}>
                {saving ? t('templates.saving') : t('templates.saveChanges')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <IconTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-muted-foreground)] transition-colors',
          active
            ? 'bg-[var(--color-selection)] text-[var(--color-accent)]'
            : 'hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
        )}
      >
        {children}
      </button>
    </IconTooltip>
  )
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'titlebar-no-drag inline-flex h-7 items-center gap-1 rounded-full border px-3 text-[12px] transition-colors',
        active
          ? 'border-[var(--color-accent)] bg-[var(--color-selection)] font-medium text-[var(--color-accent)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
      )}
    >
      {children}
    </button>
  )
}
