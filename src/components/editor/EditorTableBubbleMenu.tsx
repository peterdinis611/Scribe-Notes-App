import { useMemo } from 'react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import {
  focusTableCell,
  getTableMatrix,
  setTableCellBackground,
  TABLE_CELL_COLORS,
  type TableMatrixRow,
} from '@/lib/editor/table-extensions'
import { cn } from '@/lib/utils'

type EditorTableBubbleMenuProps = {
  editor: Editor
}

export function EditorTableBubbleMenu({ editor }: EditorTableBubbleMenuProps) {
  const tableState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      isTable: currentEditor.isActive('table'),
      matrix: getTableMatrix(currentEditor),
      currentColor: (currentEditor.getAttributes('tableCell').backgroundColor ??
        currentEditor.getAttributes('tableHeader').backgroundColor ??
        null) as string | null,
    }),
  })

  const columns = useMemo<ColumnDef<TableMatrixRow>[]>(() => {
    const colCount = Math.max(...(tableState.matrix?.map((row) => row.cells.length) ?? [0]), 0)
    return Array.from({ length: colCount }, (_, colIndex) => ({
      id: `col-${colIndex}`,
      header: () => String(colIndex + 1),
      cell: ({ row }) => {
        const cell = row.original.cells[colIndex]
        if (!cell) return null
        return (
          <button
            type="button"
            className={cn('table-matrix-cell', cell.isHeader && 'is-header')}
            style={{ backgroundColor: cell.backgroundColor ?? undefined }}
            onClick={() => focusTableCell(editor, cell.row, cell.col)}
            title={`Riadok ${cell.row + 1}, stĺpec ${cell.col + 1}`}
          >
            {cell.isHeader ? 'H' : cell.col + 1}
          </button>
        )
      },
    }))
  }, [editor, tableState.matrix])

  const table = useReactTable({
    data: tableState.matrix ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <BubbleMenu
      editor={editor}
      className="editor-bubble-menu editor-bubble-menu--table titlebar-no-drag"
      shouldShow={() => tableState.isTable}
    >
      <div className="table-bubble-layout">
        <div className="table-bubble-colors">
          <span className="table-bubble-label">Farba bunky</span>
          <div className="table-bubble-swatches">
            {TABLE_CELL_COLORS.map(({ label, value }) => (
              <button
                key={label}
                type="button"
                className={cn('toolbar-swatch', tableState.currentColor === value && 'is-active')}
                title={label}
                onClick={() => setTableCellBackground(editor, value)}
              >
                <span
                  className="toolbar-swatch-dot"
                  style={{ background: value || 'var(--color-background)' }}
                />
              </button>
            ))}
          </div>
        </div>

        {(tableState.matrix?.length ?? 0) > 0 && (
          <div className="table-bubble-matrix">
            <span className="table-bubble-label">Tabuľka (TanStack Table)</span>
            <div className="table-matrix-table-wrap">
              <table className="table-matrix-table">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      <th className="table-matrix-corner" />
                      {headerGroup.headers.map((header) => (
                        <th key={header.id} className="table-matrix-head">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row, rowIndex) => (
                    <tr key={row.id}>
                      <th className="table-matrix-head">{rowIndex + 1}</th>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="table-matrix-data">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </BubbleMenu>
  )
}
