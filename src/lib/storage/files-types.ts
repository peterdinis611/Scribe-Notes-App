/**
 * Storage Mode Files API — sandboxed store under `{documentsDir}/files/`.
 *
 * Paths are relative to that root (POSIX `/`), never `..`.
 * Absolute paths appear only in reveal helpers after server-side resolve.
 *
 * Parallel to document media (`assets/{documentId}/`); do not mix the two.
 */

export type StorageEntryKind = 'file' | 'dir'

export type StorageEntry = {
  path: string
  name: string
  kind: StorageEntryKind
  sizeBytes?: number
  modifiedAt?: number
}

export type StorageFsListOpts = {
  path?: string
  recursive?: boolean
  depth?: number
}

export type StorageFsWriteOpts = {
  path: string
  dataBase64: string
  overwrite?: boolean
}

export type StorageFsPathRef = {
  path: string
}

export type StorageFsPathPair = {
  from: string
  to: string
}

export type StorageFsDeleteOpts = {
  path: string
  recursive?: boolean
}

export type StorageFsReadResult = {
  path: string
  dataBase64: string
  sizeBytes: number
}

/** Tauri / MCP tool names (snake_case invoke ids). */
export const STORAGE_FS_COMMANDS = {
  list: 'storage_fs_list',
  stat: 'storage_fs_stat',
  mkdir: 'storage_fs_mkdir',
  write: 'storage_fs_write',
  read: 'storage_fs_read',
  delete: 'storage_fs_delete',
  rename: 'storage_fs_rename',
  reveal: 'storage_fs_reveal',
} as const

export type StorageFsCommand = (typeof STORAGE_FS_COMMANDS)[keyof typeof STORAGE_FS_COMMANDS]
