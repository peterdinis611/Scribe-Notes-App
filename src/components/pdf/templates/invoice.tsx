import { InvoiceMinimalDocument } from '@/components/pdf/blocks/invoice-minimal/invoice-minimal'
import type { InvoiceMinimalData } from '@/components/pdf/blocks/invoice-minimal/invoice-minimal.types'
import type { PdfcnTheme } from '@/components/pdf-themes'

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
  description: string
  quantity?: number
  unitPrice?: number
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

export function buildInvoiceData(input: ScribeInvoiceInput): InvoiceMinimalData {
  const quantity = input.quantity ?? 1
  const unitPrice = input.unitPrice ?? 0
  const subtotal = quantity * unitPrice
  const tax = Math.round(subtotal * 0.2)
  const total = subtotal + tax
  const issued = input.invoiceDate ?? formatDate()
  const due = input.dueDate ?? formatDate(addDays(new Date(), 14))
  const invoiceNumber =
    input.invoiceNumber ??
    `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`

  return {
    invoiceNumber,
    invoiceDate: issued,
    dueDate: due,
    companyName: input.companyName ?? 'Scribe',
    subtitle: 'Local notes · structured PDF',
    companyAddress: input.companyAddress ?? '',
    companyEmail: input.companyEmail ?? '',
    billTo: {
      name: input.billToName ?? 'Client',
      address: input.billToAddress ?? '',
      email: input.billToEmail ?? '',
      phone: input.billToPhone ?? '',
    },
    items: [
      {
        description: input.description,
        quantity,
        unitPrice,
      },
    ],
    summary: { subtotal, tax, total },
    paymentTerms: {
      dueDate: due,
      method: 'Bank transfer',
      gst: '',
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
