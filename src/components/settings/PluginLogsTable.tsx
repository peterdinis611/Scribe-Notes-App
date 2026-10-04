import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import type { PluginLogEntry } from '@/lib/plugins'
import { cn } from '@/lib/utils'

type PluginLogsTableProps = {
  logs: PluginLogEntry[]
  /** Hide the plugin column when the table is scoped to one extension. */
  showPluginColumn?: boolean
  emptyMessage?: string
  className?: string
  pageSize?: number
}

export function PluginLogsTable({
  logs,
  showPluginColumn = true,
  emptyMessage,
  className,
  pageSize = 120,
}: PluginLogsTableProps) {
  const { t } = useTranslation()

  const columns = useMemo<ColumnDef<PluginLogEntry>[]>(() => {
    const cols: ColumnDef<PluginLogEntry>[] = [
      {
        id: 'at',
        accessorKey: 'at',
        header: t('settings.plugins.logColumns.time'),
        size: 88,
        cell: ({ row }) => (
          <span className="data-table-mono">{row.original.at.slice(11, 19)}</span>
        ),
      },
      {
        id: 'level',
        accessorKey: 'level',
        header: t('settings.plugins.logColumns.level'),
        size: 72,
        cell: ({ row }) => (
          <span className={cn('plugin-log-level', `is-${row.original.level}`)}>
            {t(`settings.plugins.logLevels.${row.original.level}`)}
          </span>
        ),
        filterFn: (row, _id, value) => {
          if (!value || value === 'all') return true
          return row.original.level === value
        },
      },
    ]

    if (showPluginColumn) {
      cols.push({
        id: 'pluginId',
        accessorKey: 'pluginId',
        header: t('settings.plugins.logColumns.plugin'),
        size: 140,
        cell: ({ row }) => (
          <span className="data-table-mono" title={row.original.pluginId}>
            {row.original.pluginId}
          </span>
        ),
        filterFn: (row, _id, value) => {
          if (!value || value === 'all') return true
          return row.original.pluginId === value
        },
      })
    }

    cols.push({
      id: 'message',
      accessorKey: 'message',
      header: t('settings.plugins.logColumns.message'),
      cell: ({ row }) => <span className="plugin-log-message">{row.original.message}</span>,
    })

    return cols
  }, [showPluginColumn, t])

  return (
    <DataTable
      data={logs}
      columns={columns}
      emptyMessage={emptyMessage ?? t('settings.plugins.logsEmpty')}
      className={cn('plugin-logs-table', className)}
      pageSize={pageSize}
      getRowId={(row) => row.id}
      initialSorting={[{ id: 'at', desc: true }]}
      enablePagination={logs.length > pageSize}
    />
  )
}
