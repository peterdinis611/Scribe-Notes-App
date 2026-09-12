import { store } from '@/store/index'
import { setInvoiceDialog } from '@/store/uiSlice'
import type { ScribeInvoiceInput, ScribeInvoiceItem } from '@/components/pdf/templates/invoice'

const STORAGE_KEY = 'scribe.invoice-options.v1'

export type InvoiceDialogDraft = {
  invoiceNumber: string
  companyName: string
  companyEmail: string
  companyAddress: string
  billToName: string
  billToEmail: string
  billToAddress: string
  billToPhone: string
  items: ScribeInvoiceItem[]
  taxPercent: number
  paymentMethod: string
  notes: string
  dueInDays: number
}

const DEFAULT_DRAFT: InvoiceDialogDraft = {
  invoiceNumber: '',
  companyName: 'Scribe',
  companyEmail: '',
  companyAddress: '',
  billToName: '',
  billToEmail: '',
  billToAddress: '',
  billToPhone: '',
  items: [{ description: 'Professional services', quantity: 1, unitPrice: 0 }],
  taxPercent: 20,
  paymentMethod: 'Bank transfer',
  notes: '',
  dueInDays: 14,
}

export function normalizeInvoiceDraft(partial: Partial<InvoiceDialogDraft>): InvoiceDialogDraft {
  const items =
    partial.items?.length &&
    partial.items.map((item) => ({
      description: String(item.description ?? '').slice(0, 200),
      quantity: Math.max(0, Number(item.quantity) || 0),
      unitPrice: Math.max(0, Number(item.unitPrice) || 0),
    }))

  return {
    invoiceNumber: String(partial.invoiceNumber ?? DEFAULT_DRAFT.invoiceNumber).slice(0, 64),
    companyName: String(partial.companyName ?? DEFAULT_DRAFT.companyName).slice(0, 120),
    companyEmail: String(partial.companyEmail ?? DEFAULT_DRAFT.companyEmail).slice(0, 120),
    companyAddress: String(partial.companyAddress ?? DEFAULT_DRAFT.companyAddress).slice(0, 240),
    billToName: String(partial.billToName ?? DEFAULT_DRAFT.billToName).slice(0, 120),
    billToEmail: String(partial.billToEmail ?? DEFAULT_DRAFT.billToEmail).slice(0, 120),
    billToAddress: String(partial.billToAddress ?? DEFAULT_DRAFT.billToAddress).slice(0, 240),
    billToPhone: String(partial.billToPhone ?? DEFAULT_DRAFT.billToPhone).slice(0, 40),
    items: items && items.length > 0 ? items.slice(0, 20) : [...DEFAULT_DRAFT.items],
    taxPercent: Math.min(100, Math.max(0, Number(partial.taxPercent) || 0)),
    paymentMethod: String(partial.paymentMethod ?? DEFAULT_DRAFT.paymentMethod).slice(0, 80),
    notes: String(partial.notes ?? DEFAULT_DRAFT.notes).slice(0, 500),
    dueInDays: Math.min(365, Math.max(0, Math.round(Number(partial.dueInDays) || 0))),
  }
}

export function loadInvoiceDraft(): InvoiceDialogDraft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_DRAFT, items: [...DEFAULT_DRAFT.items] }
    return normalizeInvoiceDraft(JSON.parse(raw) as Partial<InvoiceDialogDraft>)
  } catch {
    return { ...DEFAULT_DRAFT, items: [...DEFAULT_DRAFT.items] }
  }
}

export function saveInvoiceDraft(draft: InvoiceDialogDraft) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeInvoiceDraft(draft)))
  } catch {
    // ignore quota / private mode
  }
}

export function draftToInvoiceInput(
  draft: InvoiceDialogDraft,
  fallbacks?: { description?: string; notes?: string },
): ScribeInvoiceInput {
  const normalized = normalizeInvoiceDraft(draft)
  const due = new Date()
  due.setDate(due.getDate() + normalized.dueInDays)
  const items = normalized.items.map((item) => ({
    ...item,
    description:
      item.description.trim() ||
      fallbacks?.description ||
      'Professional services',
  }))

  return {
    invoiceNumber: normalized.invoiceNumber.trim() || undefined,
    companyName: normalized.companyName,
    companyEmail: normalized.companyEmail,
    companyAddress: normalized.companyAddress,
    billToName: normalized.billToName,
    billToEmail: normalized.billToEmail,
    billToAddress: normalized.billToAddress,
    billToPhone: normalized.billToPhone,
    items,
    taxRate: normalized.taxPercent / 100,
    paymentMethod: normalized.paymentMethod,
    notes: normalized.notes.trim() || fallbacks?.notes,
    dueDate: due.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  }
}

let pendingResolve: ((value: ScribeInvoiceInput | null) => void) | null = null

export function resolveInvoiceDialog(value: ScribeInvoiceInput | null) {
  pendingResolve?.(value)
  pendingResolve = null
  store.dispatch(setInvoiceDialog({ open: false }))
}

/** Opens the invoice export dialog. Resolves with input, or null if cancelled. */
export function promptInvoiceOptions(seed?: Partial<InvoiceDialogDraft>): Promise<ScribeInvoiceInput | null> {
  return new Promise((resolve) => {
    if (pendingResolve) {
      pendingResolve(null)
    }
    pendingResolve = resolve
    store.dispatch(setInvoiceDialog({ open: true, seed: seed ?? null }))
  })
}
