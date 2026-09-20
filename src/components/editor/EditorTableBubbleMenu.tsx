import { useMemo, type ReactNode } from 'react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import {
  ArrowDownAZ,
  ArrowDownToLine,
  ArrowUpAZ,
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Sigma,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  fillDownActiveColumn,
  insertColumnTotalBelow,
  sortTableByActiveColumn,
} from '@/lib/editor/table-commands'
import {
  focusTableCell,
  getTableMatrix,
  setTableCellBackground,
  TABLE_CELL_COLORS,
  type TableMatrixRow,
} from '@/lib/editor/table-extensions'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { IconTooltip } from '@/components/ui/tooltip'

type EditorTableBubbleMenuProps = {
  editor: Editor
}

function TableBubbleIcon({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <IconTooltip label={label}>
      <button type="button" className="editor-bubble-icon-btn" aria-label={label} onClick={onClick}>
        {children}
      </button>
    </IconTooltip>
  )
}

export function EditorTableBubbleMenu({ editor }: EditorTableBubbleMenuProps) {
  const { t } = useTranslation()
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
          <IconTooltip label={t('toolbar.table.cellTitle', { row: cell.row + 1, col: cell.col + 1 })}>
            <button
              type="button"
              className={cn('table-matrix-cell', cell.isHeader && 'is-header')}
              style={{ backgroundColor: cell.backgroundColor ?? undefined }}
              onClick={() => focusTableCell(editor, cell.row, cell.col)}
              aria-label={t('toolbar.table.cellTitle', { row: cell.row + 1, col: cell.col + 1 })}
            >
              {cell.isHeader ? t('toolbar.table.headerMark') : cell.col + 1}
            </button>
          </IconTooltip>
        )
      },
    }))
  }, [editor, t, tableState.matrix])

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
        <div className="table-bubble-actions">
          <TableBubbleIcon
            label={t('toolbar.actions.addRow')}
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            <BetweenHorizontalEnd className="h-3.5 w-3.5" />
          </TableBubbleIcon>
          <TableBubbleIcon
            label={t('toolbar.actions.addColumn')}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            <BetweenVerticalEnd className="h-3.5 w-3.5" />
          </TableBubbleIcon>
          <span className="editor-bubble-divider" />
          <TableBubbleIcon
            label={t('toolbar.actions.sortAsc')}
            onClick={() => {
              if (!sortTableByActiveColumn(editor, 'asc')) toast.info(t('toolbar.table.needColumn'))
            }}
          >
            <ArrowDownAZ className="h-3.5 w-3.5" />
          </TableBubbleIcon>
          <TableBubbleIcon
            label={t('toolbar.actions.sortDesc')}
            onClick={() => {
              if (!sortTableByActiveColumn(editor, 'desc')) toast.info(t('toolbar.table.needColumn'))
            }}
          >
            <ArrowUpAZ className="h-3.5 w-3.5" />
          </TableBubbleIcon>
          <TableBubbleIcon
            label={t('toolbar.actions.fillDown')}
            onClick={() => {
              if (!fillDownActiveColumn(editor)) toast.info(t('toolbar.table.fillEmpty'))
            }}
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
          </TableBubbleIcon>
          <TableBubbleIcon
            label={t('toolbar.actions.sumColumn')}
            onClick={() => {
              if (!insertColumnTotalBelow(editor)) toast.info(t('toolbar.table.needNumbers'))
            }}
          >
            <Sigma className="h-3.5 w-3.5" />
          </TableBubbleIcon>
          <span className="editor-bubble-divider" />
          <TableBubbleIcon
            label={t('editorActions.deleteTable')}
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </TableBubbleIcon>
        </div>
        <div className="table-bubble-colors">
          <span className="table-bubble-label">{t('toolbar.table.cellColor')}</span>
          <div className="table-bubble-swatches">
            {TABLE_CELL_COLORS.map(({ id, value }) => (
              <IconTooltip key={id} label={t(`toolbar.table.colors.${id}`)}>
                <button
                  type="button"
                  className={cn('toolbar-swatch', tableState.currentColor === value && 'is-active')}
                  aria-label={t(`toolbar.table.colors.${id}`)}
                  onClick={() => setTableCellBackground(editor, value)}
                >
                  <span
                    className="toolbar-swatch-dot"
                    style={{ background: value || 'var(--color-background)' }}
                  />
                </button>
              </IconTooltip>
            ))}
          </div>
        </div>

        {(tableState.matrix?.length ?? 0) > 0 && (
          <div className="table-bubble-matrix">
            <span className="table-bubble-label">{t('toolbar.table.jumpToCell')}</span>
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
