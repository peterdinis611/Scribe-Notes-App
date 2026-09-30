import { invoke } from '@/lib/tauri'
import {
  STORAGE_FS_COMMANDS,
  type StorageEntry,
  type StorageFsDeleteOpts,
  type StorageFsListOpts,
  type StorageFsPathPair,
  type StorageFsPathRef,
  type StorageFsReadResult,
  type StorageFsWriteOpts,
} from '@/lib/storage/files-types'

export type {
  StorageEntry,
  StorageEntryKind,
  StorageFsDeleteOpts,
  StorageFsListOpts,
  StorageFsPathPair,
  StorageFsPathRef,
  StorageFsReadResult,
  StorageFsWriteOpts,
} from '@/lib/storage/files-types'

export { STORAGE_FS_COMMANDS } from '@/lib/storage/files-types'

/** List entries under `{documentsDir}/files/` (optional subpath). */
export const storageFsList = (input: StorageFsListOpts = {}) =>
  invoke<StorageEntry[]>(STORAGE_FS_COMMANDS.list, { input })

export const storageFsStat = (input: StorageFsPathRef) =>
  invoke<StorageEntry>(STORAGE_FS_COMMANDS.stat, { input })

export const storageFsMkdir = (input: StorageFsPathRef) =>
  invoke<StorageEntry>(STORAGE_FS_COMMANDS.mkdir, { input })

export const storageFsWrite = (input: StorageFsWriteOpts) =>
  invoke<StorageEntry>(STORAGE_FS_COMMANDS.write, { input })

export const storageFsRead = (input: StorageFsPathRef) =>
  invoke<StorageFsReadResult>(STORAGE_FS_COMMANDS.read, { input })

export const storageFsDelete = (input: StorageFsDeleteOpts) =>
  invoke<void>(STORAGE_FS_COMMANDS.delete, { input })

export const storageFsRename = (input: StorageFsPathPair) =>
  invoke<StorageEntry>(STORAGE_FS_COMMANDS.rename, { input })

export const storageFsReveal = (input: StorageFsPathRef) =>
  invoke<void>(STORAGE_FS_COMMANDS.reveal, { input })

/** Encode Uint8Array / string to base64 for `storageFsWrite`. */
export function toStorageFsBase64(data: Uint8Array | string): string {
  if (typeof data === 'string') {
    const bytes = new TextEncoder().encode(data)
    return toStorageFsBase64(bytes)
  }
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode(...data.subarray(i, i + chunk))
  }
  return btoa(binary)
}
