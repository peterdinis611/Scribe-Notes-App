import { useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { Plus } from 'lucide-react'
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
  builtInCategoryLabels,
  type TemplateCategoryId,
} from '@/lib/templates'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

export type CustomTemplateDialogValues = {
  name: string
  description: string
  category: TemplateCategoryId
  title: string
}

type CustomTemplateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  content: JSONContent
  initialValues?: Partial<CustomTemplateDialogValues>
  onSave: (values: CustomTemplateDialogValues) => void
}

const defaultValues: CustomTemplateDialogValues = {
  name: '',
  description: '',
  category: 'general',
  title: 'Nový dokument',
}

export function CustomTemplateDialog({
  open,
  onOpenChange,
  content,
  initialValues,
  onSave,
}: CustomTemplateDialogProps) {
  const { categories: customCategories } = useCustomCategoriesLive()
  const [values, setValues] = useState<CustomTemplateDialogValues>(defaultValues)
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }

    if (wasOpenRef.current) return

    const title = initialValues?.title?.trim() || defaultValues.title
    const category = initialValues?.category ?? defaultValues.category
    setValues({
      name: initialValues?.name?.trim() || title,
      description: initialValues?.description ?? defaultValues.description,
      category,
      title,
    })
    setShowNewCategoryInput(false)
    setNewCategoryName('')
    setCreatingCategory(false)
    wasOpenRef.current = true
  }, [
    open,
    initialValues?.name,
    initialValues?.title,
    initialValues?.description,
    initialValues?.category,
  ])

  function update<K extends keyof CustomTemplateDialogValues>(
    key: K,
    value: CustomTemplateDialogValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function selectCategory(category: TemplateCategoryId) {
    update('category', category)
    setShowNewCategoryInput(false)
    setNewCategoryName('')
  }

  async function handleCreateCategory() {
    const name = newCategoryName.trim()
    if (!name || creatingCategory) return

    setCreatingCategory(true)
    try {
      const created = await createAndStoreCategory(name, customCategories)
      selectCategory(created.id)
      toast.success('Kategória vytvorená', created.name)
    } catch (error) {
      toast.error('Nepodarilo sa vytvoriť kategóriu', String(error))
    } finally {
      setCreatingCategory(false)
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const title = values.title.trim()
    const name = values.name.trim() || title
    if (!title) return

    onSave({
      ...values,
      name,
      title,
      description: values.description.trim(),
    })
    onOpenChange(false)
  }

  const paragraphCount = countTopLevelBlocks(content)
  const canSave = Boolean(values.title.trim())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent className="titlebar-no-drag z-[80] max-w-[440px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Vlastná šablóna</DialogTitle>
              <DialogDescription>
                Uloží sa lokálne do tohto počítača. Obsah má {paragraphCount}{' '}
                {paragraphCount === 1 ? 'blok' : paragraphCount < 5 ? 'bloky' : 'blokov'}.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-1">
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-[var(--color-foreground)]">
                  Názov šablóny
                </span>
                <Input
                  value={values.name}
                  placeholder="napr. Týždenný report"
                  onChange={(event) => update('name', event.target.value)}
                  autoFocus
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-[var(--color-foreground)]">
                  Predvolený názov dokumentu
                </span>
                <Input
                  value={values.title}
                  placeholder="Nový dokument"
                  onChange={(event) => update('title', event.target.value)}
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-[var(--color-foreground)]">
                  Popis
                </span>
                <Input
                  value={values.description}
                  placeholder="Krátky popis účelu šablóny"
                  onChange={(event) => update('description', event.target.value)}
                />
              </label>

              <div className="grid gap-1.5">
                <span className="text-[12px] font-medium text-[var(--color-foreground)]">
                  Kategória
                </span>

                <div className="flex flex-wrap gap-1.5">
                  {BUILT_IN_TEMPLATE_CATEGORIES.map((key) => (
                    <CategoryChip
                      key={key}
                      active={values.category === key}
                      onClick={() => selectCategory(key)}
                    >
                      {builtInCategoryLabels[key]}
                    </CategoryChip>
                  ))}
                  {customCategories.map((category) => (
                    <CategoryChip
                      key={category.id}
                      active={values.category === category.id}
                      onClick={() => selectCategory(category.id)}
                    >
                      {category.name}
                    </CategoryChip>
                  ))}
                  <CategoryChip
                    active={showNewCategoryInput}
                    onClick={() => setShowNewCategoryInput((current) => !current)}
                  >
                    <Plus className="h-3 w-3" />
                    Nová
                  </CategoryChip>
                </div>

                {showNewCategoryInput && (
                  <div className="flex gap-2">
                    <Input
                      value={newCategoryName}
                      placeholder="napr. Marketing"
                      onChange={(event) => setNewCategoryName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void handleCreateCategory()
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={!newCategoryName.trim() || creatingCategory}
                      onClick={() => void handleCreateCategory()}
                    >
                      {creatingCategory ? 'Ukladám…' : 'Pridať'}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Zrušiť
              </Button>
              <Button type="submit" variant="default" size="sm" disabled={!canSave}>
                Uložiť šablónu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
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

function countTopLevelBlocks(content: JSONContent): number {
  return Array.isArray(content.content) ? content.content.length : 0
}
