import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import {
  plainTextToParagraphNodes,
  plainTextToTipTap,
  tiptapToPlainText,
} from './plain-text.js'

export type DocumentSummary = {
  id: string
  title: string
  folderId: string | null
  filePath: string | null
  updatedAt: number
  isFavorite: boolean
  isPinned: boolean
  tags: string[]
}

export type SearchHit = {
  documentId: string
  title: string
  snippet: string
  rank: number
}

export type DocumentDetail = {
  id: string
  title: string
  folderId: string | null
  updatedAt: number
  createdAt: number
  tags: string[]
  plainText: string
  contentJson?: string
}

export type FolderRow = {
  id: string
  name: string
  parentId: string | null
  isPinned: boolean
}

export type LinkGraph = {
  edges: Array<{
    sourceId: string
    targetId: string
    sourceTitle: string
    targetTitle: string
  }>
  orphans: Array<{ id: string; title: string }>
}

const SUMMARY_SELECT =
  'SELECT id, title, folder_id, file_path, updated_at, is_favorite, is_pinned, tags, deleted_at FROM documents'

function parseTags(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : []
  } catch {
    return raw
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  }
}

function mapSummary(row: {
  id: string
  title: string
  folder_id: string | null
  file_path: string | null
  updated_at: number
  is_favorite: number
  is_pinned: number
  tags: string | null
}): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    folderId: row.folder_id,
    filePath: row.file_path,
    updatedAt: row.updated_at,
    isFavorite: row.is_favorite !== 0,
    isPinned: row.is_pinned !== 0,
    tags: parseTags(row.tags),
  }
}

/** Default Scribe DB path on macOS (Tauri app_data_dir for com.scribe.app). */
export function defaultDbPath(): string {
  if (process.env.SCRIBE_DB_PATH) return process.env.SCRIBE_DB_PATH
  return join(homedir(), 'Library', 'Application Support', 'com.scribe.app', 'scribe.db')
}

function assertDbExists(dbPath: string) {
  if (!existsSync(dbPath)) {
    throw new Error(
      `Scribe database not found at ${dbPath}. Open Scribe once to create it, or set SCRIBE_DB_PATH.`,
    )
  }
}

/** Read-only open — safe while the Scribe app holds the DB (WAL). */
export function openScribeDb(dbPath = defaultDbPath()): Database.Database {
  assertDbExists(dbPath)
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  db.pragma('query_only = ON')
  return db
}

/** Writable open for create / append tools. May fail if Scribe holds an exclusive lock. */
export function openScribeDbWritable(dbPath = defaultDbPath()): Database.Database {
  assertDbExists(dbPath)
  const db = new Database(dbPath, { fileMustExist: true })
  db.pragma('journal_mode = WAL')
  return db
}

export type OpenStoreResult = {
  store: ScribeMemoryStore
  writable: boolean
}

/**
 * Prefer a writable connection so create/append work.
 * Falls back to readonly if the DB is locked (e.g. Scribe app open).
 * Set SCRIBE_MCP_WRITE=0 to force readonly.
 */
export function openScribeStore(dbPath = defaultDbPath()): OpenStoreResult {
  const forceReadonly = process.env.SCRIBE_MCP_WRITE === '0'
  if (!forceReadonly) {
    try {
      const db = openScribeDbWritable(dbPath)
      return { store: new ScribeMemoryStore(db, true), writable: true }
    } catch (error) {
      console.error(
        `[scribe-mcp] Writable open failed (falling back to readonly):`,
        error instanceof Error ? error.message : error,
      )
    }
  }

  const db = openScribeDb(dbPath)
  return { store: new ScribeMemoryStore(db, false), writable: false }
}

type TipTapDoc = {
  type?: string
  content?: Array<Record<string, unknown>>
}

export class ScribeMemoryStore {
  constructor(
    private readonly db: Database.Database,
    readonly writable = false,
  ) {}

  close() {
    this.db.close()
  }

  private requireWritable() {
    if (!this.writable) {
      throw new Error(
        'Database is open read-only. Close Scribe (or retry) so MCP can open a writable connection, or unset SCRIBE_MCP_WRITE=0.',
      )
    }
  }

