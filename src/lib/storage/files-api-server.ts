import { invoke } from '@/lib/tauri'

export type StorageFsEndpoint = {
  method: string
  path: string
  label: string
  group: string
}

export type StorageFsServerStatus = {
  running: boolean
  port: number | null
  url: string | null
  token: string | null
  documentsDir: string | null
  filesRoot: string | null
  endpoints: StorageFsEndpoint[]
}

/** Offline catalog shown before the server reports endpoints. */
export const STORAGE_FS_ENDPOINT_CATALOG: StorageFsEndpoint[] = [
  { method: 'GET', path: '/v1/fs/health', label: 'Health', group: 'meta' },
  { method: 'GET', path: '/openapi.json', label: 'OpenAPI 3.0 spec', group: 'docs' },
  { method: 'GET', path: '/docs', label: 'Swagger demo UI', group: 'docs' },
  { method: 'GET', path: '/v1/fs/list', label: 'List', group: 'rest' },
  { method: 'GET', path: '/v1/fs/tree', label: 'Tree', group: 'rest' },
  { method: 'GET', path: '/v1/fs/stat', label: 'Stat', group: 'rest' },
  { method: 'GET', path: '/v1/fs/exists', label: 'Exists', group: 'rest' },
  { method: 'GET', path: '/v1/fs/read', label: 'Read (base64)', group: 'rest' },
  { method: 'GET', path: '/v1/fs/read-text', label: 'Read text', group: 'rest' },
  { method: 'GET', path: '/v1/fs/read-json', label: 'Read JSON', group: 'rest' },
  { method: 'GET', path: '/v1/fs/preview', label: 'Preview text', group: 'rest' },
  { method: 'GET', path: '/v1/fs/checksum', label: 'SHA-256 checksum', group: 'rest' },
  { method: 'GET', path: '/v1/fs/search', label: 'Search', group: 'rest' },
  { method: 'GET', path: '/v1/fs/recent', label: 'Recent files', group: 'rest' },
  { method: 'GET', path: '/v1/fs/disk-usage', label: 'Disk usage', group: 'rest' },
  { method: 'POST', path: '/v1/fs/mkdir', label: 'Mkdir', group: 'rest' },
  { method: 'POST', path: '/v1/fs/write', label: 'Write bytes', group: 'rest' },
  { method: 'POST', path: '/v1/fs/write-text', label: 'Write text', group: 'rest' },
  { method: 'POST', path: '/v1/fs/write-json', label: 'Write JSON', group: 'rest' },
  { method: 'POST', path: '/v1/fs/append', label: 'Append bytes', group: 'rest' },
  { method: 'POST', path: '/v1/fs/append-text', label: 'Append text', group: 'rest' },
  { method: 'POST', path: '/v1/fs/touch', label: 'Touch', group: 'rest' },
  { method: 'POST', path: '/v1/fs/delete', label: 'Delete', group: 'rest' },
  { method: 'POST', path: '/v1/fs/clear-dir', label: 'Clear directory', group: 'rest' },
  { method: 'POST', path: '/v1/fs/rename', label: 'Rename', group: 'rest' },
  { method: 'POST', path: '/v1/fs/move-into', label: 'Move into', group: 'rest' },
  { method: 'POST', path: '/v1/fs/copy', label: 'Copy', group: 'rest' },
  { method: 'POST', path: '/v1/fs/ensure-defaults', label: 'Ensure defaults', group: 'rest' },
  { method: 'POST', path: '/graphql', label: 'GraphQL', group: 'graphql' },
  { method: 'GET', path: '/graphql', label: 'GraphiQL playground', group: 'graphql' },
]

export const storageFsServerStatus = () =>
  invoke<StorageFsServerStatus>('storage_fs_server_status')

export const storageFsServerStart = (port?: number) =>
  invoke<StorageFsServerStatus>('storage_fs_server_start', { port: port ?? null })

export const storageFsServerStop = () =>
  invoke<StorageFsServerStatus>('storage_fs_server_stop')

export function absoluteEndpointUrl(baseUrl: string | null | undefined, path: string): string {
  const base = (baseUrl ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
  return `${base}${path}`
}

export function formatEndpointsMarkdown(
  status: Pick<StorageFsServerStatus, 'url' | 'token' | 'endpoints'>,
): string {
  const base = status.url ?? 'http://127.0.0.1:8787'
  const lines = [
    `# Scribe Files API`,
    ``,
    `Base: ${base}`,
    status.token ? `Authorization: Bearer ${status.token}` : `Authorization: Bearer <token from Settings>`,
    ``,
    ...status.endpoints.map((ep) => `- \`${ep.method}\` ${absoluteEndpointUrl(base, ep.path)} — ${ep.label}`),
  ]
  return lines.join('\n')
}
