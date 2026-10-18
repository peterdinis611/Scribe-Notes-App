import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { matrixToXlsxBytes } from '@/lib/export/excel-xlsx'

describe('excel-xlsx export', () => {
  it('round-trips a matrix through xlsx bytes', async () => {
    const bytes = await matrixToXlsxBytes(
      [
        ['Name', 'Qty'],
        ['Apples', '3'],
        ['Oranges', '2'],
      ],
      'Fruit',
    )
    const workbook = XLSX.read(bytes, { type: 'array' })
    expect(workbook.SheetNames[0]).toBe('Fruit')
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Fruit!, {
      header: 1,
      raw: false,
      defval: '',
    }) as string[][]
    expect(rows[0]).toEqual(['Name', 'Qty'])
    expect(rows[1]?.[0]).toBe('Apples')
  })
})
