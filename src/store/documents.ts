import { atom } from 'jotai'
import type { Document, DocumentSummary } from '@/lib/db/api'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const MANUAL_TITLES_KEY = 'scribe-manual-titles'

function readManualTitleIds(): Set<string> {
  try {
    const raw = localStorage.getItem(MANUAL_TITLES_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    // ignore
  }
  return new Set()
}

function persistManualTitleIds(ids: Set<string>) {
  localStorage.setItem(MANUAL_TITLES_KEY, JSON.stringify([...ids]))
}

export const documentsAtom = atom<DocumentSummary[]>([])
export const activeDocumentIdAtom = atom<string | null>(null)
export const activeDocumentAtom = atom<Document | null>(null)
export const saveStatusAtom = atom<SaveStatus>('idle')
export const sidebarOpenAtom = atom(true)
export const manualTitleDocumentIdsAtom = atom<Set<string>>(readManualTitleIds())

export const markDocumentTitleManualAtom = atom(null, (get, set, id: string) => {
  const next = new Set(get(manualTitleDocumentIdsAtom))
  next.add(id)
  set(manualTitleDocumentIdsAtom, next)
  persistManualTitleIds(next)
})
