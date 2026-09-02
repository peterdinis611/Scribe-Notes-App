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

Hybrid search: FTS5 + semantic RRF fusion when Local AI is enabled in Scribe. Falls back to FTS-only when NLP is off or the sidecar is unavailable.

| Arg | Type | Required | Default | Notes |
|-----|------|----------|---------|--------|
| `query` | string | yes | — | Search string |
| `limit` | number | no | `10` | 1–50 |
| `folderId` | string | no | — | Only this folder |
| `tag` | string | no | — | Exact tag |
| `fromDate` | string | no | — | `YYYY-MM-DD` (updated_at) |
| `toDate` | string | no | — | `YYYY-MM-DD` (updated_at) |

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
      "rank": -1.2,
      "matchKind": "both"
    }
  ]
}
```

---

## `search_documents_fts`

Full-text search only (no embeddings). Same arguments and result shape as `search_documents`, without semantic fusion.

| Arg | Type | Required | Default | Notes |
|-----|------|----------|---------|--------|
| `query` | string | yes | — | Search string |
| `limit` | number | no | `10` | 1–50 |

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

## `add_document_tag`

Append one tag to a document (existing tags are kept; duplicate tags are ignored). **Writable mode required.**

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |
| `tag` | string | yes |

**Example result:** `{ "id": "…", "tags": ["work", "urgent"] }`

---

## `remove_document_tag`

Remove one tag from a document. **Writable mode required.**

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |
| `tag` | string | yes |

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

## `restore_document_revision`

Restore a document to a revision snapshot. The current title/body is saved as a new revision first. **Writable mode required.** Cannot restore a trashed document — call `restore_document` first.

| Arg | Type | Required |
|-----|------|----------|
| `revisionId` | string | yes |

**Example result:** `{ "id": "…", "title": "Memo" }`

---

## `semantic_search`

Embedding-based search. Requires **Local AI** enabled in Scribe and an indexed library.

| Arg | Type | Required | Default |
|-----|------|----------|---------|
| `query` | string | yes | — |
| `limit` | number | no | `10` |

---

## `similar_documents`

Find notes semantically similar to a document (uses existing embeddings index).

| Arg | Type | Required | Default |
|-----|------|----------|---------|
| `id` | string | yes | — |
| `limit` | number | no | `8` |

---

## `extract_document_tasks`

Open tasks from checkboxes and NLP phrase patterns (`treba:`, `todo:`, …).

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |

---

## `nlp_status`

Local AI sidecar health: enabled flag, model, indexed counts, embed backend.

**Arguments:** none

---

## `search`

Unified search with explicit mode.

| Arg | Type | Required | Default | Notes |
|-----|------|----------|---------|--------|
| `query` | string | yes | — | Search string |
| `limit` | number | no | `10` | 1–50 |
| `mode` | string | no | `hybrid` | `hybrid`, `semantic`, or `fts` |
| `folderId` | string | no | — | Only this folder |
| `tag` | string | no | — | Exact tag |
| `fromDate` | string | no | — | `YYYY-MM-DD` |
| `toDate` | string | no | — | `YYYY-MM-DD` |

---

## `journal_summary`

Summarize journal entries in a date range (title prefix `YYYY-MM-DD` or folder + date filter). Requires Local AI.

| Arg | Type | Required | Notes |
|-----|------|----------|--------|
| `fromDate` | string | yes | `YYYY-MM-DD` |
| `toDate` | string | yes | `YYYY-MM-DD` |
| `journalFolderId` | string | no | Limit to folder |
| `documentIds` | string[] | no | Explicit ids (skips date filter) |

**Example result:** `{ "summary": "…", "bullets": ["…"], "documentCount": 3 }`

---

## `summarize_document`

Summarize one note. Requires **Local AI**.

| Arg | Type | Required | Default | Notes |
|-----|------|----------|---------|--------|
| `id` | string | yes | — | Document id |
| `maxSentences` | number | no | `4` | 1–12 |

**Example result:** `{ "documentId": "…", "title": "Memo", "summary": "…", "bullets": ["…"] }`

---

## `suggest_tags`

Entity extraction and tag suggestions for one document. Requires Local AI.

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |

---

## `library_report`

AI-generated markdown overview of the whole library plus stats. Requires Local AI.

**Arguments:** none

---

## `journal_tasks`

Open tasks from multiple documents (checkboxes + NLP phrases).

| Arg | Type | Required |
|-----|------|----------|
| `documentIds` | string[] | yes |

---

## `list_open_tasks`

Open (unchecked) tasks across the library. Checkboxes always; NLP phrases (`todo:`, `treba:`, …) only when `includePhrases` is true and Local AI is enabled.

| Arg | Type | Required | Default | Notes |
|-----|------|----------|---------|--------|
| `folderId` | string | no | — | Limit to one folder |
| `limit` | number | no | `200` | Max documents to scan (1–500) |
| `includePhrases` | boolean | no | `false` | Run NLP phrase extraction |

**Example result:**

```json
{
  "count": 2,
  "includePhrases": false,
  "tasks": [
    {
      "text": "Buy milk",
      "checked": false,
      "source": "checkbox",
      "documentId": "…",
      "documentTitle": "Shopping"
    }
  ]
}
```

---

## `get_or_create_journal`

Return today's journal note, or create it. Reuses the app's `Journal` / `Denník` folder and title patterns (`YYYY-MM-DD`, `YYYY-MM-DD — morning` / `ráno`, `YYYY-MM-DD — evening` / `večer`). Existing notes are readable without write access; creating requires a writable DB.

| Arg | Type | Required | Default | Notes |
|-----|------|----------|---------|--------|
| `slot` | string | no | `day` | `day`, `morning`, or `evening` |
| `date` | string | no | today (local) | `YYYY-MM-DD` |

**Example result:** `{ "id": "…", "title": "2026-09-02", "folderId": "…", "date": "2026-09-02", "slot": "day", "created": true, "plainText": "…" }`

After this, use `append_to_note` to write into the journal.

---

## `index_document` / `index_all_documents`

Build or refresh embedding index for semantic search. Requires Local AI.

| Tool | Args |
|------|------|
| `index_document` | `id` |
| `index_all_documents` | none |

---

## `trash_document`

Soft-delete a document (moves to trash).

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |

---

## `rename_document`

Change document title.

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |
| `title` | string | yes |

---

## `replace_document_content`

Replace entire body with plain text (previous content saved as revision).

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |
| `content` | string | yes |

---

## `set_document_favorite` / `set_document_pinned`

Toggle favorite or pinned flag.

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |
| `value` | boolean | yes |

---

## Write behaviour notes

- `create_note` / `append_to_note` / `get_or_create_journal` / `restore_document_revision` / `duplicate_document` / `toggle_task` / `delete_folder` sync FTS and wiki-link edges (`document_links`).
- Plain-text `[[Wiki labels]]` are resolved to wiki-link nodes when a matching title exists.

---

## `list_nlp_artifacts`

Cached Local AI outputs (`journal_summary`, `library_report`). Includes parsed `payload`.

| Arg | Type | Required | Default |
|-----|------|----------|---------|
| `kind` | string | no | all kinds |
| `limit` | number | no | `20` |

---

## `duplicate_document`

Copy a note. **Writable.** Default title `{title} (copy)`.

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |
| `title` | string | no |

---

## `empty_trash`

Permanently delete every trashed document. **Writable.**

---

## `delete_folder` / `move_folder` / `set_folder_pinned`

Folder write parity with the app. `delete_folder` soft-deletes documents in the subtree first.

| Tool | Args |
|------|------|
| `delete_folder` | `id` |
| `move_folder` | `id`, optional `parentId` |
| `set_folder_pinned` | `id`, `value` |

---

## `create_comment_thread` / `add_comment_reply`

| Tool | Args |
|------|------|
| `create_comment_thread` | `documentId`, `body`, optional `quote`, `author` |
| `add_comment_reply` | `threadId`, `body`, optional `author` |

Default `author` is `scribe-mcp`.

---

## `export_document`

| Arg | Type | Required | Default |
|-----|------|----------|---------|
| `id` | string | yes | — |
| `format` | string | no | `markdown` | `markdown` or `plain` |

Result: `{ "id", "title", "format", "content" }`.

---

## `toggle_task`

Find the first checkbox whose text matches `text` (case-insensitive) and toggle or set `checked`.

| Arg | Type | Required |
|-----|------|----------|
| `id` | string | yes |
| `text` | string | yes |
| `checked` | boolean | no (toggle) |

---

## `get_document_outline`

Heading TOC for one note (`level` + `text`). Prefer this over loading full `plainText`.

---

## `list_unresolved_wiki_links`

`[[label]]` / wiki-link nodes whose `targetId` is missing or points at a deleted/unknown document.

---

## `list_graph_hubs`

Notes ranked by backlinks + outgoing wiki links. Use instead of dumping `list_link_graph`.

---

## Resources

| URI | Content |
|-----|---------|
| `scribe://doc/{id}` | Plain-text note body |
| `scribe://artifact/{id}` | Cached NLP JSON |

`resources/list` returns recent notes. Template: `scribe://doc/{id}`.

---

## Prompts

| Prompt | Purpose |
|--------|---------|
| `weekly_journal_review` | Optional `fromDate` / `toDate` — reuse artifacts, then journal_summary + tasks |
| `capture_today` | get_or_create_journal + append_to_note |
| `open_tasks_triage` | list_open_tasks, then toggle_task |
| `wiki_health` | hubs + unresolved wiki links |
