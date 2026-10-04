import { useRef, useState, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type Table as TanstackTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export type DataTableProps<TData> = {
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  emptyMessage?: ReactNode
  className?: string
  tableClassName?: string
  initialSorting?: SortingState
  columnFilters?: ColumnFiltersState
  onColumnFiltersChange?: (filters: ColumnFiltersState) => void
  globalFilter?: string
  onGlobalFilterChange?: (value: string) => void
  pageSize?: number
  getRowId?: (originalRow: TData, index: number) => string
  enableSorting?: boolean
  enablePagination?: boolean
  /** Virtualize body rows (skips pagination when true). */
  enableVirtualization?: boolean
  estimateRowHeight?: number
  /** Extra toolbar content rendered above the table. */
  toolbar?: ReactNode | ((table: TanstackTable<TData>) => ReactNode)
}

function SortGlyph({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc') return <ArrowUp className="h-3 w-3 opacity-70" aria-hidden />
  if (sorted === 'desc') return <ArrowDown className="h-3 w-3 opacity-70" aria-hidden />
  return <ArrowUpDown className="h-3 w-3 opacity-35" aria-hidden />
}

export function DataTable<TData>({
  data,
  columns,
  emptyMessage = 'No rows',
  className,
  tableClassName,
  initialSorting = [],
  columnFilters: controlledFilters,
  onColumnFiltersChange,
  globalFilter: controlledGlobalFilter,
  onGlobalFilterChange,
  pageSize = 100,
  getRowId,
  enableSorting = true,
  enablePagination = true,
  enableVirtualization = false,
  estimateRowHeight = 36,
  toolbar,
}: DataTableProps<TData>) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [sorting, setSorting] = useState<SortingState>(initialSorting)
  const [internalFilters, setInternalFilters] = useState<ColumnFiltersState>([])
  const [internalGlobalFilter, setInternalGlobalFilter] = useState('')

  const columnFilters = controlledFilters ?? internalFilters
  const globalFilter = controlledGlobalFilter ?? internalGlobalFilter
  const paginate = enablePagination && !enableVirtualization

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: (updater) => {
      const next = typeof updater === 'function' ? updater(columnFilters) : updater
      if (onColumnFiltersChange) onColumnFiltersChange(next)
      else setInternalFilters(next)
    },
    onGlobalFilterChange: (updater) => {
      const next = typeof updater === 'function' ? updater(globalFilter) : updater
      if (onGlobalFilterChange) onGlobalFilterChange(String(next ?? ''))
      else setInternalGlobalFilter(String(next ?? ''))
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: paginate ? getPaginationRowModel() : undefined,
    getRowId,
    initialState: {
      pagination: { pageSize },
    },
    enableSorting,
  })

  const rows = table.getRowModel().rows
  const pageCount = table.getPageCount()
  const showPager = paginate && pageCount > 1
  const toolbarNode = typeof toolbar === 'function' ? toolbar(table) : toolbar
  const colCount = Math.max(table.getVisibleLeafColumns().length, 1)

  const virtualizer = useVirtualizer({
    count: enableVirtualization ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 10,
  })

  const virtualItems = enableVirtualization ? virtualizer.getVirtualItems() : []
  const paddingTop = virtualItems.length > 0 ? virtualItems[0]!.start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1]!.end
      : 0

  return (
    <div className={cn('data-table', className)}>
      {toolbarNode}
      {rows.length === 0 ? (
        <p className="data-table-empty">{emptyMessage}</p>
      ) : (
        <div
          ref={scrollRef}
          className={cn('data-table-scroll', enableVirtualization && 'is-virtualized')}
        >
          <table className={cn('data-table-grid', tableClassName)}>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort()
                    const sorted = header.column.getIsSorted()
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                        aria-sort={
                          sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'
                        }
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            className="data-table-sort"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <span>
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            <SortGlyph sorted={sorted} />
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {enableVirtualization ? (
                <>
                  {paddingTop > 0 ? (
                    <tr aria-hidden>
                      <td colSpan={colCount} style={{ height: paddingTop, padding: 0, border: 0 }} />
                    </tr>
                  ) : null}
                  {virtualItems.map((virtualRow) => {
                    const row = rows[virtualRow.index]!
                    return (
                      <tr key={row.id} data-index={virtualRow.index}>
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                  {paddingBottom > 0 ? (
                    <tr aria-hidden>
                      <td
                        colSpan={colCount}
                        style={{ height: paddingBottom, padding: 0, border: 0 }}
                      />
                    </tr>
                  ) : null}
                </>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {showPager ? (
        <div className="data-table-pager">
          <button
            type="button"
            className="data-table-pager-btn"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            {t('common.back')}
          </button>
          <span className="data-table-pager-meta">
            {table.getState().pagination.pageIndex + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="data-table-pager-btn"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            {t('common.next')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
