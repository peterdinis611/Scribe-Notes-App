import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { syncDocumentLinks } from './links.js'
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
  deletedAt?: number | null
}

export type CommentRow = {
  id: string
  threadId: string
  documentId: string
  author: string
  body: string
  createdAt: number
}

export type CommentThreadRow = {
  id: string
  documentId: string
  quote: string
  resolved: boolean
  createdAt: number
  comments: CommentRow[]
}

export type CommentSearchHit = {
  commentId: string
  threadId: string
  documentId: string
  documentTitle: string
  author: string
  body: string
  quote: string
  resolved: boolean
  createdAt: number
}

export type TagCount = {
  tag: string
  count: number
}

export type DocumentRevisionSummary = {
  id: string
  documentId: string
  title: string
  createdAt: number
}

export type DocumentRevisionDetail = DocumentRevisionSummary & {
  plainText: string
  contentJson: string
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
  deleted_at?: number | null
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
    ...(row.deleted_at != null ? { deletedAt: row.deleted_at } : {}),
  }
}

function normalizeTags(tags: string[]): string[] {
  const cleaned = tags
    .map((tag) => tag.trim())
    .filter(Boolean)
  cleaned.sort()
  return [...new Set(cleaned)]
}

function encodeTags(tags: string[]): string {
  return JSON.stringify(normalizeTags(tags))
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

  private syncLinks(documentId: string, contentJson: string) {
    syncDocumentLinks(this.db, documentId, contentJson)
  }

  private resolveWikiTarget = (label: string): string | null => {
    const docs = this.findDocumentsByTitle(label, 5)
    const exact = docs.find((doc) => doc.title.toLowerCase() === label.toLowerCase())
    return exact?.id ?? null
  }

  private runWritable<T>(operation: () => T): T {
    this.requireWritable()
    try {
      return operation()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/locked|busy/i.test(message)) {
        throw new Error(
          `Scribe database is locked (app may be open). Retry in a moment. (${message})`,
        )
      }
      throw error
    }
  }

  createNote(input: {
    title: string
    content?: string
    folderId?: string | null
  }): { id: string; title: string } {
    const title = input.title.trim()
    if (!title) throw new Error('title is required')

    return this.runWritable(() => {
      const id = randomUUID()
      const now = Date.now()
      const contentJson = plainTextToTipTap(input.content ?? '', this.resolveWikiTarget)
      const folderId = input.folderId ?? null

      this.db
        .prepare(
          `INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, ?, ?)`,
        )
        .run(id, title, contentJson, folderId, now, now)
      this.syncFts(id, title, contentJson)
      this.syncLinks(id, contentJson)

      return { id, title }
    })
  }

  appendToNote(input: { id: string; text: string }): { id: string; title: string } {
    const id = input.id.trim()
    const text = input.text
    if (!id) throw new Error('id is required')
    if (!text) throw new Error('text is required')

    return this.runWritable(() => {
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
      doc.content.push(
        ...(plainTextToParagraphNodes(text, this.resolveWikiTarget) as Array<Record<string, unknown>>),
      )

      const contentJson = JSON.stringify(doc)
      const now = Date.now()

      this.db
        .prepare(`UPDATE documents SET content_json = ?, updated_at = ? WHERE id = ?`)
        .run(contentJson, now, id)
      this.syncFts(id, row.title, contentJson)
      this.syncLinks(id, contentJson)

      return { id, title: row.title }
    })
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

  listFavorites(limit = 50): DocumentSummary[] {
    const max = Math.min(200, Math.max(1, limit))
    const rows = this.db
      .prepare(
        `${SUMMARY_SELECT}
         WHERE deleted_at IS NULL AND is_favorite = 1
         ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(max) as Array<Parameters<typeof mapSummary>[0]>
    return rows.map(mapSummary)
  }

  listPinned(limit = 50): DocumentSummary[] {
    const max = Math.min(200, Math.max(1, limit))
    const rows = this.db
      .prepare(
        `${SUMMARY_SELECT}
         WHERE deleted_at IS NULL AND is_pinned = 1
         ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(max) as Array<Parameters<typeof mapSummary>[0]>
    return rows.map(mapSummary)
  }

  listTrashedDocuments(limit = 50): DocumentSummary[] {
    const max = Math.min(200, Math.max(1, limit))
    const rows = this.db
      .prepare(
        `${SUMMARY_SELECT}
         WHERE deleted_at IS NOT NULL
         ORDER BY deleted_at DESC LIMIT ?`,
      )
      .all(max) as Array<Parameters<typeof mapSummary>[0]>
    return rows.map(mapSummary)
  }

  restoreDocument(id: string): { id: string; title: string } {
    return this.runWritable(() => {
      const row = this.db
        .prepare(
          `SELECT id, title, content_json, deleted_at FROM documents WHERE id = ?`,
        )
        .get(id) as
        | { id: string; title: string; content_json: string; deleted_at: number | null }
        | undefined

      if (!row) throw new Error(`Document not found: ${id}`)
      if (row.deleted_at == null) throw new Error(`Document is not in trash: ${id}`)

      this.db.prepare(`UPDATE documents SET deleted_at = NULL WHERE id = ?`).run(id)
      this.syncFts(id, row.title, row.content_json)
      this.syncLinks(id, row.content_json)

      return { id: row.id, title: row.title }
    })
  }

  purgeDocument(id: string): { id: string } {
    return this.runWritable(() => {
      const row = this.db
        .prepare(`SELECT id FROM documents WHERE id = ?`)
        .get(id) as { id: string } | undefined
      if (!row) throw new Error(`Document not found: ${id}`)

      this.db.prepare('DELETE FROM documents WHERE id = ?').run(id)
      this.db.prepare('DELETE FROM documents_fts WHERE document_id = ?').run(id)

      return { id }
    })
  }

  listTags(): TagCount[] {
    const rows = this.db
      .prepare(`SELECT tags FROM documents WHERE deleted_at IS NULL AND tags IS NOT NULL`)
      .all() as Array<{ tags: string | null }>

    const counts = new Map<string, number>()
    for (const row of rows) {
      for (const tag of parseTags(row.tags)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }

    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  }

  searchByTag(tag: string, limit = 50): DocumentSummary[] {
    const needle = tag.trim()
    if (!needle) return []
    const max = Math.min(200, Math.max(1, limit))

    const rows = this.db
      .prepare(
        `${SUMMARY_SELECT}
         WHERE deleted_at IS NULL
           AND EXISTS (
             SELECT 1 FROM json_each(documents.tags)
             WHERE value = ?
           )
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(needle, max) as Array<Parameters<typeof mapSummary>[0]>

    return rows.map(mapSummary)
  }

  setDocumentTags(id: string, tags: string[]): { id: string; tags: string[] } {
    return this.runWritable(() => {
      const row = this.db
        .prepare(`SELECT id, deleted_at FROM documents WHERE id = ?`)
        .get(id) as { id: string; deleted_at: number | null } | undefined

      if (!row || row.deleted_at != null) {
        throw new Error(`Document not found: ${id}`)
      }

      const normalized = normalizeTags(tags)
      this.db
        .prepare(`UPDATE documents SET tags = ? WHERE id = ?`)
        .run(encodeTags(normalized), id)

      return { id, tags: normalized }
    })
  }

  createFolder(input: { name: string; parentId?: string | null }): FolderRow & {
    createdAt: number
    updatedAt: number
  } {
    const name = input.name.trim()
    if (!name) throw new Error('name is required')

    return this.runWritable(() => {
      if (input.parentId) {
        const parent = this.db
          .prepare(`SELECT id FROM folders WHERE id = ?`)
          .get(input.parentId) as { id: string } | undefined
        if (!parent) throw new Error(`Parent folder not found: ${input.parentId}`)
      }

      const id = randomUUID()
      const now = Date.now()
      this.db
        .prepare(
          `INSERT INTO folders (id, name, parent_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(id, name, input.parentId ?? null, now, now)

      return {
        id,
        name,
        parentId: input.parentId ?? null,
        isPinned: false,
        createdAt: now,
        updatedAt: now,
      }
    })
  }

  renameFolder(input: { id: string; name: string }): FolderRow & {
    createdAt: number
    updatedAt: number
  } {
    const name = input.name.trim()
    if (!name) throw new Error('name is required')

    return this.runWritable(() => {
      const now = Date.now()
      const updated = this.db
        .prepare(`UPDATE folders SET name = ?, updated_at = ? WHERE id = ?`)
        .run(name, now, input.id)

      if (updated.changes === 0) throw new Error(`Folder not found: ${input.id}`)

      const row = this.db
        .prepare(
          `SELECT id, name, parent_id, created_at, updated_at, is_pinned FROM folders WHERE id = ?`,
        )
        .get(input.id) as {
        id: string
        name: string
        parent_id: string | null
        created_at: number
        updated_at: number
        is_pinned: number
      }

      return {
        id: row.id,
        name: row.name,
        parentId: row.parent_id,
        isPinned: row.is_pinned !== 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    })
  }

  moveDocumentToFolder(input: { documentId: string; folderId?: string | null }): {
    documentId: string
    folderId: string | null
  } {
    return this.runWritable(() => {
      const doc = this.db
        .prepare(`SELECT id, deleted_at FROM documents WHERE id = ?`)
        .get(input.documentId) as { id: string; deleted_at: number | null } | undefined

      if (!doc || doc.deleted_at != null) {
        throw new Error(`Document not found: ${input.documentId}`)
      }

      if (input.folderId) {
        const folder = this.db
          .prepare(`SELECT id FROM folders WHERE id = ?`)
          .get(input.folderId) as { id: string } | undefined
        if (!folder) throw new Error(`Folder not found: ${input.folderId}`)
      }

      const now = Date.now()
      this.db
        .prepare(`UPDATE documents SET folder_id = ?, updated_at = ? WHERE id = ?`)
        .run(input.folderId ?? null, now, input.documentId)

      return { documentId: input.documentId, folderId: input.folderId ?? null }
    })
  }

  listCommentThreads(documentId: string): CommentThreadRow[] {
    const threads = this.db
      .prepare(
        `SELECT id, document_id, quote, resolved, created_at
         FROM comment_threads
         WHERE document_id = ?
         ORDER BY created_at ASC`,
      )
      .all(documentId) as Array<{
      id: string
      document_id: string
      quote: string
      resolved: number
      created_at: number
    }>

    if (threads.length === 0) return []

    const comments = this.db
      .prepare(
        `SELECT id, thread_id, document_id, author, body, created_at
         FROM comments
         WHERE document_id = ?
         ORDER BY thread_id ASC, created_at ASC`,
      )
      .all(documentId) as Array<{
      id: string
      thread_id: string
      document_id: string
      author: string
      body: string
      created_at: number
    }>

    const grouped = new Map<string, CommentRow[]>()
    for (const comment of comments) {
      const bucket = grouped.get(comment.thread_id) ?? []
      bucket.push({
        id: comment.id,
        threadId: comment.thread_id,
        documentId: comment.document_id,
        author: comment.author,
        body: comment.body,
        createdAt: comment.created_at,
      })
      grouped.set(comment.thread_id, bucket)
    }

    return threads.map((thread) => ({
      id: thread.id,
      documentId: thread.document_id,
      quote: thread.quote,
      resolved: thread.resolved !== 0,
      createdAt: thread.created_at,
      comments: grouped.get(thread.id) ?? [],
    }))
  }

  searchComments(query: string, limit = 20): CommentSearchHit[] {
    const q = query.trim()
    if (!q) return []
    const max = Math.min(100, Math.max(1, limit))
    const pattern = `%${q.replaceAll('%', '')}%`

    const rows = this.db
      .prepare(
        `SELECT c.id AS comment_id, c.thread_id, c.document_id, c.author, c.body, c.created_at,
                t.quote, t.resolved, d.title AS document_title
         FROM comments c
         JOIN comment_threads t ON t.id = c.thread_id
         JOIN documents d ON d.id = c.document_id
         WHERE d.deleted_at IS NULL
           AND (c.body LIKE ? OR t.quote LIKE ?)
         ORDER BY c.created_at DESC
         LIMIT ?`,
      )
      .all(pattern, pattern, max) as Array<{
      comment_id: string
      thread_id: string
      document_id: string
      author: string
      body: string
      created_at: number
      quote: string
      resolved: number
      document_title: string
    }>

    return rows.map((row) => ({
      commentId: row.comment_id,
      threadId: row.thread_id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      author: row.author,
      body: row.body,
      quote: row.quote,
      resolved: row.resolved !== 0,
      createdAt: row.created_at,
    }))
  }

  listDocumentRevisions(documentId: string, limit = 20): DocumentRevisionSummary[] {
    const max = Math.min(50, Math.max(1, limit))
    const rows = this.db
      .prepare(
        `SELECT id, document_id, title, created_at
         FROM document_revisions
         WHERE document_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(documentId, max) as Array<{
      id: string
      document_id: string
      title: string
      created_at: number
    }>

    return rows.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      title: row.title,
      createdAt: row.created_at,
    }))
  }

  getDocumentRevision(revisionId: string): DocumentRevisionDetail | null {
    const row = this.db
      .prepare(
        `SELECT id, document_id, title, content_json, created_at
         FROM document_revisions WHERE id = ?`,
      )
      .get(revisionId) as
      | {
          id: string
          document_id: string
          title: string
          content_json: string
          created_at: number
        }
      | undefined

    if (!row) return null

    return {
      id: row.id,
      documentId: row.document_id,
      title: row.title,
      createdAt: row.created_at,
      contentJson: row.content_json,
      plainText: tiptapToPlainText(row.content_json),
    }
  }
}
