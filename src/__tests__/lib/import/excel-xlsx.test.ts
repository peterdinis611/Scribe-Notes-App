import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  convertExcelBytesToContentJson,
  isExcelPath,
  isLegacyExcelPath,
} from '@/lib/import/excel-xlsx'

function workbookBytes(rows: unknown[][], sheetName = 'Sheet1'): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

describe('excel-xlsx import', () => {
  it('detects excel and legacy paths', () => {
    expect(isExcelPath('/tmp/budget.xlsx')).toBe(true)
    expect(isExcelPath('/tmp/budget.XLSM')).toBe(true)
    expect(isExcelPath('/tmp/data.csv')).toBe(true)
    expect(isExcelPath('/tmp/budget.xls')).toBe(false)
    expect(isLegacyExcelPath('/tmp/budget.xls')).toBe(true)
    expect(isLegacyExcelPath('/tmp/budget.xlsx')).toBe(false)
  })

  it('converts a sheet into a tip tap table with header row', async () => {
    const bytes = workbookBytes([
      ['Name', 'Amount'],
      ['Rent', 1200],
      ['Food', 350],
    ])

    const contentJson = await convertExcelBytesToContentJson(bytes)
    const doc = JSON.parse(contentJson) as {
      type: string
      content: Array<{ type: string; content?: unknown[] }>
    }

    expect(doc.type).toBe('doc')
    const table = doc.content.find((node) => node.type === 'table')
    expect(table).toBeTruthy()
    expect(table?.content).toHaveLength(3)

    const firstRow = (table?.content?.[0] as { content: Array<{ type: string }> }).content
    expect(firstRow[0].type).toBe('tableHeader')
  })

  it('adds headings for multi-sheet workbooks', async () => {
    const sheetA = XLSX.utils.aoa_to_sheet([['A'], [1]])
    const sheetB = XLSX.utils.aoa_to_sheet([['B'], [2]])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheetA, 'Alpha')
    XLSX.utils.book_append_sheet(workbook, sheetB, 'Beta')
    const bytes = new Uint8Array(
      XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer,
    )

    const contentJson = await convertExcelBytesToContentJson(bytes)
    const doc = JSON.parse(contentJson) as {
      content: Array<{ type: string; content?: Array<{ text?: string }> }>
    }
    const headings = doc.content.filter((node) => node.type === 'heading')
    expect(headings.map((node) => node.content?.[0]?.text)).toEqual(['Alpha', 'Beta'])
  })
})
