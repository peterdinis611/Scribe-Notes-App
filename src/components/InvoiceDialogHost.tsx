import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
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
  draftToInvoiceInput,
  loadInvoiceDraft,
  normalizeInvoiceDraft,
  resolveInvoiceDialog,
  saveInvoiceDraft,
  type InvoiceDialogDraft,
} from '@/lib/invoice-dialog'
import { useAppSelector } from '@/store/hooks'

function money(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

export function InvoiceDialogHost() {
  const { t } = useTranslation()
  const open = useAppSelector((state) => state.ui.invoiceDialog.open)
  const seed = useAppSelector((state) => state.ui.invoiceDialog.seed)
  const [draft, setDraft] = useState<InvoiceDialogDraft>(() => loadInvoiceDraft())

  useEffect(() => {
    if (!open) return
    setDraft(normalizeInvoiceDraft({ ...loadInvoiceDraft(), ...(seed ?? {}) }))
  }, [open, seed])

  const totals = useMemo(() => {
    const subtotal = draft.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    )
    const tax = (subtotal * draft.taxPercent) / 100
    return { subtotal, tax, total: subtotal + tax }
  }, [draft.items, draft.taxPercent])

  function close(result: ReturnType<typeof draftToInvoiceInput> | null) {
    resolveInvoiceDialog(result)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const next = normalizeInvoiceDraft(draft)
    saveInvoiceDraft(next)
    close(
      draftToInvoiceInput(next, {
        description: t('structuredPdf.invoiceDefaultDescription'),
        notes: t('structuredPdf.invoiceNotes'),
      }),
    )
  }

  function updateItem(index: number, patch: Partial<InvoiceDialogDraft['items'][number]>) {
    setDraft((prev) => {
      const items = prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item))
      return { ...prev, items }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close(null)
      }}
    >
      {open && (
        <DialogContent className="max-h-[90vh] max-w-[560px] overflow-y-auto titlebar-no-drag" showClose>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t('invoiceDialog.title')}</DialogTitle>
              <DialogDescription>{t('invoiceDialog.description')}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[12px] sm:col-span-2">
                <span className="font-medium">{t('invoiceDialog.invoiceNumber')}</span>
                <Input
                  value={draft.invoiceNumber}
                  placeholder={t('invoiceDialog.invoiceNumberPlaceholder')}
                  onChange={(e) => setDraft((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
                />
              </label>

              <fieldset className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 sm:col-span-2">
                <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  {t('invoiceDialog.from')}
                </legend>
                <Input
                  value={draft.companyName}
                  placeholder={t('invoiceDialog.companyName')}
                  onChange={(e) => setDraft((prev) => ({ ...prev, companyName: e.target.value }))}
                />
                <Input
                  value={draft.companyEmail}
                  placeholder={t('invoiceDialog.email')}
                  onChange={(e) => setDraft((prev) => ({ ...prev, companyEmail: e.target.value }))}
                />
                <Input
                  value={draft.companyAddress}
                  placeholder={t('invoiceDialog.address')}
                  onChange={(e) => setDraft((prev) => ({ ...prev, companyAddress: e.target.value }))}
                />
              </fieldset>

              <fieldset className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 sm:col-span-2">
                <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  {t('invoiceDialog.billTo')}
                </legend>
                <Input
                  value={draft.billToName}
                  placeholder={t('invoiceDialog.clientName')}
                  onChange={(e) => setDraft((prev) => ({ ...prev, billToName: e.target.value }))}
                />
                <Input
                  value={draft.billToEmail}
                  placeholder={t('invoiceDialog.email')}
                  onChange={(e) => setDraft((prev) => ({ ...prev, billToEmail: e.target.value }))}
                />
                <Input
                  value={draft.billToAddress}
                  placeholder={t('invoiceDialog.address')}
                  onChange={(e) => setDraft((prev) => ({ ...prev, billToAddress: e.target.value }))}
                />
                <Input
                  value={draft.billToPhone}
                  placeholder={t('invoiceDialog.phone')}
                  onChange={(e) => setDraft((prev) => ({ ...prev, billToPhone: e.target.value }))}
                />
              </fieldset>

              <fieldset className="grid gap-2 sm:col-span-2">
                <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  {t('invoiceDialog.items')}
                </legend>
                {draft.items.map((item, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr_72px_88px_36px] items-center gap-2"
                  >
                    <Input
                      value={item.description}
                      placeholder={t('invoiceDialog.itemDescription')}
                      onChange={(e) => updateItem(index, { description: e.target.value })}
                    />
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={item.quantity}
                      aria-label={t('invoiceDialog.quantity')}
                      onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                    />
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={item.unitPrice}
                      aria-label={t('invoiceDialog.unitPrice')}
                      onChange={(e) => updateItem(index, { unitPrice: Number(e.target.value) })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="px-2"
                      disabled={draft.items.length <= 1}
                      aria-label={t('invoiceDialog.removeItem')}
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          items: prev.items.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      items: [...prev.items, { description: '', quantity: 1, unitPrice: 0 }],
                    }))
                  }
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {t('invoiceDialog.addItem')}
                </Button>
              </fieldset>

              <label className="grid gap-1.5 text-[12px]">
                <span className="font-medium">{t('invoiceDialog.taxPercent')}</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={draft.taxPercent}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, taxPercent: Number(e.target.value) }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-[12px]">
                <span className="font-medium">{t('invoiceDialog.dueInDays')}</span>
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={draft.dueInDays}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, dueInDays: Number(e.target.value) }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-[12px] sm:col-span-2">
                <span className="font-medium">{t('invoiceDialog.paymentMethod')}</span>
                <Input
                  value={draft.paymentMethod}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, paymentMethod: e.target.value }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-[12px] sm:col-span-2">
                <span className="font-medium">{t('invoiceDialog.notes')}</span>
                <Input
                  value={draft.notes}
                  placeholder={t('structuredPdf.invoiceNotes')}
                  onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </label>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px]">
              <div className="flex justify-between gap-4">
                <span className="text-[var(--color-muted-foreground)]">{t('invoiceDialog.subtotal')}</span>
                <span>{money(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[var(--color-muted-foreground)]">{t('invoiceDialog.tax')}</span>
                <span>{money(totals.tax)}</span>
              </div>
              <div className="mt-1 flex justify-between gap-4 border-t border-[var(--color-border)] pt-1 font-semibold">
                <span>{t('invoiceDialog.total')}</span>
                <span>{money(totals.total)}</span>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => close(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="default" size="sm">
                {t('invoiceDialog.export')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
