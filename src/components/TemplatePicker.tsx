import { useEffect, useMemo, useState } from 'react'
import {
  Briefcase,
  FileText,
  Palette,
  Search,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DOCUMENT_TEMPLATES, type DocumentTemplate } from '@/lib/templates'
import { cn } from '@/lib/utils'

interface TemplatePickerProps {
  open: boolean
  onClose: () => void
  onSelect: (template: DocumentTemplate) => void
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

const BLANK_TEMPLATE = DOCUMENT_TEMPLATES.find((template) => template.id === 'blank')!

export function TemplatePicker({ open, onClose, onSelect }: TemplatePickerProps) {
  const [category, setCategory] = useState<DocumentTemplate['category'] | 'all'>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(BLANK_TEMPLATE.id)

  useEffect(() => {
    if (!open) return
    setCategory('all')
    setQuery('')
    setSelectedId(BLANK_TEMPLATE.id)
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

  if (!open) return null

  function handleCreate() {
    onSelect(selectedTemplate)
    onClose()
  }

  return (
    <div className="sheet-backdrop titlebar-no-drag" onClick={onClose}>
      <div
        className="template-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Vybrať šablónu"
      >
        <div className="template-sheet-header">
          <div>
            <h2 className="template-sheet-title">Nový dokument</h2>
            <p className="template-sheet-subtitle">
              Vyberte šablónu alebo začnite od prázdnej stránky
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Zavrieť">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="template-sheet-toolbar">
          <label className="template-search">
            <Search className="h-3.5 w-3.5" />
            <input
              type="search"
              value={query}
              placeholder="Hľadať šablóny…"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="template-filters">
            <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
              Všetky
              <span className="template-filter-count">{categoryCounts.all}</span>
            </FilterChip>
            {(Object.keys(categoryLabels) as DocumentTemplate['category'][]).map((key) => (
              <FilterChip key={key} active={category === key} onClick={() => setCategory(key)}>
                {categoryLabels[key]}
                <span className="template-filter-count">{categoryCounts[key]}</span>
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="template-sheet-body">
          {showBlankHero && (
            <TemplateCard
              template={BLANK_TEMPLATE}
              selected={selectedId === BLANK_TEMPLATE.id}
              variant="hero"
              onSelect={() => setSelectedId(BLANK_TEMPLATE.id)}
            />
          )}

          {gridTemplates.length > 0 ? (
            <div className="template-grid">
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
            <div className="template-empty">
              <p>Žiadna šablóna nevyhovuje hľadaniu.</p>
              <Button variant="ghost" size="sm" onClick={() => setQuery('')}>
                Vymazať filter
              </Button>
            </div>
          )}
        </div>

        <div className="template-sheet-footer">
          <p className="template-sheet-selection">
            <Sparkles className="h-3.5 w-3.5" />
            {selectedTemplate.name}
          </p>
          <div className="template-sheet-actions">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Zrušiť
            </Button>
            <Button variant="default" size="sm" onClick={handleCreate}>
              Vytvoriť dokument
            </Button>
          </div>
        </div>
      </div>
    </div>
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
        'template-card',
        variant === 'hero' && 'template-card--hero',
        selected && 'is-selected',
      )}
      onClick={onSelect}
    >
      <div className={cn('template-card-preview', `template-card-preview--${template.category}`)}>
        <CategoryIcon className="h-4 w-4" />
        <div className="template-card-preview-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="template-card-body">
        <div className="template-card-head">
          <p className="template-card-name">{template.name}</p>
          <span className="template-card-badge">{categoryLabels[template.category]}</span>
        </div>
        <p className="template-card-desc">{template.description}</p>
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
    <button type="button" onClick={onClick} className={cn('filter-chip', active && 'is-active')}>
      {children}
    </button>
  )
}
