import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Document, DocumentSummary } from '@/lib/db/api'

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export const flushAutoSaveAtom = atom<(() => Promise<void>) | null>(null)

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

const COMMENT_AUTHOR_KEY = 'scribe-comment-author'

function readCommentAuthor(): string {
  try {
    const raw = localStorage.getItem(COMMENT_AUTHOR_KEY)
    if (raw && raw.trim()) return raw
  } catch {
    // ignore
  }
  return 'Ja'
}

export const documentsAtom = atom<DocumentSummary[]>([])
export const activeDocumentIdAtom = atom<string | null>(null)
export const activeDocumentAtom = atom<Document | null>(null)
export const saveStatusAtom = atom<SaveStatus>('idle')
export const sidebarOpenAtom = atom(true)
export const documentOutlineOpenAtom = atomWithStorage('scribe-document-outline-open', false)
export const revisionHistoryOpenAtom = atomWithStorage('scribe-revision-history-open', false)
export const commentsPanelOpenAtom = atomWithStorage('scribe-comments-open', false)
export const statsPanelOpenAtom = atomWithStorage('scribe-stats-open', false)
export const focusModeAtom = atomWithStorage('scribe-focus-mode', false)
export const manualTitleDocumentIdsAtom = atom<Set<string>>(readManualTitleIds())

/** Session-only UI: find & replace overlay, trash view, sidebar tag/favorite filters. */
export const findReplaceOpenAtom = atom(false)
export const findReplaceModeAtom = atom<'find' | 'replace'>('find')
export const trashOpenAtom = atom(false)
export const favoritesOnlyFilterAtom = atom(false)
export const activeTagFilterAtom = atom<string | null>(null)

/** Bump to force the comments panel to reload threads from the backend. */
export const commentsVersionAtom = atom(0)

export const commentAuthorAtom = atom<string>(readCommentAuthor())

export const setCommentAuthorAtom = atom(null, (_get, set, name: string) => {
  const trimmed = name.trim() || 'Ja'
  set(commentAuthorAtom, trimmed)
  localStorage.setItem(COMMENT_AUTHOR_KEY, trimmed)
})

export const markDocumentTitleManualAtom = atom(null, (get, set, id: string) => {
  const next = new Set(get(manualTitleDocumentIdsAtom))
  next.add(id)
  set(manualTitleDocumentIdsAtom, next)
  persistManualTitleIds(next)
})
