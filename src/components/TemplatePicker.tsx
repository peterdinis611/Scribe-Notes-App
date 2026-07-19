import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bookmark,
  Briefcase,
  FileText,
  Loader2,
  Palette,
  Plus,
  Search,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { confirm } from '@tauri-apps/plugin-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CustomTemplateDialog } from '@/components/CustomTemplateDialog'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  BUILT_IN_TEMPLATE_CATEGORIES,
  DOCUMENT_TEMPLATES,
  builtInCategoryLabels,
  createCustomTemplate,
  getCategoryLabel,
  isBuiltInCategory,
  isCustomTemplate,
  mergeTemplates,
  type DocumentTemplate,
  type TemplateCategoryId,
} from '@/lib/templates'
import type { CustomTemplateCategory } from '@/lib/templates/categories'
import { cn } from '@/lib/utils'
import { promptInput } from '@/lib/input-dialog'
import { toast } from '@/lib/toast'
import {
  createAndStoreCategory,
  deleteStoredCategory,
  deleteStoredTemplate,
  insertStoredTemplate,
} from '@/lib/db/template-collections'
import {
  useCustomCategoriesLive,
  useCustomTemplatesLive,
} from '@/hooks/useTemplateCollections'

interface TemplatePickerProps {
  open: boolean
  onClose: () => void
  onSelect: (template: DocumentTemplate) => Promise<void>
}

type TemplateCategoryFilter = 'all' | 'custom' | TemplateCategoryId

const builtInCategoryIcons: Record<
  (typeof BUILT_IN_TEMPLATE_CATEGORIES)[number],
  LucideIcon
> = {
  general: FileText,
  business: Briefcase,
  personal: User,
  creative: Palette,
}

const builtInCategoryPreviewClass: Record<
  (typeof BUILT_IN_TEMPLATE_CATEGORIES)[number],
  string
> = {
  general: 'bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-canvas))] text-[var(--color-accent)]',
  business: 'bg-[color-mix(in_srgb,#34c759_10%,var(--color-canvas))] text-[#248a3d]',
  personal: 'bg-[color-mix(in_srgb,#af52de_10%,var(--color-canvas))] text-[#9b44c8]',
  creative: 'bg-[color-mix(in_srgb,#ff9500_10%,var(--color-canvas))] text-[#c93400]',
}

const customCategoryPreviewClass =
  'bg-[color-mix(in_srgb,#5856d6_10%,var(--color-canvas))] text-[#4f46e5] dark:text-[#a5b4fc]'

const BLANK_TEMPLATE = DOCUMENT_TEMPLATES.find((template) => template.id === 'blank')!

