import { useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DocumentTemplate } from '@/lib/templates'

const categoryLabels: Record<DocumentTemplate['category'], string> = {
  general: 'Všeobecné',
  business: 'Biznis',
  personal: 'Osobné',
  creative: 'Kreatívne',
}

export type CustomTemplateDialogValues = {
  name: string
  description: string
  category: DocumentTemplate['category']
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
  const [values, setValues] = useState<CustomTemplateDialogValues>(defaultValues)

  useEffect(() => {
    if (!open) return
    setValues({
      name: initialValues?.name ?? defaultValues.name,
      description: initialValues?.description ?? defaultValues.description,
      category: initialValues?.category ?? defaultValues.category,
      title: initialValues?.title ?? defaultValues.title,
    })
  }, [content, initialValues, open])

  function update<K extends keyof CustomTemplateDialogValues>(
    key: K,
    value: CustomTemplateDialogValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const name = values.name.trim()
    const title = values.title.trim()
    if (!name || !title) return
    onSave({
      ...values,
      name,
      title,
      description: values.description.trim(),
    })
    onOpenChange(false)
  }

  const paragraphCount = countTopLevelBlocks(content)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent className="titlebar-no-drag max-w-[440px]">
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

              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-[var(--color-foreground)]">
                  Kategória
                </span>
                <Select
                  value={values.category}
                  onValueChange={(value) =>
                    update('category', value as DocumentTemplate['category'])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(categoryLabels) as DocumentTemplate['category'][]).map(
                      (key) => (
                        <SelectItem key={key} value={key}>
                          {categoryLabels[key]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Zrušiť
              </Button>
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={!values.name.trim() || !values.title.trim()}
              >
                Uložiť šablónu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}

function countTopLevelBlocks(content: JSONContent): number {
  return Array.isArray(content.content) ? content.content.length : 0
}
