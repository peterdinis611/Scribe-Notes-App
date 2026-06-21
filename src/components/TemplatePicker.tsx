import { useState } from 'react'
import { FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
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

export function TemplatePicker({ open, onClose, onSelect }: TemplatePickerProps) {
  const [category, setCategory] = useState<DocumentTemplate['category'] | 'all'>('all')

  if (!open) return null

  const filtered =
    category === 'all'
      ? DOCUMENT_TEMPLATES
      : DOCUMENT_TEMPLATES.filter((t) => t.category === category)

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
            <p className="template-sheet-subtitle">Vyberte šablónu alebo začnite od prázdnej stránky</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Zavrieť">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="template-filters">
          <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
            Všetky
          </FilterChip>
          {(Object.keys(categoryLabels) as DocumentTemplate['category'][]).map((key) => (
            <FilterChip key={key} active={category === key} onClick={() => setCategory(key)}>
              {categoryLabels[key]}
            </FilterChip>
          ))}
        </div>

        <ScrollArea className="template-sheet-body">
          <div className="template-grid">
            {filtered.map((template) => (
              <button
                key={template.id}
                type="button"
                className="template-card"
                onClick={() => {
                  onSelect(template)
                  onClose()
                }}
              >
                <div className="template-card-preview">
                  <FileText className="h-5 w-5 opacity-50" />
                </div>
                <div className="min-w-0 text-left">
                  <p className="template-card-name">{template.name}</p>
                  <p className="template-card-desc">{template.description}</p>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
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