export function TemplatePicker({ open, onClose, onSelect }: TemplatePickerProps) {
  const { t } = useTranslation()
  const { templates: customTemplates } = useCustomTemplatesLive()
  const { categories: customCategories } = useCustomCategoriesLive()
  const allTemplates = useMemo(
    () => mergeTemplates(DOCUMENT_TEMPLATES, customTemplates),
    [customTemplates],
  )

  const [category, setCategory] = useState<TemplateCategoryFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(BLANK_TEMPLATE.id)
  const [creating, setCreating] = useState(false)
  const [customDialogOpen, setCustomDialogOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setCategory('all')
    setQuery('')
    setSelectedId(BLANK_TEMPLATE.id)
    setCreating(false)
    setCustomDialogOpen(false)
  }, [open])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: allTemplates.length,
      custom: customTemplates.length,
    }
    for (const key of BUILT_IN_TEMPLATE_CATEGORIES) counts[key] = 0
    for (const item of customCategories) counts[item.id] = 0

    for (const template of allTemplates) {
      counts[template.category] = (counts[template.category] ?? 0) + 1
    }
    return counts
  }, [allTemplates, customCategories, customTemplates.length])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allTemplates.filter((template) => {
      if (category === 'custom' && !isCustomTemplate(template)) return false
      if (category !== 'all' && category !== 'custom' && template.category !== category) {
        return false
      }
      if (!q) return true
      const categoryLabel = getCategoryLabel(template.category, customCategories)
      return (
        template.name.toLowerCase().includes(q) ||
        template.description.toLowerCase().includes(q) ||
        categoryLabel.toLowerCase().includes(q)
      )
    })
  }, [allTemplates, category, customCategories, query])

  const showBlankHero = category === 'all' && !query.trim()
  const gridTemplates = showBlankHero
    ? filtered.filter((template) => template.id !== 'blank')
    : filtered

  const selectedTemplate =
    allTemplates.find((template) => template.id === selectedId) ?? BLANK_TEMPLATE

  useEffect(() => {
    if (filtered.some((template) => template.id === selectedId)) return
    setSelectedId(filtered[0]?.id ?? BLANK_TEMPLATE.id)
  }, [filtered, selectedId])

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    try {
      await onSelect(selectedTemplate)
    } catch {
      // Parent shows toast; keep dialog open for retry.
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteCustom() {
    if (!isCustomTemplate(selectedTemplate)) return
    const confirmed = await confirm(
      t('templates.deleteTemplateConfirm', { name: selectedTemplate.name }),
      {
        title: t('templates.deleteTemplateTitle'),
        kind: 'warning',
        okLabel: t('common.delete'),
        cancelLabel: t('common.cancel'),
      },
    )
    if (!confirmed) return
    try {
      await deleteStoredTemplate(selectedTemplate.id)
      setSelectedId(BLANK_TEMPLATE.id)
    } catch (error) {
      toast.error(t('templates.deleteTemplateError'), String(error))
    }
  }

  async function handleCreateCategory() {
    const name = await promptInput({
      title: t('templates.newCategoryTitle'),
      placeholder: t('templates.newCategoryPlaceholder'),
      confirmLabel: t('common.create'),
    })
    if (!name) return

    try {
      const created = await createAndStoreCategory(name, customCategories)
      setCategory(created.id)
      toast.success(t('templates.categoryCreated'), created.name)
    } catch (error) {
      toast.error(t('templates.categoryCreateError'), String(error))
    }
  }

  async function handleDeleteCategory(item: CustomTemplateCategory) {
    const templateCount = categoryCounts[item.id] ?? 0
    const templateNote =
      templateCount > 0
        ? t('templates.deleteCategoryMove', { count: templateCount })
        : ''
    const message = templateNote
      ? t('templates.deleteCategoryMessage', { name: item.name, note: templateNote })
      : t('templates.deleteCategoryConfirm', { name: item.name })

    const confirmed = await confirm(message, {
      title: t('templates.deleteCategoryTitle'),
      kind: 'warning',
    })
    if (!confirmed) return

    try {
      await deleteStoredCategory(item.id)
      if (category === item.id) setCategory('all')
      toast.success(t('templates.categoryDeleted'), item.name)
    } catch (error) {
      toast.error(t('templates.categoryDeleteError'), String(error))
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()} modal={!customDialogOpen}>
        {open && (
          <DialogContent
            className="flex h-[min(680px,calc(100vh-40px))] max-w-[720px] flex-col gap-0 overflow-hidden p-0"
            showClose
          >
            <div className="flex shrink-0 flex-col gap-1 border-b border-[var(--color-border)] px-5 pb-3.5 pt-[18px] pr-12">
              <h2 className="m-0 text-[18px] font-bold tracking-[-0.02em]">{t('templates.title')}</h2>
              <p className="m-0 text-[12px] text-[var(--color-muted-foreground)]">
                {t('templates.subtitle')}
              </p>
            </div>

            <div className="shrink-0 space-y-3 border-b border-[var(--color-border)] px-5 py-3">
              <div className="flex items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                  <Search className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
                  <Input
                    type="search"
                    value={query}
                    placeholder={t('templates.searchPlaceholder')}
                    className="h-auto border-none bg-transparent p-0 shadow-none focus-visible:shadow-none"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setCustomDialogOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('templates.customTemplate')}
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
                  {t('templates.all')}
                  <span className="ml-1 opacity-60">{categoryCounts.all}</span>
                </FilterChip>
                <FilterChip active={category === 'custom'} onClick={() => setCategory('custom')}>
                  {t('templates.customTemplates')}
                  <span className="ml-1 opacity-60">{categoryCounts.custom}</span>
                </FilterChip>
                {BUILT_IN_TEMPLATE_CATEGORIES.map((key) => (
                  <FilterChip key={key} active={category === key} onClick={() => setCategory(key)}>
                    {builtInCategoryLabels[key]}
                    <span className="ml-1 opacity-60">{categoryCounts[key] ?? 0}</span>
                  </FilterChip>
                ))}
              </div>

              <div className="rounded-[10px] border border-dashed border-[color-mix(in_srgb,var(--color-accent)_28%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_4%,var(--color-surface))] px-3 py-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
                    {t('templates.myCategories')}
                    {customCategories.length > 0 && (
                      <span className="ml-1.5 font-normal normal-case tracking-normal opacity-70">
                        ({customCategories.length})
                      </span>
                    )}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-[var(--color-accent)] hover:text-[var(--color-accent)]"
                    onClick={() => void handleCreateCategory()}
                  >
                    <Plus className="h-3 w-3" />
                    {t('templates.addCategory')}
                  </Button>
                </div>

                {customCategories.length === 0 ? (
                  <p className="m-0 text-[12px] text-[var(--color-muted-foreground)]">
                    {t('templates.noCustomCategories')}
                  </p>
                ) : (
                  <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {customCategories.map((item) => (
                      <CustomCategoryFilterChip
                        key={item.id}
                        active={category === item.id}
                        count={categoryCounts[item.id] ?? 0}
                        onSelect={() => setCategory(item.id)}
                        onDelete={() => void handleDeleteCategory(item)}
                      >
                        {item.name}
                      </CustomCategoryFilterChip>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-5">
                {showBlankHero && (
                  <TemplateCard
                    template={BLANK_TEMPLATE}
                    customCategories={customCategories}
                    selected={selectedId === BLANK_TEMPLATE.id}
                    variant="hero"
                    onSelect={() => setSelectedId(BLANK_TEMPLATE.id)}
                  />
                )}

                {gridTemplates.length > 0 ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
                    {gridTemplates.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        customCategories={customCategories}
                        selected={selectedId === template.id}
                        onSelect={() => setSelectedId(template.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-10 text-center text-[13px] text-[var(--color-muted-foreground)]">
                    <p>
                      {category !== 'all' || query.trim()
                        ? t('templates.noMatch')
                        : t('templates.noneYet')}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setQuery('')
                        setCategory('all')
                      }}
                    >
                      {t('templates.clearFilter')}
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="titlebar-interactive relative z-10 flex shrink-0 items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-3">
              <p className="m-0 inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-[var(--color-foreground)]">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
                <span className="truncate">{selectedTemplate.name}</span>
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {isCustomTemplate(selectedTemplate) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={creating}
                    className="text-[var(--color-destructive)] hover:text-[var(--color-destructive)]"
                    onClick={() => void handleDeleteCustom()}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('common.delete')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" disabled={creating} onClick={onClose}>
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  disabled={creating}
                  onClick={() => void handleCreate()}
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {creating ? t('templates.creating') : t('templates.createDocument')}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <CustomTemplateDialog
        open={customDialogOpen}
        onOpenChange={setCustomDialogOpen}
        content={structuredClone(selectedTemplate.content)}
        initialValues={{
          name:
            selectedTemplate.id === 'blank'
              ? selectedTemplate.name
              : `${selectedTemplate.name} ${t('common.copySuffix')}`,
          description: selectedTemplate.description,
          category: isCustomTemplate(selectedTemplate)
            ? selectedTemplate.category
            : selectedTemplate.category,
          title: selectedTemplate.title,
        }}
        onSave={(values) => {
          void (async () => {
            try {
              const created = createCustomTemplate({
                ...values,
                content: structuredClone(selectedTemplate.content),
              })
              await insertStoredTemplate(created)
              setSelectedId(created.id)
              setCategory('custom')
              toast.success(t('templates.templateSaved'), values.name)
            } catch (error) {
              toast.error(t('templates.templateSaveError'), String(error))
            }
          })()
        }}
      />
    </>
  )
}

function TemplateCard({
  template,
  customCategories,
  selected,
  variant = 'grid',
  onSelect,
}: {
  template: DocumentTemplate
  customCategories: CustomTemplateCategory[]
  selected: boolean
  variant?: 'grid' | 'hero'
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const categoryLabel = getCategoryLabel(template.category, customCategories)
  const CategoryIcon = isBuiltInCategory(template.category)
    ? builtInCategoryIcons[template.category]
    : Bookmark
  const previewClass = isBuiltInCategory(template.category)
    ? builtInCategoryPreviewClass[template.category]
    : customCategoryPreviewClass

  return (
    <button
      type="button"
      className={cn(
        'titlebar-no-drag flex w-full flex-col gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left transition-[border-color,box-shadow,background]',
        variant === 'hero' && 'sm:flex-row sm:items-center',
        selected &&
          'border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-selection)_65%,var(--color-surface))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_35%,transparent)]',
        !selected && 'hover:border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))]',
      )}
      onClick={onSelect}
    >
      <div
        className={cn(
          'flex h-[72px] w-full shrink-0 flex-col justify-between rounded-[10px] p-2.5',
          previewClass,
          variant === 'hero' && 'sm:h-20 sm:w-36',
        )}
      >
        <CategoryIcon className="h-4 w-4" />
        <div className="flex w-full flex-col gap-1" aria-hidden="true">
          <span className="block h-[3px] w-[72%] rounded-full bg-current opacity-20" />
          <span className="block h-[3px] w-[92%] rounded-full bg-current opacity-20" />
          <span className="block h-[3px] w-[56%] rounded-full bg-current opacity-20" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="m-0 text-[13px] font-semibold text-[var(--color-foreground)]">{template.name}</p>
          <Badge variant={selected ? 'accent' : 'muted'} className="shrink-0 text-[10px]">
            {categoryLabel}
          </Badge>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-[var(--color-muted-foreground)]">
          {template.description || t('templates.customTemplateFallback')}
        </p>
      </div>
    </button>
  )
}

function CustomCategoryFilterChip({
  active,
  count,
  onSelect,
  onDelete,
  children,
}: {
  active: boolean
  count: number
  onSelect: () => void
  onDelete: () => void
  children: React.ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'titlebar-no-drag inline-flex h-7 max-w-full items-center rounded-full border text-[12px] transition-colors',
        !active &&
          'border-[color-mix(in_srgb,#5856d6_35%,var(--color-border))] bg-[color-mix(in_srgb,#5856d6_6%,var(--color-surface))] text-[#4f46e5] dark:text-[#a5b4fc]',
        active &&
          'border-[var(--color-accent)] bg-[var(--color-selection)] font-medium text-[var(--color-accent)]',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="inline-flex h-full max-w-full items-center rounded-l-full pl-3 pr-1.5 hover:opacity-90"
      >
        <span className="truncate">{children}</span>
        <span className="ml-1 opacity-60">{count}</span>
      </button>
      <button
        type="button"
        aria-label={t('templates.deleteCategoryAria')}
        onClick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
        className={cn(
          'inline-flex h-full items-center rounded-r-full pr-2 pl-1 transition-colors',
          active
            ? 'text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]'
            : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
        )}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

function FilterChip({
  active,
  variant = 'default',
  onClick,
  children,
}: {
  active: boolean
  variant?: 'default' | 'custom'
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'titlebar-no-drag inline-flex h-7 max-w-full items-center rounded-full border px-3 text-[12px] transition-colors',
        variant === 'custom' && !active && 'border-[color-mix(in_srgb,#5856d6_35%,var(--color-border))] bg-[color-mix(in_srgb,#5856d6_6%,var(--color-surface))] text-[#4f46e5] dark:text-[#a5b4fc]',
        variant === 'default' && !active && 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted-foreground)]',
        active
          ? 'border-[var(--color-accent)] bg-[var(--color-selection)] font-medium text-[var(--color-accent)]'
          : 'hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
      )}
    >
      <span className="truncate">{children}</span>
    </button>
  )
}
