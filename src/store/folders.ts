import { atom } from 'jotai'
import type { Folder } from '@/lib/db/api'

export const foldersAtom = atom<Folder[]>([])
export const expandedFolderIdsAtom = atom<Set<string>>(new Set())
export const commandPaletteOpenAtom = atom(false)
