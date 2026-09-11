import { describe, expect, it } from 'vitest'
import { buildInvoiceData } from '@/components/pdf/templates/invoice'

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
})
