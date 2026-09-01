#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { defaultDbPath, openScribeStore, ScribeMemoryStore } from './db.js'

function textResult(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  }
}

function errorResult(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true as const,
  }
}

function createServer(): McpServer {
  const dbPath = defaultDbPath()
  let store: ScribeMemoryStore | null = null
  let writable = false
  try {
    const opened = openScribeStore(dbPath)
    store = opened.store
    writable = opened.writable
  } catch (error) {
    console.error(`[scribe-mcp] Failed to open DB at ${dbPath}:`, error)
  }

  const server = new McpServer({
    name: 'scribe-memory',
    version: '0.2.0',
  })

  function requireStore(): ScribeMemoryStore {
    if (!store) {
      throw new Error(
        `Scribe database unavailable at ${dbPath}. Open the Scribe app once, or set SCRIBE_DB_PATH.`,
      )
    }
    return store
  }

  server.tool(
    'search_documents',
    'Full-text search across Scribe notes (titles + body). Use this first when recalling facts from the user library.',
    {
      query: z.string().describe('Search query'),
      limit: z.number().int().min(1).max(50).optional().describe('Max hits (default 10)'),
    },
    async ({ query, limit }) => {
      try {
        const hits = requireStore().searchDocuments(query, limit ?? 10)
        return textResult({ query, count: hits.length, hits })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'find_documents_by_title',
    'Find documents whose title matches a string (case-insensitive). Useful when you know the note name from a [[wiki link]].',
    {
      title: z.string().describe('Title or partial title'),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ title, limit }) => {
      try {
        const docs = requireStore().findDocumentsByTitle(title, limit ?? 10)
        return textResult({ title, count: docs.length, documents: docs })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'get_document',
    'Load one Scribe document as plain text for Claude context. Prefer this after search/find. Optionally include raw TipTap JSON.',
    {
      id: z.string().describe('Document id'),
      includeJson: z
        .boolean()
        .optional()
        .describe('Include raw TipTap content_json (default false)'),
    },
    async ({ id, includeJson }) => {
      try {
        const doc = requireStore().getDocument(id, includeJson ?? false)
        if (!doc) return errorResult(`Document not found: ${id}`)
        return textResult(doc)
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'list_documents',
    'List recent open (non-trashed) documents. Optional folder filter.',
    {
      folderId: z.string().optional().describe('Folder id to filter by'),
      limit: z.number().int().min(1).max(200).optional().describe('Max documents (default 50)'),
    },
    async ({ folderId, limit }) => {
      try {
        const documents = requireStore().listDocuments({
          folderId: folderId ?? undefined,
          limit: limit ?? 50,
        })
        return textResult({ count: documents.length, documents })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'list_folders',
    'List all folders in the Scribe library.',
    async () => {
      try {
        const folders = requireStore().listFolders()
        return textResult({ count: folders.length, folders })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'list_backlinks',
    'Documents that link TO this document via [[wiki links]] (incoming connections).',
    {
      id: z.string().describe('Document id'),
    },
    async ({ id }) => {
      try {
        const documents = requireStore().listBacklinks(id)
        return textResult({ id, count: documents.length, documents })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'list_outgoing_links',
    'Documents that this document links TO via [[wiki links]] (outgoing connections).',
    {
      id: z.string().describe('Document id'),
    },
    async ({ id }) => {
      try {
        const documents = requireStore().listOutgoingLinks(id)
        return textResult({ id, count: documents.length, documents })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'list_link_graph',
    'Full wiki-link connection map: edges between documents plus orphan notes with no links.',
    async () => {
      try {
        const graph = requireStore().listLinkGraph()
        return textResult({
          edgeCount: graph.edges.length,
          orphanCount: graph.orphans.length,
          ...graph,
        })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'create_note',
    'Create a new Scribe note (writable mode). Plain text becomes TipTap paragraphs. May fail if the Scribe app locks the DB — retry.',
    {
      title: z.string().describe('Note title'),
      content: z.string().optional().describe('Optional initial body (plain text)'),
      folderId: z.string().optional().describe('Optional folder id'),
    },
    async ({ title, content, folderId }) => {
      try {
        const note = requireStore().createNote({
          title,
          content,
          folderId: folderId ?? null,
        })
        return textResult(note)
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'append_to_note',
    'Append plain text paragraphs to an existing Scribe note. May fail if the Scribe app locks the DB — retry.',
    {
      id: z.string().describe('Document id'),
      text: z.string().describe('Plain text to append (newlines become paragraphs)'),
    },
    async ({ id, text }) => {
      try {
        const note = requireStore().appendToNote({ id, text })
        return textResult(note)
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'list_favorites',
    'List favorite (starred) documents.',
    {
      limit: z.number().int().min(1).max(200).optional().describe('Max documents (default 50)'),
    },
    async ({ limit }) => {
      try {
        const documents = requireStore().listFavorites(limit ?? 50)
        return textResult({ count: documents.length, documents })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'list_pinned',
    'List pinned documents.',
    {
      limit: z.number().int().min(1).max(200).optional().describe('Max documents (default 50)'),
    },
    async ({ limit }) => {
      try {
        const documents = requireStore().listPinned(limit ?? 50)
        return textResult({ count: documents.length, documents })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'list_trashed_documents',
    'List documents in trash (soft-deleted), newest first.',
    {
      limit: z.number().int().min(1).max(200).optional().describe('Max documents (default 50)'),
    },
    async ({ limit }) => {
      try {
        const documents = requireStore().listTrashedDocuments(limit ?? 50)
        return textResult({ count: documents.length, documents })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'restore_document',
    'Restore a trashed document back to the library. Writable mode required.',
    {
      id: z.string().describe('Document id'),
    },
    async ({ id }) => {
      try {
        const result = requireStore().restoreDocument(id)
        return textResult(result)
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'purge_document',
    'Permanently delete a document from trash. Writable mode required.',
    {
      id: z.string().describe('Document id'),
    },
    async ({ id }) => {
      try {
        const result = requireStore().purgeDocument(id)
        return textResult(result)
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'list_tags',
    'List all tags used in the library with document counts.',
    async () => {
      try {
        const tags = requireStore().listTags()
        return textResult({ count: tags.length, tags })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'search_by_tag',
    'Find open documents that have an exact tag.',
    {
      tag: z.string().describe('Exact tag name'),
      limit: z.number().int().min(1).max(200).optional().describe('Max documents (default 50)'),
    },
    async ({ tag, limit }) => {
      try {
        const documents = requireStore().searchByTag(tag, limit ?? 50)
        return textResult({ tag, count: documents.length, documents })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'set_document_tags',
    'Replace tags on a document. Writable mode required.',
    {
      id: z.string().describe('Document id'),
      tags: z.array(z.string()).describe('Full tag list (replaces existing tags)'),
    },
    async ({ id, tags }) => {
      try {
        const result = requireStore().setDocumentTags(id, tags)
        return textResult(result)
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'create_folder',
    'Create a new folder. Writable mode required.',
    {
      name: z.string().describe('Folder name'),
      parentId: z.string().optional().describe('Optional parent folder id'),
    },
    async ({ name, parentId }) => {
      try {
        const folder = requireStore().createFolder({
          name,
          parentId: parentId ?? null,
        })
        return textResult(folder)
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'rename_folder',
    'Rename a folder. Writable mode required.',
    {
      id: z.string().describe('Folder id'),
      name: z.string().describe('New folder name'),
    },
    async ({ id, name }) => {
      try {
        const folder = requireStore().renameFolder({ id, name })
        return textResult(folder)
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'move_document_to_folder',
    'Move a document to a folder (or root when folderId omitted). Writable mode required.',
    {
      documentId: z.string().describe('Document id'),
      folderId: z.string().optional().describe('Target folder id; omit for root'),
    },
    async ({ documentId, folderId }) => {
      try {
        const result = requireStore().moveDocumentToFolder({
          documentId,
          folderId: folderId ?? null,
        })
        return textResult(result)
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'list_comment_threads',
    'List comment threads (with replies) on a document.',
    {
      documentId: z.string().describe('Document id'),
    },
    async ({ documentId }) => {
      try {
        const threads = requireStore().listCommentThreads(documentId)
        return textResult({ documentId, count: threads.length, threads })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'search_comments',
    'Search comment bodies and quoted text across the library.',
    {
      query: z.string().describe('Search string'),
      limit: z.number().int().min(1).max(100).optional().describe('Max hits (default 20)'),
    },
    async ({ query, limit }) => {
      try {
        const hits = requireStore().searchComments(query, limit ?? 20)
        return textResult({ query, count: hits.length, hits })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'list_document_revisions',
    'List saved revision snapshots for a document (newest first).',
    {
      documentId: z.string().describe('Document id'),
      limit: z.number().int().min(1).max(50).optional().describe('Max revisions (default 20)'),
    },
    async ({ documentId, limit }) => {
      try {
        const revisions = requireStore().listDocumentRevisions(documentId, limit ?? 20)
        return textResult({ documentId, count: revisions.length, revisions })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'get_document_revision',
    'Load one revision snapshot (plain text + TipTap JSON).',
    {
      revisionId: z.string().describe('Revision id'),
    },
    async ({ revisionId }) => {
      try {
        const revision = requireStore().getDocumentRevision(revisionId)
        if (!revision) return errorResult(`Revision not found: ${revisionId}`)
        return textResult(revision)
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  server.tool(
    'scribe_status',
    'Health check: which Scribe database file is being used as memory, and whether writes are enabled.',
    async () => {
      try {
        const s = requireStore()
        const docs = s.listDocuments({ limit: 1 })
        const graph = s.listLinkGraph()
        return textResult({
          ok: true,
          dbPath,
          writable,
          sampleDocumentCount: docs.length,
          edgeCount: graph.edges.length,
          orphanCount: graph.orphans.length,
        })
      } catch (error) {
        return errorResult(String(error))
      }
    },
  )

  return server
}

async function main() {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`[scribe-mcp] Scribe memory MCP ready (db: ${defaultDbPath()})`)
}

main().catch((error) => {
  console.error('[scribe-mcp] fatal:', error)
  process.exit(1)
})
