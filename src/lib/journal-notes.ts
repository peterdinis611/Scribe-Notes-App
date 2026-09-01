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
import { kvGet, kvSet } from '@/lib/storage/kv'
import type { DocumentSummary, Folder } from '@/lib/db/api'

const JOURNAL_MAP_KEY = 'scribe-journal-map'

type JournalMap = Record<string, string>

function readJournalMap(): JournalMap {
  try {
    const raw = kvGet(JOURNAL_MAP_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as JournalMap
  } catch {
    return {}
  }
}

function persistJournalMap(map: JournalMap) {
  kvSet(JOURNAL_MAP_KEY, JSON.stringify(map))
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

export type JournalSlot = 'day' | 'morning' | 'evening'

function journalContent(heading: string, slot: JournalSlot = 'day'): string {
  const blocks: Array<Record<string, unknown>> = [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: heading }] },
  ]

  if (slot === 'morning') {
    blocks.push(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Intentions' }] },
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Notes' }] },
      { type: 'paragraph' },
    )
  } else if (slot === 'evening') {
    blocks.push(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Highlights' }] },
      { type: 'paragraph' },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Reflection' }] },
      { type: 'paragraph' },
    )
  } else {
    blocks.push({ type: 'paragraph' })
  }

  return JSON.stringify({ type: 'doc', content: blocks })
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

async function openJournalNote(
  mapKey: string,
  title: string,
  args: OpenJournalArgs,
  slot: JournalSlot = 'day',
) {
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
      contentJson: journalContent(title, slot),
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

export async function openJournalNoteForDate(
  date: Date,
  args: OpenJournalArgs,
  slot: JournalSlot = 'day',
) {
  const dateKey = formatDateKey(date)
  const key =
    slot === 'day' ? `daily:${dateKey}` : `daily:${dateKey}:${slot}`
  const title =
    slot === 'morning'
      ? args.t('journal.morningTitle', { date: dateKey })
      : slot === 'evening'
        ? args.t('journal.eveningTitle', { date: dateKey })
        : args.t('journal.todayTitle', { date: dateKey })
  return openJournalNote(key, title, args, slot)
}

export async function openYesterdayNote(args: OpenJournalArgs) {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  return openJournalNoteForDate(date, args)
}

export async function openTomorrowNote(args: OpenJournalArgs) {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return openJournalNoteForDate(date, args)
}

export async function openMorningNote(args: OpenJournalArgs) {
  return openJournalNoteForDate(new Date(), args, 'morning')
}

export async function openEveningNote(args: OpenJournalArgs) {
  return openJournalNoteForDate(new Date(), args, 'evening')
}

/** Consecutive calendar days with a daily journal note ending today. */
export function computeJournalStreak(notedDates: string[]): number {
  if (notedDates.length === 0) return 0
  const set = new Set(notedDates)
  let streak = 0
  const cursor = new Date()
  for (;;) {
    const key = formatDateKey(cursor)
    if (!set.has(key)) break
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
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

function dateKeyToStartTs(dateKey: string): number {
  return Math.floor(new Date(`${dateKey}T00:00:00`).getTime() / 1000)
}

function dateKeyToEndTs(dateKey: string): number {
  return Math.floor(new Date(`${dateKey}T23:59:59`).getTime() / 1000)
}

/** Collect journal document ids for a date range using map, folder, title dates, and updated_at. */
export function collectJournalDocumentIdsForRange(
  documents: DocumentSummary[],
  folderId: string | null,
  fromDate: string,
  toDate: string,
): string[] {
  const fromTs = dateKeyToStartTs(fromDate)
  const toTs = dateKeyToEndTs(toDate)
  const ids = new Set<string>()
  const map = readJournalMap()

  for (const [key, docId] of Object.entries(map)) {
    if (!key.startsWith('daily:')) continue
    const datePart = key.slice('daily:'.length).split(':')[0] ?? ''
    if (datePart >= fromDate && datePart <= toDate) {
      if (documents.some((doc) => doc.id === docId && doc.deletedAt == null)) {
        ids.add(docId)
      }
    }
  }

  for (const doc of documents) {
    if (doc.deletedAt != null) continue
    const titleDate = doc.title.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]
    const inTitleRange = Boolean(titleDate && titleDate >= fromDate && titleDate <= toDate)
    const inUpdatedRange = doc.updatedAt >= fromTs && doc.updatedAt <= toTs
    const inJournalFolder = Boolean(folderId && doc.folderId === folderId)

    if (inJournalFolder && (inUpdatedRange || inTitleRange)) {
      ids.add(doc.id)
      continue
    }
    if (inTitleRange && inUpdatedRange) {
      ids.add(doc.id)
    }
  }

  return [...ids]
}
