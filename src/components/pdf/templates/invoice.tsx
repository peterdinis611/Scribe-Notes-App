import { InvoiceMinimalDocument } from '@/components/pdf/blocks/invoice-minimal/invoice-minimal'
import type { InvoiceMinimalData } from '@/components/pdf/blocks/invoice-minimal/invoice-minimal.types'
import type { PdfcnTheme } from '@/components/pdf-themes'

export type ScribeInvoiceItem = {
  description: string
  quantity: number
  unitPrice: number
}

export type ScribeInvoiceInput = {
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  companyName?: string
  companyEmail?: string
  companyAddress?: string
  billToName?: string
  billToEmail?: string
  billToAddress?: string
  billToPhone?: string
  /** Used when `items` is omitted. */
  description?: string
  quantity?: number
  unitPrice?: number
  items?: ScribeInvoiceItem[]
  /** Tax rate as fraction, e.g. 0.2 for 20%. */
  taxRate?: number
  paymentMethod?: string
  notes?: string
}

function formatDate(date = new Date()): string {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function normalizeItems(input: ScribeInvoiceInput): ScribeInvoiceItem[] {
  if (input.items?.length) {
    return input.items
      .map((item) => ({
        description: item.description.trim() || 'Item',
        quantity: Number.isFinite(item.quantity) ? item.quantity : 1,
        unitPrice: Number.isFinite(item.unitPrice) ? item.unitPrice : 0,
      }))
      .filter((item) => item.description.length > 0)
  }
  return [
    {
      description: (input.description ?? 'Professional services').trim() || 'Professional services',
      quantity: input.quantity ?? 1,
      unitPrice: input.unitPrice ?? 0,
    },
  ]
}

export function buildInvoiceData(input: ScribeInvoiceInput): InvoiceMinimalData {
  const items = normalizeItems(input)
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const taxRate = input.taxRate ?? 0.2
  const tax = Math.round(subtotal * taxRate * 100) / 100
  const total = Math.round((subtotal + tax) * 100) / 100
  const issued = input.invoiceDate ?? formatDate()
  const due = input.dueDate ?? formatDate(addDays(new Date(), 14))
  const invoiceNumber =
    input.invoiceNumber?.trim() ||
    `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`

  return {
    invoiceNumber,
    invoiceDate: issued,
    dueDate: due,
    companyName: input.companyName?.trim() || 'Scribe',
    subtitle: 'Local notes · structured PDF',
    companyAddress: input.companyAddress ?? '',
    companyEmail: input.companyEmail ?? '',
    billTo: {
      name: input.billToName?.trim() || 'Client',
      address: input.billToAddress ?? '',
      email: input.billToEmail ?? '',
      phone: input.billToPhone ?? '',
    },
    items,
    summary: { subtotal, tax, total },
    paymentTerms: {
      dueDate: due,
      method: input.paymentMethod?.trim() || 'Bank transfer',
      gst: taxRate > 0 ? `${Math.round(taxRate * 100)}%` : '',
    },
    notes: input.notes,
  }
}

export function ScribeInvoiceDocument({
  input,
  data,
  theme,
}: {
  input?: ScribeInvoiceInput
  data?: InvoiceMinimalData
  theme?: PdfcnTheme
}) {
  const resolved =
    data ??
    buildInvoiceData(
      input ?? {
        description: 'Professional services',
      },
    )
  return <InvoiceMinimalDocument theme={theme} data={resolved} />
}
