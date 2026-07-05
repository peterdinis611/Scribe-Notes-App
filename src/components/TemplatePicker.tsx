import { useEffect, useMemo, useState } from 'react'
import {
  Briefcase,
  FileText,
  Loader2,
  Palette,
  Search,
  Sparkles,
  User,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DOCUMENT_TEMPLATES, type DocumentTemplate } from '@/lib/templates'
import { cn } from '@/lib/utils'

interface TemplatePickerProps {
  open: boolean
  onClose: () => void
  onSelect: (template: DocumentTemplate) => Promise<void>
}

const categoryLabels: Record<DocumentTemplate['category'], string> = {
  general: 'Všeobecné',
  business: 'Biznis',
  personal: 'Osobné',
  creative: 'Kreatívne',
}

const categoryIcons: Record<DocumentTemplate['category'], LucideIcon> = {
  general: FileText,
  business: Briefcase,
  personal: User,
  creative: Palette,
}

const categoryPreviewClass: Record<DocumentTemplate['category'], string> = {
  general: 'bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-canvas))] text-[var(--color-accent)]',
  business: 'bg-[color-mix(in_srgb,#34c759_10%,var(--color-canvas))] text-[#248a3d]',
  personal: 'bg-[color-mix(in_srgb,#af52de_10%,var(--color-canvas))] text-[#9b44c8]',
  creative: 'bg-[color-mix(in_srgb,#ff9500_10%,var(--color-canvas))] text-[#c93400]',
}

const BLANK_TEMPLATE = DOCUMENT_TEMPLATES.find((template) => template.id === 'blank')!

export function TemplatePicker({ open, onClose, onSelect }: TemplatePickerProps) {
  const [category, setCategory] = useState<DocumentTemplate['category'] | 'all'>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(BLANK_TEMPLATE.id)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open) return
    setCategory('all')
    setQuery('')
    setSelectedId(BLANK_TEMPLATE.id)
    setCreating(false)
  }, [open])

  const categoryCounts = useMemo(() => {
    const counts: Record<DocumentTemplate['category'] | 'all', number> = {
      all: DOCUMENT_TEMPLATES.length,
      general: 0,
      business: 0,
      personal: 0,
      creative: 0,
    }
    for (const template of DOCUMENT_TEMPLATES) {
      counts[template.category] += 1
    }
    return counts
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return DOCUMENT_TEMPLATES.filter((template) => {
      if (category !== 'all' && template.category !== category) return false
      if (!q) return true
      return (
        template.name.toLowerCase().includes(q) ||
        template.description.toLowerCase().includes(q) ||
        categoryLabels[template.category].toLowerCase().includes(q)
      )
    })
  }, [category, query])

  const showBlankHero = category === 'all' && !query.trim()
  const gridTemplates = showBlankHero
    ? filtered.filter((template) => template.id !== 'blank')
    : filtered

  const selectedTemplate =
    DOCUMENT_TEMPLATES.find((template) => template.id === selectedId) ?? BLANK_TEMPLATE

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

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && (
        <DialogContent
          className="flex h-[min(680px,calc(100vh-40px))] max-w-[720px] flex-col gap-0 overflow-hidden p-0"
          showClose
        >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 pb-3.5 pt-[18px]">
          <div>
            <h2 className="m-0 text-[18px] font-bold tracking-[-0.02em]">Nový dokument</h2>
            <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
              Vyberte šablónu alebo začnite od prázdnej stránky
            </p>
          </div>
        </div>

        <div className="shrink-0 space-y-3 border-b border-[var(--color-border)] px-5 py-3">
          <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            <Search className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
            <Input
              type="search"
              value={query}
              placeholder="Hľadať šablóny…"
              className="h-auto border-none bg-transparent p-0 shadow-none focus-visible:shadow-none"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
              Všetky
              <span className="ml-1 opacity-60">{categoryCounts.all}</span>
            </FilterChip>
            {(Object.keys(categoryLabels) as DocumentTemplate['category'][]).map((key) => (
              <FilterChip key={key} active={category === key} onClick={() => setCategory(key)}>
                {categoryLabels[key]}
                <span className="ml-1 opacity-60">{categoryCounts[key]}</span>
              </FilterChip>
            ))}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 p-5">
            {showBlankHero && (
              <TemplateCard
                template={BLANK_TEMPLATE}
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
                    selected={selectedId === template.id}
                    onSelect={() => setSelectedId(template.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-[13px] text-[var(--color-muted-foreground)]">
                <p>Žiadna šablóna nevyhovuje hľadaniu.</p>
                <Button variant="ghost" size="sm" onClick={() => setQuery('')}>
                  Vymazať filter
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="titlebar-interactive relative z-10 flex shrink-0 items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-3">
          <p className="m-0 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-foreground)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            {selectedTemplate.name}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={creating} onClick={onClose}>
              Zrušiť
            </Button>
            <Button variant="default" size="sm" disabled={creating} onClick={() => void handleCreate()}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {creating ? 'Vytváram…' : 'Vytvoriť dokument'}
            </Button>
          </div>
        </div>
        </DialogContent>
      )}
    </Dialog>
  )
}

function TemplateCard({
  template,
  selected,
  variant = 'grid',
  onSelect,
}: {
  template: DocumentTemplate
  selected: boolean
  variant?: 'grid' | 'hero'
  onSelect: () => void
}) {
  const CategoryIcon = categoryIcons[template.category]

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
          categoryPreviewClass[template.category],
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
          <Badge
            variant={selected ? 'accent' : 'muted'}
            className="shrink-0 text-[10px]"
          >
            {categoryLabels[template.category]}
          </Badge>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-[var(--color-muted-foreground)]">
          {template.description}
        </p>
      </div>
    </button>
  )
}

function FilterChip({
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
        'titlebar-no-drag inline-flex h-7 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[12px] text-[var(--color-muted-foreground)] transition-colors',
        active
          ? 'border-[var(--color-accent)] bg-[var(--color-selection)] font-medium text-[var(--color-accent)]'
          : 'hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
      )}
    >
      {children}
    </button>
  )
}
