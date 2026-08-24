import { createDocument, createFolder, getDocument } from '@/lib/db/api'
import { cacheDocument } from '@/lib/cache/document-cache'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import type { AppDispatch } from '@/store/index'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'
import { updateFolders } from '@/store/foldersSlice'
import type { DocumentSummary, Folder } from '@/lib/db/api'

const JOURNAL_MAP_KEY = 'scribe-journal-map'

type JournalMap = Record<string, string>

function readJournalMap(): JournalMap {
  try {
    const raw = localStorage.getItem(JOURNAL_MAP_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as JournalMap
  } catch {
    return {}
  }
}

function persistJournalMap(map: JournalMap) {
  localStorage.setItem(JOURNAL_MAP_KEY, JSON.stringify(map))
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** ISO week key: YYYY-Www */
export function formatWeekKey(date: Date): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function journalContent(heading: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: heading }] },
      { type: 'paragraph' },
    ],
  })
}

async function ensureJournalFolder(
  folders: Folder[],
  dispatch: AppDispatch,
  folderName: string,
): Promise<string> {
  const existing = folders.find(
    (folder) => folder.parentId == null && folder.name === folderName,
  )
  if (existing) return existing.id

  const created = await createFolder({ name: folderName, parentId: null })
  dispatch(updateFolders((prev) => [...prev, created]))
  return created.id
}

type OpenJournalArgs = {
  documents: DocumentSummary[]
  folders: Folder[]
  dispatch: AppDispatch
  navigate: (route: ReturnType<typeof ROUTES.document>) => void | Promise<void>
  t: (key: string, options?: Record<string, unknown>) => string
}

async function openJournalNote(mapKey: string, title: string, args: OpenJournalArgs) {
  const { documents, folders, dispatch, navigate, t } = args
  const map = readJournalMap()
  const storedId = map[mapKey]

  if (storedId) {
    const existing = documents.find((doc) => doc.id === storedId && doc.deletedAt == null)
    if (existing) {
      const document = cacheDocument(await getDocument(existing.id))
      dispatch(setActiveDocumentId(document.id))
      dispatch(setActiveDocument(document))
      await navigate(ROUTES.document(document.id))
      return document
    }
  }

  const folderId = await ensureJournalFolder(folders, dispatch, t('journal.folderName'))
  const byTitle = documents.find(
    (doc) => doc.deletedAt == null && doc.folderId === folderId && doc.title === title,
  )
  if (byTitle) {
    map[mapKey] = byTitle.id
    persistJournalMap(map)
    const document = cacheDocument(await getDocument(byTitle.id))
    dispatch(setActiveDocumentId(document.id))
    dispatch(setActiveDocument(document))
    await navigate(ROUTES.document(document.id))
    return document
  }

  const document = cacheDocument(
    await createDocument({
      title,
      folderId,
      contentJson: journalContent(title),
    }),
  )

  map[mapKey] = document.id
  persistJournalMap(map)
  dispatch(updateDocuments((prev) => prependDocumentSummary(prev, document)))
  dispatch(setActiveDocumentId(document.id))
  dispatch(setActiveDocument(document))
  dispatch(setSaveStatus('saved'))
  await navigate(ROUTES.document(document.id))
  return document
}

export async function openTodayNote(args: OpenJournalArgs) {
  return openJournalNoteForDate(new Date(), args)
}

export async function openJournalNoteForDate(date: Date, args: OpenJournalArgs) {
  const key = `daily:${formatDateKey(date)}`
  const title = args.t('journal.todayTitle', { date: formatDateKey(date) })
  return openJournalNote(key, title, args)
}

export async function openThisWeekNote(args: OpenJournalArgs) {
  const now = new Date()
  const week = formatWeekKey(now)
  const key = `weekly:${week}`
  const title = args.t('journal.weekTitle', { week })
  return openJournalNote(key, title, args)
}

/** Dates that already have a daily journal note (from local map + journal folder titles). */
export function listJournalDailyDates(documents: DocumentSummary[], folderId: string | null): string[] {
  const map = readJournalMap()
  const dates = new Set<string>()
  for (const [key, docId] of Object.entries(map)) {
    if (!key.startsWith('daily:')) continue
    const alive = documents.some((doc) => doc.id === docId && doc.deletedAt == null)
    if (alive) dates.add(key.slice('daily:'.length))
  }
  if (folderId) {
    for (const doc of documents) {
      if (doc.deletedAt != null || doc.folderId !== folderId) continue
      const match = /^(\d{4}-\d{2}-\d{2})/.exec(doc.title)
      if (match) dates.add(match[1]!)
    }
  }
  return [...dates].sort()
}

export function getJournalFolderId(folders: Folder[], folderName: string): string | null {
  return folders.find((folder) => folder.parentId == null && folder.name === folderName)?.id ?? null
}
