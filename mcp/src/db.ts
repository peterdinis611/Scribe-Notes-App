import Database from 'better-sqlite3'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { tiptapToPlainText } from './plain-text.js'

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

export function openScribeDb(dbPath = defaultDbPath()): Database.Database {
  if (!existsSync(dbPath)) {
    throw new Error(
      `Scribe database not found at ${dbPath}. Open Scribe once to create it, or set SCRIBE_DB_PATH.`,
    )
  }

  // Read-only so we coexist with the running Scribe app (WAL mode).
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  db.pragma('query_only = ON')
  return db
}

export class ScribeMemoryStore {
  constructor(private readonly db: Database.Database) {}

  close() {
    this.db.close()
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