  private syncFts(documentId: string, title: string, contentJson: string) {
    const body = tiptapToPlainText(contentJson)
    this.db.prepare('DELETE FROM documents_fts WHERE document_id = ?').run(documentId)
    this.db
      .prepare('INSERT INTO documents_fts (document_id, title, body) VALUES (?, ?, ?)')
      .run(documentId, title, body)
  }

  createNote(input: {
    title: string
    content?: string
    folderId?: string | null
  }): { id: string; title: string } {
    this.requireWritable()
    const title = input.title.trim()
    if (!title) throw new Error('title is required')

    const id = randomUUID()
    const now = Date.now()
    const contentJson = plainTextToTipTap(input.content ?? '')
    const folderId = input.folderId ?? null

    try {
      this.db
        .prepare(
          `INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, ?, ?)`,
        )
        .run(id, title, contentJson, folderId, now, now)
      this.syncFts(id, title, contentJson)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/locked|busy/i.test(message)) {
        throw new Error(
          `Scribe database is locked (app may be open). Retry in a moment. (${message})`,
        )
      }
      throw error
    }

    return { id, title }
  }

  appendToNote(input: { id: string; text: string }): { id: string; title: string } {
    this.requireWritable()
    const id = input.id.trim()
    const text = input.text
    if (!id) throw new Error('id is required')
    if (!text) throw new Error('text is required')

    const row = this.db
      .prepare(
        `SELECT id, title, content_json, deleted_at FROM documents WHERE id = ?`,
      )
      .get(id) as
      | { id: string; title: string; content_json: string; deleted_at: number | null }
      | undefined

    if (!row || row.deleted_at != null) {
      throw new Error(`Document not found: ${id}`)
    }

    let doc: TipTapDoc
    try {
      doc = JSON.parse(row.content_json) as TipTapDoc
    } catch {
      doc = { type: 'doc', content: [] }
    }
    if (!Array.isArray(doc.content)) doc.content = []
    doc.type = doc.type ?? 'doc'
    doc.content.push(...(plainTextToParagraphNodes(text) as Array<Record<string, unknown>>))

    const contentJson = JSON.stringify(doc)
    const now = Date.now()

    try {
      this.db
        .prepare(`UPDATE documents SET content_json = ?, updated_at = ? WHERE id = ?`)
        .run(contentJson, now, id)
      this.syncFts(id, row.title, contentJson)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/locked|busy/i.test(message)) {
        throw new Error(
          `Scribe database is locked (app may be open). Retry in a moment. (${message})`,
        )
      }
      throw error
    }

    return { id, title: row.title }
  }

  searchDocuments(query: string, limit = 10): SearchHit[] {
    const q = query.trim()
    if (!q) return []
    const max = Math.min(50, Math.max(1, limit))
    const ftsQuery = `"${q.replaceAll('"', '')}" OR ${q.replaceAll('"', '')}*`

    const rows = this.db
      .prepare(
        `SELECT document_id, title,
                snippet(documents_fts, 2, '', '', '…', 32) AS snippet,
                bm25(documents_fts) AS rank
         FROM documents_fts
         WHERE documents_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(ftsQuery, max) as Array<{
      document_id: string
      title: string
      snippet: string
      rank: number
    }>

    return rows.map((row) => ({
      documentId: row.document_id,
      title: row.title,
      snippet: row.snippet,
      rank: row.rank,
    }))
  }

  listDocuments(options?: { folderId?: string | null; limit?: number }): DocumentSummary[] {
    const limit = Math.min(200, Math.max(1, options?.limit ?? 50))
    if (options?.folderId) {
      const rows = this.db
        .prepare(
          `${SUMMARY_SELECT} WHERE deleted_at IS NULL AND folder_id = ? ORDER BY updated_at DESC LIMIT ?`,
        )
        .all(options.folderId, limit) as Array<Parameters<typeof mapSummary>[0]>
      return rows.map(mapSummary)
    }

    const rows = this.db
      .prepare(`${SUMMARY_SELECT} WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`)
      .all(limit) as Array<Parameters<typeof mapSummary>[0]>
    return rows.map(mapSummary)
  }

  findDocumentsByTitle(titleQuery: string, limit = 10): DocumentSummary[] {
    const q = titleQuery.trim()
    if (!q) return []
    const max = Math.min(50, Math.max(1, limit))
    const rows = this.db
      .prepare(
        `${SUMMARY_SELECT}
         WHERE deleted_at IS NULL AND title LIKE ? COLLATE NOCASE
         ORDER BY
           CASE WHEN title = ? COLLATE NOCASE THEN 0
                WHEN title LIKE ? COLLATE NOCASE THEN 1
                ELSE 2 END,
           updated_at DESC
         LIMIT ?`,
      )
      .all(`%${q}%`, q, `${q}%`, max) as Array<Parameters<typeof mapSummary>[0]>
    return rows.map(mapSummary)
  }

  getDocument(id: string, includeJson = false): DocumentDetail | null {
    const row = this.db
      .prepare(
        `SELECT id, title, content_json, folder_id, created_at, updated_at, tags, deleted_at
         FROM documents WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string
          title: string
          content_json: string
          folder_id: string | null
          created_at: number
          updated_at: number
          tags: string | null
          deleted_at: number | null
        }
      | undefined

    if (!row || row.deleted_at != null) return null

    return {
      id: row.id,
      title: row.title,
      folderId: row.folder_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tags: parseTags(row.tags),
      plainText: tiptapToPlainText(row.content_json),
      ...(includeJson ? { contentJson: row.content_json } : {}),
    }
  }

  listFolders(): FolderRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, parent_id, is_pinned FROM folders ORDER BY name COLLATE NOCASE`,
      )
      .all() as Array<{
      id: string
      name: string
      parent_id: string | null
      is_pinned: number
    }>

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      isPinned: row.is_pinned !== 0,
    }))
  }

  listBacklinks(id: string): DocumentSummary[] {
    const rows = this.db
      .prepare(
        `SELECT d.id, d.title, d.folder_id, d.file_path, d.updated_at,
                d.is_favorite, d.is_pinned, d.tags, d.deleted_at
         FROM document_links l
         JOIN documents d ON d.id = l.source_id
         WHERE l.target_id = ? AND d.deleted_at IS NULL
         ORDER BY d.updated_at DESC`,
      )
      .all(id) as Array<Parameters<typeof mapSummary>[0]>
    return rows.map(mapSummary)
  }

  listOutgoingLinks(id: string): DocumentSummary[] {
    const rows = this.db
      .prepare(
        `SELECT d.id, d.title, d.folder_id, d.file_path, d.updated_at,
                d.is_favorite, d.is_pinned, d.tags, d.deleted_at
         FROM document_links l
         JOIN documents d ON d.id = l.target_id
         WHERE l.source_id = ? AND d.deleted_at IS NULL
         ORDER BY d.updated_at DESC`,
      )
      .all(id) as Array<Parameters<typeof mapSummary>[0]>
    return rows.map(mapSummary)
  }

  listLinkGraph(): LinkGraph {
    const edges = this.db
      .prepare(
        `SELECT l.source_id, l.target_id, s.title AS source_title, t.title AS target_title
         FROM document_links l
         JOIN documents s ON s.id = l.source_id AND s.deleted_at IS NULL
         JOIN documents t ON t.id = l.target_id AND t.deleted_at IS NULL
         ORDER BY s.title, t.title`,
      )
      .all() as Array<{
      source_id: string
      target_id: string
      source_title: string
      target_title: string
    }>

    const orphans = this.db
      .prepare(
        `SELECT d.id, d.title FROM documents d
         WHERE d.deleted_at IS NULL
           AND d.id NOT IN (SELECT source_id FROM document_links)
           AND d.id NOT IN (SELECT target_id FROM document_links)
         ORDER BY d.title COLLATE NOCASE`,
      )
      .all() as Array<{ id: string; title: string }>

    return {
      edges: edges.map((edge) => ({
        sourceId: edge.source_id,
        targetId: edge.target_id,
        sourceTitle: edge.source_title,
        targetTitle: edge.target_title,
      })),
      orphans,
    }
  }
}
