import { describe, expect, it } from 'vitest'
import { isExcelPath, isLegacyExcelPath, MAX_EXCEL_BYTES } from '@/lib/import/excel-xlsx'

describe('excel-xlsx import helpers', () => {
  it('detects excel and legacy paths', () => {
    expect(isExcelPath('/tmp/budget.xlsx')).toBe(true)
    expect(isExcelPath('/tmp/budget.XLSM')).toBe(true)
    expect(isExcelPath('/tmp/data.csv')).toBe(true)
    expect(isExcelPath('/tmp/data.tsv')).toBe(true)
    expect(isExcelPath('/tmp/budget.xls')).toBe(false)
    expect(isLegacyExcelPath('/tmp/budget.xls')).toBe(true)
    expect(isLegacyExcelPath('/tmp/budget.xlsx')).toBe(false)
  })

  it('exposes a max byte limit for call sites', () => {
    expect(MAX_EXCEL_BYTES).toBeGreaterThan(1024 * 1024)
  })
})
