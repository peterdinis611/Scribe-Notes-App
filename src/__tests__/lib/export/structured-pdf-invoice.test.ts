import { describe, expect, it } from 'vitest'
import { parseTableNumber } from '@/lib/editor/table-commands'
import { buildInvoiceData } from '@/components/pdf/templates/invoice'

describe('parseTableNumber', () => {
  it('parses plain and localized amounts', () => {
    expect(parseTableNumber('12')).toBe(12)
    expect(parseTableNumber('1,5')).toBe(1.5)
    expect(parseTableNumber('1.234,56')).toBe(1234.56)
    expect(parseTableNumber('€ 42')).toBe(42)
    expect(parseTableNumber('abc')).toBeNull()
  })
})

describe('buildInvoiceData', () => {
  it('builds a minimal invoice from a description', () => {
    const data = buildInvoiceData({
      description: 'Writing retainer',
      quantity: 2,
      unitPrice: 100,
    })
    expect(data.items).toHaveLength(1)
    expect(data.items[0]?.description).toBe('Writing retainer')
    expect(data.summary.subtotal).toBe(200)
    expect(data.summary.tax).toBe(40)
    expect(data.summary.total).toBe(240)
    expect(data.companyName).toBe('Scribe')
  })

  it('supports multiple line items and custom tax', () => {
    const data = buildInvoiceData({
      billToName: 'Acme',
      taxRate: 0.1,
      items: [
        { description: 'A', quantity: 1, unitPrice: 100 },
        { description: 'B', quantity: 2, unitPrice: 50 },
      ],
    })
    expect(data.items).toHaveLength(2)
    expect(data.billTo.name).toBe('Acme')
    expect(data.summary.subtotal).toBe(200)
    expect(data.summary.tax).toBe(20)
    expect(data.summary.total).toBe(220)
    expect(data.paymentTerms.gst).toBe('10%')
  })
})
