import { invoke } from '@/lib/tauri'

export interface Library {
  id: string
  name: string
  rootPath: string
  createdAt: number
  lastOpenedAt: number
  sortOrder: number
  isActive: boolean
}

export interface SyncConflict {
  id: string
  documentId: string
  title: string
  diskUpdatedAt: number
  dbUpdatedAt: number
  createdAt: number
}

export interface Manuscript {
  id: string
  libraryId: string
  title: string
  chapterIds: string[]
  createdAt: number
  updatedAt: number
}

export const listLibraries = () => invoke<Library[]>('list_libraries')

export const createLibrary = (name: string) =>
  invoke<Library>('create_library', { input: { name } })

export const switchLibrary = (id: string) => invoke<Library>('switch_library', { id })

export const listSyncConflicts = () => invoke<SyncConflict[]>('list_sync_conflicts')

export const resolveSyncConflict = (id: string, keep: 'app' | 'disk') =>
  invoke<void>('resolve_sync_conflict', { input: { id, keep } })

export const listManuscripts = () => invoke<Manuscript[]>('list_manuscripts')

export const upsertManuscript = (input: { id?: string; title: string; chapterIds: string[] }) =>
  invoke<Manuscript>('upsert_manuscript', { input })
