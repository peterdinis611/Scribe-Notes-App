# MCP tool reference

All tools return JSON text in the MCP `content` payload (pretty-printed). Errors set `isError: true` with a message.

Server name: `scribe-memory`

---

## `scribe_status`

Health check for the configured database.

**Arguments:** none

**Example result:**

```json
{
  "ok": true,
  "dbPath": "/Users/…/com.scribe.app/scribe.db",
  "writable": true,
  "sampleDocumentCount": 1,
  "edgeCount": 3,
  "orphanCount": 12
}
```

`writable` is `true` when create/append tools can mutate the DB.

---

## `create_note`

Create a new document. Plain text becomes TipTap paragraphs. Requires a writable connection.

| Arg | Type | Required | Default | Notes |
|-----|------|----------|---------|--------|
| `title` | string | yes | — | Note title |
| `content` | string | no | empty doc | Initial body (plain text) |
| `folderId` | string | no | `null` | Folder id |

**Example result:** `{ "id": "…", "title": "Meeting notes" }`

If Scribe holds a lock, the tool returns an error — retry shortly.

---

## `append_to_note`

Append plain-text paragraphs to an existing document. Requires a writable connection.

| Arg | Type | Required | Notes |
|-----|------|----------|--------|
| `id` | string | yes | Document id |
| `text` | string | yes | Newlines become separate paragraphs |

**Example result:** `{ "id": "…", "title": "Meeting notes" }`

---

## `search_documents`

Full-text search over titles and bodies (`documents_fts` / FTS5).

| Arg | Type | Required | Default | Notes |
|-----|------|----------|---------|--------|
| `query` | string | yes | — | Search string |
| `limit` | number | no | `10` | 1–50 |

**Example call:** `{ "query": "report", "limit": 5 }`

**Example result:**

```json
{
  "query": "report",
  "count": 1,
  "hits": [
    {
      "documentId": "…",
      "title": "Názov reportu",
      "snippet": "…matched text…",
      "rank": -1.2
    }
  ]
}
```

---

## `find_documents_by_title`

Case-insensitive title match (exact / prefix / contains ranking).

| Arg | Type | Required | Default |
|-----|------|----------|---------|
| `title` | string | yes | — |
| `limit` | number | no | `10` |

Useful when resolving a `[[Wiki label]]`.

---

## `get_document`

Load one document. Body is converted from TipTap JSON to **plain text** (wiki links become `[[label]]`).

| Arg | Type | Required | Default | Notes |
|-----|------|----------|---------|--------|
| `id` | string | yes | — | Document id |
| `includeJson` | boolean | no | `false` | Also return raw `contentJson` |

**Example result (trimmed):**

```json
{
  "id": "…",
  "title": "Bez názvu",
  "folderId": null,
  "createdAt": 0,
  "updatedAt": 0,
  "tags": [],
  "plainText": "First paragraph\n\nSecond paragraph"
}
```

---

## `list_documents`

Non-trashed documents, newest first.

| Arg | Type | Required | Default |
|-----|------|----------|---------|
| `folderId` | string | no | — |
| `limit` | number | no | `50` (max 200) |

Each item includes `id`, `title`, `folderId`, `updatedAt`, `isFavorite`, `isPinned`, `tags`.

---

## `list_folders`

All folders (`id`, `name`, `parentId`, `isPinned`).

**Arguments:** none

---

## `list_backlinks`

Documents that link **to** `id` via wiki links (`document_links`).

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |

---

## `list_outgoing_links`

Documents linked **from** `id`.

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |

---

## `list_link_graph`

Full connection map.

**Arguments:** none

**Result shape:**

```json
{
  "edgeCount": 1,
  "orphanCount": 6,
  "edges": [
    {
      "sourceId": "…",
      "targetId": "…",
      "sourceTitle": "A",
      "targetTitle": "B"
    }
  ],
  "orphans": [{ "id": "…", "title": "…" }]
}
```

Orphans = open documents with no incoming or outgoing wiki links.

---

## Suggested tool sequences

**Recall a topic**

1. `search_documents` → pick `documentId`  
2. `get_document`  
3. optional: `list_backlinks` / `list_outgoing_links`

**Explore the library map**

1. `list_link_graph`  
2. `get_document` on interesting nodes  

**Resolve a wiki name**

1. `find_documents_by_title`  
2. `get_document`

---

## `list_favorites`

Favorite (starred) open documents.

| Arg | Type | Required | Default |
|-----|------|----------|---------|
| `limit` | number | no | `50` |

---

## `list_pinned`

Pinned open documents.

| Arg | Type | Required | Default |
|-----|------|----------|---------|
| `limit` | number | no | `50` |

---

## `list_trashed_documents`

Soft-deleted documents in trash.

| Arg | Type | Required | Default |
|-----|------|----------|---------|
| `limit` | number | no | `50` |

Each item includes `deletedAt`.

---

## `restore_document`

Restore a trashed document. **Writable mode required.**

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |

---

## `purge_document`

Permanently delete a document. **Writable mode required.**

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |

---

## `list_tags`

All tags in the library with usage counts.

**Arguments:** none

---

## `search_by_tag`

Documents with an exact tag match.

| Arg | Type | Required | Default |
|-----|------|----------|---------|
| `tag` | string | yes | — |
| `limit` | number | no | `50` |

---

## `set_document_tags`

Replace tags on a document. **Writable mode required.**

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |
| `tags` | string[] | yes |

---

## `create_folder`

Create a folder. **Writable mode required.**

| Arg | Type | Required |
|-----|------|----------|
| `name` | string | yes |
| `parentId` | string | no |

---

## `rename_folder`

Rename a folder. **Writable mode required.**

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |
| `name` | string | yes |

---

## `move_document_to_folder`

Move a document. **Writable mode required.**

| Arg | Type | Required |
|-----|------|----------|
| `documentId` | string | yes |
| `folderId` | string | no (root when omitted) |

---

## `list_comment_threads`

Comment threads and replies for one document.

| Arg | Type | Required |
|-----|------|----------|
| `documentId` | string | yes |

---

## `search_comments`

Search comment bodies and quoted passages library-wide.

| Arg | Type | Required | Default |
|-----|------|----------|---------|
| `query` | string | yes | — |
| `limit` | number | no | `20` |

---

## `list_document_revisions`

Revision history for a document (metadata only).

| Arg | Type | Required | Default |
|-----|------|----------|---------|
| `documentId` | string | yes | — |
| `limit` | number | no | `20` |

---

## `get_document_revision`

Load one revision snapshot (`plainText` + `contentJson`).

| Arg | Type | Required |
|-----|------|----------|
| `revisionId` | string | yes |

---

## Write behaviour notes

- `create_note` / `append_to_note` sync FTS and wiki-link edges (`document_links`).
- Plain-text `[[Wiki labels]]` are resolved to wiki-link nodes when a matching title exists.
