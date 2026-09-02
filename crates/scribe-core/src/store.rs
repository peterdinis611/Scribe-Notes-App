use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use regex::Regex;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::db::migrations;
use crate::db::{
    fuse_search_hits, search_documents_in_conn, SearchHit, SearchMode,
};
use crate::db::{
    count_embeddings, count_stale_embeddings, dominant_embedding_model, extract_search_text,
    fetch_revision, get_document_embedding, get_embed_backend, is_nlp_enabled, remove_document_fts,
    restore_document_content, save_artifact, save_revision, semantic_search, similar_documents,
    sync_document_fts, sync_document_links, upsert_embedding,
};
use crate::nlp::{script_path_label, NlpSidecar};
use crate::path::default_db_path;
use crate::plain_text::{
    document_outline, plain_text_to_paragraph_nodes, plain_text_to_tiptap, tiptap_to_markdown,
    tiptap_to_plain_text, toggle_matching_task, OutlineItem,
};
use crate::tasks::{
    append_phrase_tasks, extract_checkbox_tasks, merge_document_tasks, DocumentTask,
};

const SUMMARY_SELECT: &str =
    "SELECT id, title, folder_id, file_path, updated_at, is_favorite, is_pinned, tags, deleted_at FROM documents";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
    pub file_path: Option<String>,
    pub updated_at: i64,
    pub is_favorite: bool,
    pub is_pinned: bool,
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentRow {
    pub id: String,
    pub thread_id: String,
    pub document_id: String,
    pub author: String,
    pub body: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentThreadRow {
    pub id: String,
    pub document_id: String,
    pub quote: String,
    pub resolved: bool,
    pub created_at: i64,
    pub comments: Vec<CommentRow>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentSearchHit {
    pub comment_id: String,
    pub thread_id: String,
    pub document_id: String,
    pub document_title: String,
    pub author: String,
    pub body: String,
    pub quote: String,
    pub resolved: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub tag: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRevisionSummary {
    pub id: String,
    pub document_id: String,
    pub title: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRevisionDetail {
    pub id: String,
    pub document_id: String,
    pub title: String,
    pub created_at: i64,
    pub plain_text: String,
    pub content_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentDetail {
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
    pub updated_at: i64,
    pub created_at: i64,
    pub tags: Vec<String>,
    pub plain_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_json: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderRow {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub is_pinned: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderDetail {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub is_pinned: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkEdge {
    pub source_id: String,
    pub target_id: String,
    pub source_title: String,
    pub target_title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrphanDocument {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkGraph {
    pub edges: Vec<LinkEdge>,
    pub orphans: Vec<OrphanDocument>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdTitle {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdTags {
    pub id: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveDocumentResult {
    pub document_id: String,
    pub folder_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurgeResult {
    pub id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalSummary {
    pub summary: String,
    pub bullets: Vec<String>,
    pub document_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpEntity {
    pub text: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagSuggestions {
    pub entities: Vec<NlpEntity>,
    pub tag_suggestions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryReport {
    pub markdown: String,
    pub stats: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexResult {
    pub indexed: i64,
    pub model: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentNlpSummary {
    pub document_id: String,
    pub title: String,
    pub summary: String,
    pub bullets: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JournalSlot {
    Day,
    Morning,
    Evening,
}

impl JournalSlot {
    pub fn parse(value: Option<&str>) -> Result<Self, String> {
        match value.unwrap_or("day").trim().to_lowercase().as_str() {
            "" | "day" | "today" => Ok(Self::Day),
            "morning" | "rano" | "ráno" => Ok(Self::Morning),
            "evening" | "vecer" | "večer" => Ok(Self::Evening),
            other => Err(format!(
                "Invalid journal slot: {other}. Use day, morning, or evening."
            )),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Day => "day",
            Self::Morning => "morning",
            Self::Evening => "evening",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalNote {
    pub id: String,
    pub title: String,
    pub folder_id: String,
    pub date: String,
    pub slot: String,
    pub created: bool,
    pub plain_text: String,
}

pub struct JournalSummaryInput {
    pub from_date: String,
    pub to_date: String,
    pub journal_folder_id: Option<String>,
    pub document_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default)]
pub struct SearchFilter {
    pub folder_id: Option<String>,
    pub tag: Option<String>,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
}

impl SearchFilter {
    pub fn is_empty(&self) -> bool {
        option_blank(&self.folder_id)
            && option_blank(&self.tag)
            && option_blank(&self.from_date)
            && option_blank(&self.to_date)
    }
}

fn option_blank(value: &Option<String>) -> bool {
    value
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .is_empty()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpArtifact {
    pub id: String,
    pub kind: String,
    pub created_at: i64,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmptyTrashResult {
    pub purged: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFolderResult {
    pub id: String,
    pub trashed_document_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateResult {
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportDocument {
    pub id: String,
    pub title: String,
    pub format: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleTaskResult {
    pub id: String,
    pub text: String,
    pub checked: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentOutline {
    pub document_id: String,
    pub title: String,
    pub headings: Vec<OutlineItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnresolvedWikiLink {
    pub document_id: String,
    pub document_title: String,
    pub label: String,
    pub target_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphHub {
    pub id: String,
    pub title: String,
    pub backlinks: i64,
    pub outgoing: i64,
}

pub struct ScribeStore {
    db: Connection,
    writable: bool,
}

pub struct OpenStoreResult {
    pub store: ScribeStore,
    pub writable: bool,
    pub db_path: PathBuf,
}

impl ScribeStore {
    pub fn is_writable(&self) -> bool {
        self.writable
    }

    #[cfg(test)]
    fn from_memory() -> Self {
        Self {
            db: crate::db::test_helpers::in_memory_conn(),
            writable: true,
        }
    }

    pub fn close(self) {}

    fn require_writable(&self) -> Result<(), String> {
        if !self.writable {
            return Err(
                "Database is open read-only. Close Scribe (or retry) so MCP can open a writable connection, or unset SCRIBE_MCP_WRITE=0.".to_string(),
            );
        }
        Ok(())
    }

    fn run_writable<T, F>(&self, operation: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        self.require_writable()?;
        match operation(&self.db) {
            Ok(value) => Ok(value),
            Err(message) => {
                if message.contains("locked") || message.contains("busy") {
                    Err(format!(
                        "Scribe database is locked (app may be open). Retry in a moment. ({message})"
                    ))
                } else {
                    Err(message)
                }
            }
        }
    }

    fn now_ms() -> i64 {
        chrono::Utc::now().timestamp_millis()
    }

    fn parse_tags(raw: Option<String>) -> Vec<String> {
        let Some(raw) = raw.filter(|value| !value.is_empty()) else {
            return Vec::new();
        };
        if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
            if let Some(array) = parsed.as_array() {
                return array
                    .iter()
                    .filter_map(|item| item.as_str().map(str::to_string))
                    .collect();
            }
        }
        raw.split(',')
            .map(str::trim)
            .filter(|tag| !tag.is_empty())
            .map(str::to_string)
            .collect()
    }

    fn normalize_tags(tags: &[String]) -> Vec<String> {
        let mut cleaned: Vec<String> = tags
            .iter()
            .map(|tag| tag.trim().to_string())
            .filter(|tag| !tag.is_empty())
            .collect();
        cleaned.sort();
        cleaned.dedup();
        cleaned
    }

    fn encode_tags(tags: &[String]) -> String {
        serde_json::to_string(&Self::normalize_tags(tags)).unwrap_or_else(|_| "[]".to_string())
    }

    fn map_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<DocumentSummary> {
        let deleted_at: Option<i64> = row.get(8)?;
        Ok(DocumentSummary {
            id: row.get(0)?,
            title: row.get(1)?,
            folder_id: row.get(2)?,
            file_path: row.get(3)?,
            updated_at: row.get(4)?,
            is_favorite: row.get::<_, i64>(5)? != 0,
            is_pinned: row.get::<_, i64>(6)? != 0,
            tags: Self::parse_tags(row.get(7)?),
            deleted_at,
        })
    }

    fn collect_wiki_labels(text: &str) -> Vec<String> {
        static WIKI: OnceLock<Regex> = OnceLock::new();
        let pattern = WIKI.get_or_init(|| Regex::new(r"\[\[([^\]]+)\]\]").expect("wiki regex"));
        pattern
            .captures_iter(text)
            .filter_map(|cap| cap.get(1).map(|item| item.as_str().trim().to_string()))
            .filter(|label| !label.is_empty())
            .collect()
    }

    fn resolve_wiki_target(&self, label: &str) -> Option<String> {
        let docs = self.find_documents_by_title(label, 5).unwrap_or_default();
        docs.into_iter()
            .find(|doc| doc.title.eq_ignore_ascii_case(label))
            .map(|doc| doc.id)
    }

    fn resolve_wiki_labels(&self, text: &str) -> HashMap<String, Option<String>> {
        let mut map = HashMap::new();
        for label in Self::collect_wiki_labels(text) {
            map.entry(label.clone())
                .or_insert_with(|| self.resolve_wiki_target(&label));
        }
        map
    }

    fn wiki_resolver_from_map(
        map: &HashMap<String, Option<String>>,
    ) -> impl Fn(&str) -> Option<String> + '_ {
        move |label: &str| map.get(label).cloned().flatten()
    }

    pub fn create_note(
        &self,
        title: &str,
        content: Option<&str>,
        folder_id: Option<&str>,
    ) -> Result<IdTitle, String> {
        let title = title.trim();
        if title.is_empty() {
            return Err("title is required".to_string());
        }

        let body = content.unwrap_or("");
        let wiki_map: &'static HashMap<String, Option<String>> =
            Box::leak(Box::new(self.resolve_wiki_labels(body)));
        let resolver = Self::wiki_resolver_from_map(wiki_map);
        let content_json = plain_text_to_tiptap(body, Some(&resolver));
        let folder_id = folder_id.map(str::to_string);

        self.run_writable(|db| {
            let id = Uuid::new_v4().to_string();
            let now = Self::now_ms();
            db.execute(
                "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5)",
                params![id, title, content_json, folder_id, now],
            )
            .map_err(|e| e.to_string())?;
            sync_document_fts(db, &id, title, &content_json)?;
            sync_document_links(db, &id, &content_json)?;
            Ok(IdTitle {
                id,
                title: title.to_string(),
            })
        })
    }

    pub fn append_to_note(&self, id: &str, text: &str) -> Result<IdTitle, String> {
        let id = id.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }
        if text.is_empty() {
            return Err("text is required".to_string());
        }

        let wiki_map: &'static HashMap<String, Option<String>> =
            Box::leak(Box::new(self.resolve_wiki_labels(text)));
        let resolver = Self::wiki_resolver_from_map(wiki_map);
        let new_nodes = plain_text_to_paragraph_nodes(text, Some(&resolver));

        self.run_writable(|db| {
            let row: Option<(String, String, Option<i64>)> = db
                .query_row(
                    "SELECT title, content_json, deleted_at FROM documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((title, content_json, deleted_at)) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document not found: {id}"));
            }

            let mut doc: Value = serde_json::from_str(&content_json).unwrap_or_else(|_| {
                json!({ "type": "doc", "content": [] })
            });
            if !doc.get("content").and_then(|value| value.as_array()).is_some() {
                doc["content"] = json!([]);
            }
            if doc.get("type").and_then(|value| value.as_str()).is_none() {
                doc["type"] = json!("doc");
            }

            if let Some(content) = doc.get_mut("content").and_then(|value| value.as_array_mut()) {
                content.extend(new_nodes);
            }

            let content_json = serde_json::to_string(&doc).unwrap_or(content_json);
            let now = Self::now_ms();
            db.execute(
                "UPDATE documents SET content_json = ?1, updated_at = ?2 WHERE id = ?3",
                params![content_json, now, id],
            )
            .map_err(|e| e.to_string())?;
            sync_document_fts(db, id, &title, &content_json)?;
            sync_document_links(db, id, &content_json)?;

            Ok(IdTitle {
                id: id.to_string(),
                title,
            })
        })
    }

    pub fn search_documents_fts(&self, query: &str, limit: i64) -> Result<Vec<SearchHit>, String> {
        let hits = search_documents_in_conn(&self.db, query, limit)?;
        Ok(hits
            .into_iter()
            .map(|mut hit| {
                hit.match_kind = Some("fts".to_string());
                hit
            })
            .collect())
    }

    pub fn search_documents(
        &self,
        sidecar: &NlpSidecar,
        query: &str,
        limit: i64,
    ) -> Result<Vec<SearchHit>, String> {
        let mode = if is_nlp_enabled(&self.db)? {
            SearchMode::Hybrid
        } else {
            SearchMode::Fts
        };
        search_library(&self.db, sidecar, query, limit, mode)
    }

    pub fn list_documents(
        &self,
        folder_id: Option<&str>,
        limit: Option<i64>,
    ) -> Result<Vec<DocumentSummary>, String> {
        let limit = limit.unwrap_or(50).clamp(1, 200);
        let filter_folder = folder_id.filter(|value| !value.is_empty());
        let mut stmt = if filter_folder.is_some() {
            self.db
                .prepare(&format!(
                    "{SUMMARY_SELECT} WHERE deleted_at IS NULL AND folder_id = ?1 ORDER BY updated_at DESC LIMIT ?2"
                ))
                .map_err(|e| e.to_string())?
        } else {
            self.db
                .prepare(&format!(
                    "{SUMMARY_SELECT} WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?1"
                ))
                .map_err(|e| e.to_string())?
        };

        let rows = if let Some(folder_id) = filter_folder {
            stmt.query_map(params![folder_id, limit], Self::map_summary)
        } else {
            stmt.query_map(params![limit], Self::map_summary)
        }
        .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn find_documents_by_title(
        &self,
        title_query: &str,
        limit: i64,
    ) -> Result<Vec<DocumentSummary>, String> {
        let q = title_query.trim();
        if q.is_empty() {
            return Ok(Vec::new());
        }
        let max = limit.clamp(1, 50);
        let pattern = format!("%{q}%");
        let prefix = format!("{q}%");

        let mut stmt = self
            .db
            .prepare(&format!(
                "{SUMMARY_SELECT}
                 WHERE deleted_at IS NULL AND title LIKE ?1 COLLATE NOCASE
                 ORDER BY
                   CASE WHEN title = ?2 COLLATE NOCASE THEN 0
                        WHEN title LIKE ?3 COLLATE NOCASE THEN 1
                        ELSE 2 END,
                   updated_at DESC
                 LIMIT ?4"
            ))
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![pattern, q, prefix, max], Self::map_summary)
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn get_document(
        &self,
        id: &str,
        include_json: bool,
    ) -> Result<Option<DocumentDetail>, String> {
        let row = self
            .db
            .query_row(
                "SELECT id, title, content_json, folder_id, created_at, updated_at, tags, deleted_at
                 FROM documents WHERE id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, i64>(4)?,
                        row.get::<_, i64>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<i64>>(7)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let Some((
            id,
            title,
            content_json,
            folder_id,
            created_at,
            updated_at,
            tags_raw,
            deleted_at,
        )) = row
        else {
            return Ok(None);
        };
        if deleted_at.is_some() {
            return Ok(None);
        }

        Ok(Some(DocumentDetail {
            id,
            title,
            folder_id,
            created_at,
            updated_at,
            tags: Self::parse_tags(tags_raw),
            plain_text: tiptap_to_plain_text(&content_json),
            content_json: if include_json {
                Some(content_json)
            } else {
                None
            },
        }))
    }

    pub fn list_folders(&self) -> Result<Vec<FolderRow>, String> {
        let mut stmt = self
            .db
            .prepare(
                "SELECT id, name, parent_id, is_pinned FROM folders ORDER BY name COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(FolderRow {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    parent_id: row.get(2)?,
                    is_pinned: row.get::<_, i64>(3)? != 0,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn list_backlinks(&self, id: &str) -> Result<Vec<DocumentSummary>, String> {
        let mut stmt = self
            .db
            .prepare(
                "SELECT d.id, d.title, d.folder_id, d.file_path, d.updated_at,
                        d.is_favorite, d.is_pinned, d.tags, d.deleted_at
                 FROM document_links l
                 JOIN documents d ON d.id = l.source_id
                 WHERE l.target_id = ?1 AND d.deleted_at IS NULL
                 ORDER BY d.updated_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![id], Self::map_summary)
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn list_outgoing_links(&self, id: &str) -> Result<Vec<DocumentSummary>, String> {
        let mut stmt = self
            .db
            .prepare(
                "SELECT d.id, d.title, d.folder_id, d.file_path, d.updated_at,
                        d.is_favorite, d.is_pinned, d.tags, d.deleted_at
                 FROM document_links l
                 JOIN documents d ON d.id = l.target_id
                 WHERE l.source_id = ?1 AND d.deleted_at IS NULL
                 ORDER BY d.updated_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![id], Self::map_summary)
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn list_link_graph(&self) -> Result<LinkGraph, String> {
        let mut edge_stmt = self
            .db
            .prepare(
                "SELECT l.source_id, l.target_id, s.title AS source_title, t.title AS target_title
                 FROM document_links l
                 JOIN documents s ON s.id = l.source_id AND s.deleted_at IS NULL
                 JOIN documents t ON t.id = l.target_id AND t.deleted_at IS NULL
                 ORDER BY s.title, t.title",
            )
            .map_err(|e| e.to_string())?;

        let edges = edge_stmt
            .query_map([], |row| {
                Ok(LinkEdge {
                    source_id: row.get(0)?,
                    target_id: row.get(1)?,
                    source_title: row.get(2)?,
                    target_title: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        let mut orphan_stmt = self
            .db
            .prepare(
                "SELECT d.id, d.title FROM documents d
                 WHERE d.deleted_at IS NULL
                   AND d.id NOT IN (SELECT source_id FROM document_links)
                   AND d.id NOT IN (SELECT target_id FROM document_links)
                 ORDER BY d.title COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;

        let orphans = orphan_stmt
            .query_map([], |row| {
                Ok(OrphanDocument {
                    id: row.get(0)?,
                    title: row.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok(LinkGraph { edges, orphans })
    }

    pub fn list_favorites(&self, limit: i64) -> Result<Vec<DocumentSummary>, String> {
        let max = limit.clamp(1, 200);
        let mut stmt = self
            .db
            .prepare(&format!(
                "{SUMMARY_SELECT}
                 WHERE deleted_at IS NULL AND is_favorite = 1
                 ORDER BY updated_at DESC LIMIT ?1"
            ))
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![max], Self::map_summary)
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn list_pinned(&self, limit: i64) -> Result<Vec<DocumentSummary>, String> {
        let max = limit.clamp(1, 200);
        let mut stmt = self
            .db
            .prepare(&format!(
                "{SUMMARY_SELECT}
                 WHERE deleted_at IS NULL AND is_pinned = 1
                 ORDER BY updated_at DESC LIMIT ?1"
            ))
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![max], Self::map_summary)
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn list_trashed_documents(&self, limit: i64) -> Result<Vec<DocumentSummary>, String> {
        let max = limit.clamp(1, 200);
        let mut stmt = self
            .db
            .prepare(&format!(
                "{SUMMARY_SELECT}
                 WHERE deleted_at IS NOT NULL
                 ORDER BY deleted_at DESC LIMIT ?1"
            ))
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![max], Self::map_summary)
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn restore_document(&self, id: &str) -> Result<IdTitle, String> {
        self.run_writable(|db| {
            let row: Option<(String, String, Option<i64>)> = db
                .query_row(
                    "SELECT title, content_json, deleted_at FROM documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((title, content_json, deleted_at)) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_none() {
                return Err(format!("Document is not in trash: {id}"));
            }

            db.execute("UPDATE documents SET deleted_at = NULL WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
            sync_document_fts(db, id, &title, &content_json)?;
            sync_document_links(db, id, &content_json)?;

            Ok(IdTitle {
                id: id.to_string(),
                title,
            })
        })
    }

    pub fn purge_document(&self, id: &str) -> Result<PurgeResult, String> {
        self.run_writable(|db| {
            let exists: Option<String> = db
                .query_row("SELECT id FROM documents WHERE id = ?1", params![id], |row| {
                    row.get(0)
                })
                .optional()
                .map_err(|e| e.to_string())?;

            if exists.is_none() {
                return Err(format!("Document not found: {id}"));
            }

            db.execute("DELETE FROM documents WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
            remove_document_fts(db, id)?;

            Ok(PurgeResult {
                id: id.to_string(),
            })
        })
    }

    pub fn list_tags(&self) -> Result<Vec<TagCount>, String> {
        let mut stmt = self
            .db
            .prepare("SELECT tags FROM documents WHERE deleted_at IS NULL AND tags IS NOT NULL")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| row.get::<_, Option<String>>(0))
            .map_err(|e| e.to_string())?;

        let mut counts: HashMap<String, i64> = HashMap::new();
        for row in rows {
            for tag in Self::parse_tags(row.map_err(|e| e.to_string())?) {
                *counts.entry(tag).or_insert(0) += 1;
            }
        }

        let mut tags: Vec<TagCount> = counts
            .into_iter()
            .map(|(tag, count)| TagCount { tag, count })
            .collect();
        tags.sort_by(|left, right| {
            right
                .count
                .cmp(&left.count)
                .then_with(|| left.tag.cmp(&right.tag))
        });
        Ok(tags)
    }

    pub fn search_by_tag(&self, tag: &str, limit: i64) -> Result<Vec<DocumentSummary>, String> {
        let needle = tag.trim();
        if needle.is_empty() {
            return Ok(Vec::new());
        }
        let max = limit.clamp(1, 200);

        let mut stmt = self
            .db
            .prepare(&format!(
                "{SUMMARY_SELECT}
                 WHERE deleted_at IS NULL
                   AND EXISTS (
                     SELECT 1 FROM json_each(documents.tags)
                     WHERE value = ?1
                   )
                 ORDER BY updated_at DESC
                 LIMIT ?2"
            ))
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![needle, max], Self::map_summary)
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn set_document_tags(&self, id: &str, tags: &[String]) -> Result<IdTags, String> {
        self.run_writable(|db| {
            let row: Option<Option<i64>> = db
                .query_row(
                    "SELECT deleted_at FROM documents WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some(deleted_at) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document not found: {id}"));
            }

            let normalized = Self::normalize_tags(tags);
            db.execute(
                "UPDATE documents SET tags = ?1 WHERE id = ?2",
                params![Self::encode_tags(&normalized), id],
            )
            .map_err(|e| e.to_string())?;

            Ok(IdTags {
                id: id.to_string(),
                tags: normalized,
            })
        })
    }

    pub fn add_document_tag(&self, id: &str, tag: &str) -> Result<IdTags, String> {
        let tag = tag.trim();
        if tag.is_empty() {
            return Err("tag is required".to_string());
        }

        self.run_writable(|db| add_document_tag_in_conn(db, id, tag))
    }

    pub fn remove_document_tag(&self, id: &str, tag: &str) -> Result<IdTags, String> {
        let tag = tag.trim();
        if tag.is_empty() {
            return Err("tag is required".to_string());
        }

        self.run_writable(|db| remove_document_tag_in_conn(db, id, tag))
    }

    pub fn create_folder(
        &self,
        name: &str,
        parent_id: Option<&str>,
    ) -> Result<FolderDetail, String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("name is required".to_string());
        }

        self.run_writable(|db| {
            if let Some(parent_id) = parent_id {
                let parent: Option<String> = db
                    .query_row(
                        "SELECT id FROM folders WHERE id = ?1",
                        params![parent_id],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(|e| e.to_string())?;
                if parent.is_none() {
                    return Err(format!("Parent folder not found: {parent_id}"));
                }
            }

            let id = Uuid::new_v4().to_string();
            let now = Self::now_ms();
            let parent_id = parent_id.map(str::to_string);
            db.execute(
                "INSERT INTO folders (id, name, parent_id, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?4)",
                params![id, name, parent_id, now],
            )
            .map_err(|e| e.to_string())?;

            Ok(FolderDetail {
                id,
                name: name.to_string(),
                parent_id,
                is_pinned: false,
                created_at: now,
                updated_at: now,
            })
        })
    }

    pub fn rename_folder(&self, id: &str, name: &str) -> Result<FolderDetail, String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("name is required".to_string());
        }

        self.run_writable(|db| {
            let now = Self::now_ms();
            let updated = db
                .execute(
                    "UPDATE folders SET name = ?1, updated_at = ?2 WHERE id = ?3",
                    params![name, now, id],
                )
                .map_err(|e| e.to_string())?;
            if updated == 0 {
                return Err(format!("Folder not found: {id}"));
            }

            db.query_row(
                "SELECT id, name, parent_id, created_at, updated_at, is_pinned FROM folders WHERE id = ?1",
                params![id],
                |row| {
                    Ok(FolderDetail {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        parent_id: row.get(2)?,
                        created_at: row.get(3)?,
                        updated_at: row.get(4)?,
                        is_pinned: row.get::<_, i64>(5)? != 0,
                    })
                },
            )
            .map_err(|e| e.to_string())
        })
    }

    pub fn move_document_to_folder(
        &self,
        document_id: &str,
        folder_id: Option<&str>,
    ) -> Result<MoveDocumentResult, String> {
        self.run_writable(|db| {
            let doc: Option<Option<i64>> = db
                .query_row(
                    "SELECT deleted_at FROM documents WHERE id = ?1",
                    params![document_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some(deleted_at) = doc else {
                return Err(format!("Document not found: {document_id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document not found: {document_id}"));
            }

            if let Some(folder_id) = folder_id {
                let folder: Option<String> = db
                    .query_row(
                        "SELECT id FROM folders WHERE id = ?1",
                        params![folder_id],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(|e| e.to_string())?;
                if folder.is_none() {
                    return Err(format!("Folder not found: {folder_id}"));
                }
            }

            let now = Self::now_ms();
            let folder_value = folder_id.map(str::to_string);
            db.execute(
                "UPDATE documents SET folder_id = ?1, updated_at = ?2 WHERE id = ?3",
                params![folder_value, now, document_id],
            )
            .map_err(|e| e.to_string())?;

            Ok(MoveDocumentResult {
                document_id: document_id.to_string(),
                folder_id: folder_id.map(str::to_string),
            })
        })
    }

    pub fn list_comment_threads(&self, document_id: &str) -> Result<Vec<CommentThreadRow>, String> {
        let mut thread_stmt = self
            .db
            .prepare(
                "SELECT id, document_id, quote, resolved, created_at
                 FROM comment_threads
                 WHERE document_id = ?1
                 ORDER BY created_at ASC",
            )
            .map_err(|e| e.to_string())?;

        let threads: Vec<(String, String, String, i64, i64)> = thread_stmt
            .query_map(params![document_id], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get::<_, i64>(3)?,
                    row.get(4)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        if threads.is_empty() {
            return Ok(Vec::new());
        }

        let mut comment_stmt = self
            .db
            .prepare(
                "SELECT id, thread_id, document_id, author, body, created_at
                 FROM comments
                 WHERE document_id = ?1
                 ORDER BY thread_id ASC, created_at ASC",
            )
            .map_err(|e| e.to_string())?;

        let comments = comment_stmt
            .query_map(params![document_id], |row| {
                Ok(CommentRow {
                    id: row.get(0)?,
                    thread_id: row.get(1)?,
                    document_id: row.get(2)?,
                    author: row.get(3)?,
                    body: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        let mut grouped: HashMap<String, Vec<CommentRow>> = HashMap::new();
        for comment in comments {
            grouped
                .entry(comment.thread_id.clone())
                .or_default()
                .push(comment);
        }

        Ok(threads
            .into_iter()
            .map(|(id, document_id, quote, resolved, created_at)| CommentThreadRow {
                id: id.clone(),
                document_id,
                quote,
                resolved: resolved != 0,
                created_at,
                comments: grouped.remove(&id).unwrap_or_default(),
            })
            .collect())
    }

    pub fn search_comments(&self, query: &str, limit: i64) -> Result<Vec<CommentSearchHit>, String> {
        let q = query.trim();
        if q.is_empty() {
            return Ok(Vec::new());
        }
        let max = limit.clamp(1, 100);
        let pattern = format!("%{}%", q.replace('%', ""));

        let mut stmt = self
            .db
            .prepare(
                "SELECT c.id AS comment_id, c.thread_id, c.document_id, c.author, c.body, c.created_at,
                        t.quote, t.resolved, d.title AS document_title
                 FROM comments c
                 JOIN comment_threads t ON t.id = c.thread_id
                 JOIN documents d ON d.id = c.document_id
                 WHERE d.deleted_at IS NULL
                   AND (c.body LIKE ?1 OR t.quote LIKE ?2)
                 ORDER BY c.created_at DESC
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![pattern, pattern, max], |row| {
                Ok(CommentSearchHit {
                    comment_id: row.get(0)?,
                    thread_id: row.get(1)?,
                    document_id: row.get(2)?,
                    author: row.get(3)?,
                    body: row.get(4)?,
                    created_at: row.get(5)?,
                    quote: row.get(6)?,
                    resolved: row.get::<_, i64>(7)? != 0,
                    document_title: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn list_document_revisions(
        &self,
        document_id: &str,
        limit: i64,
    ) -> Result<Vec<DocumentRevisionSummary>, String> {
        let max = limit.clamp(1, 50);
        let mut stmt = self
            .db
            .prepare(
                "SELECT id, document_id, title, created_at
                 FROM document_revisions
                 WHERE document_id = ?1
                 ORDER BY created_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![document_id, max], |row| {
                Ok(DocumentRevisionSummary {
                    id: row.get(0)?,
                    document_id: row.get(1)?,
                    title: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn get_document_revision(
        &self,
        revision_id: &str,
    ) -> Result<Option<DocumentRevisionDetail>, String> {
        let row = self
            .db
            .query_row(
                "SELECT id, document_id, title, content_json, created_at
                 FROM document_revisions WHERE id = ?1",
                params![revision_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, i64>(4)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;

        Ok(row.map(
            |(id, document_id, title, content_json, created_at)| DocumentRevisionDetail {
                id,
                document_id,
                title,
                created_at,
                content_json: content_json.clone(),
                plain_text: tiptap_to_plain_text(&content_json),
            },
        ))
    }

    pub fn restore_document_revision(&self, revision_id: &str) -> Result<IdTitle, String> {
        let revision_id = revision_id.trim();
        if revision_id.is_empty() {
            return Err("revisionId is required".to_string());
        }

        self.run_writable(|db| {
            let (document_id, revision_title, revision_json) = fetch_revision(db, revision_id)
                .map_err(|error| {
                    if error.contains("neexistuje") {
                        format!("Revision not found: {revision_id}")
                    } else {
                        error
                    }
                })?;

            let row: Option<(String, String, Option<i64>)> = db
                .query_row(
                    "SELECT title, content_json, deleted_at FROM documents WHERE id = ?1",
                    params![document_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((current_title, current_json, deleted_at)) = row else {
                return Err(format!("Document not found: {document_id}"));
            };
            if deleted_at.is_some() {
                return Err(format!(
                    "Document is in trash: {document_id}. Restore it from trash first."
                ));
            }

            restore_document_content(
                db,
                &document_id,
                &revision_title,
                &revision_json,
                &current_title,
                &current_json,
                Self::now_ms(),
            )?;
            sync_document_links(db, &document_id, &revision_json)?;

            Ok(IdTitle {
                id: document_id,
                title: revision_title,
            })
        })
    }

    pub fn semantic_search_documents(
        &self,
        sidecar: &NlpSidecar,
        query: &str,
        limit: i64,
    ) -> Result<Vec<SearchHit>, String> {
        search_library(&self.db, sidecar, query, limit, SearchMode::Semantic)
    }

    pub fn similar_documents_for(
        &self,
        document_id: &str,
        limit: i64,
    ) -> Result<Vec<SearchHit>, String> {
        if !is_nlp_enabled(&self.db)? {
            return Ok(Vec::new());
        }
        let model = get_document_embedding(&self.db, document_id)?
            .map(|item| item.model);
        similar_documents(&self.db, document_id, limit, model.as_deref())
    }

    pub fn extract_document_tasks(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
    ) -> Result<Vec<DocumentTask>, String> {
        let row = self
            .db
            .query_row(
                "SELECT title, content_json, deleted_at FROM documents WHERE id = ?1",
                params![document_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<i64>>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let Some((title, content_json, deleted_at)) = row else {
            return Err(format!("Document not found: {document_id}"));
        };
        if deleted_at.is_some() {
            return Err(format!("Document not found: {document_id}"));
        }

        let mut tasks = extract_checkbox_tasks(&content_json);
        for task in &mut tasks {
            task.document_id = Some(document_id.to_string());
            task.document_title = Some(title.clone());
        }

        let nlp_enabled = is_nlp_enabled(&self.db)?;
        if nlp_enabled {
            sync_sidecar_backend(sidecar, &self.db)?;
            let text = format!("{title}\n{}", extract_search_text(&content_json));
            if let Ok(result) = sidecar.extract_tasks(&text) {
                append_phrase_tasks(&mut tasks, &result, document_id, &title);
            }
        }

        Ok(merge_document_tasks(tasks))
    }

    pub fn list_open_tasks(
        &self,
        sidecar: &NlpSidecar,
        folder_id: Option<&str>,
        limit: i64,
        include_phrases: bool,
    ) -> Result<Vec<DocumentTask>, String> {
        let limit = limit.clamp(1, 500);
        let filter_folder = folder_id.filter(|value| !value.is_empty());
        let nlp_phrases = include_phrases && is_nlp_enabled(&self.db)?;
        if nlp_phrases {
            sync_sidecar_backend(sidecar, &self.db)?;
        }

        let mut combined = Vec::new();
        if let Some(folder_id) = filter_folder {
            let mut stmt = self
                .db
                .prepare(
                    "SELECT id, title, content_json FROM documents
                     WHERE deleted_at IS NULL AND folder_id = ?1
                     ORDER BY updated_at DESC
                     LIMIT ?2",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![folder_id, limit], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })
                .map_err(|e| e.to_string())?;
            for row in rows {
                combined.push(row.map_err(|e| e.to_string())?);
            }
        } else {
            let mut stmt = self
                .db
                .prepare(
                    "SELECT id, title, content_json FROM documents
                     WHERE deleted_at IS NULL
                     ORDER BY updated_at DESC
                     LIMIT ?1",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![limit], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })
                .map_err(|e| e.to_string())?;
            for row in rows {
                combined.push(row.map_err(|e| e.to_string())?);
            }
        }

        let mut tasks_out = Vec::new();
        for (document_id, title, content_json) in combined {
            let mut tasks = extract_checkbox_tasks(&content_json);
            for task in &mut tasks {
                task.document_id = Some(document_id.clone());
                task.document_title = Some(title.clone());
            }

            if nlp_phrases {
                let text = format!("{title}\n{}", extract_search_text(&content_json));
                if let Ok(result) = sidecar.extract_tasks(&text) {
                    append_phrase_tasks(&mut tasks, &result, &document_id, &title);
                }
            }

            tasks_out.extend(tasks.into_iter().filter(|task| !task.checked));
        }

        Ok(merge_open_tasks_per_document(tasks_out))
    }

    pub fn nlp_status(&self, sidecar: &NlpSidecar) -> Result<Value, String> {
        let enabled = is_nlp_enabled(&self.db)?;
        let indexed_count = count_embeddings(&self.db)?;
        let stored_model = dominant_embedding_model(&self.db)?;
        let embed_backend = get_embed_backend(&self.db)?;
        let script_path = sidecar.script_path().to_path_buf();
        let python_bin =
            std::env::var("SCRIBE_NLP_PYTHON").unwrap_or_else(|_| "python3".to_string());
        let sidecar_available = sidecar.script_exists();

        if !enabled {
            return Ok(json!({
                "enabled": false,
                "sidecarAvailable": sidecar_available,
                "sidecarOk": false,
                "version": Value::Null,
                "model": Value::Null,
                "indexedCount": indexed_count,
                "storedModel": stored_model,
                "indexStale": false,
                "staleIndexCount": 0,
                "embedBackend": embed_backend,
                "qualityAvailable": false,
                "scriptPath": script_path_label(&script_path),
                "pythonBin": python_bin,
                "error": Value::Null,
            }));
        }

        let (health, health_error, quality_available, current_model) = if sidecar_available {
            let _ = sync_sidecar_backend(sidecar, &self.db);
            match sidecar.health() {
                Ok(health) => {
                    let quality = health.quality_available.unwrap_or(false);
                    let model = Some(health.model.clone());
                    (Some(health), None, quality, model)
                }
                Err(error) => (None, Some(error), false, None),
            }
        } else {
            (None, None, false, None)
        };

        let stale_index_count = match current_model.as_deref() {
            Some(model) if indexed_count > 0 => count_stale_embeddings(&self.db, model)?,
            _ => 0,
        };
        let index_stale =
            indexed_count > 0 && stale_index_count > 0 && current_model.is_some();

        if let Some(health) = health {
            Ok(json!({
                "enabled": true,
                "sidecarAvailable": sidecar_available,
                "sidecarOk": health.ok,
                "version": health.version,
                "model": health.model,
                "indexedCount": indexed_count,
                "storedModel": stored_model,
                "indexStale": index_stale,
                "staleIndexCount": stale_index_count,
                "embedBackend": health.embed_backend.unwrap_or(embed_backend),
                "qualityAvailable": health.quality_available.unwrap_or(quality_available),
                "scriptPath": script_path_label(&script_path),
                "pythonBin": python_bin,
                "error": Value::Null,
            }))
        } else {
            Ok(json!({
                "enabled": true,
                "sidecarAvailable": sidecar_available,
                "sidecarOk": false,
                "version": Value::Null,
                "model": Value::Null,
                "indexedCount": indexed_count,
                "storedModel": stored_model,
                "indexStale": index_stale,
                "staleIndexCount": stale_index_count,
                "embedBackend": embed_backend,
                "qualityAvailable": quality_available,
                "scriptPath": script_path_label(&script_path),
                "pythonBin": python_bin,
                "error": health_error,
            }))
        }
    }

    pub fn trash_document(&self, id: &str) -> Result<IdTitle, String> {
        let id = id.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }

        self.run_writable(|db| {
            let row: Option<(String, Option<i64>)> = db
                .query_row(
                    "SELECT title, deleted_at FROM documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((title, deleted_at)) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document is already in trash: {id}"));
            }

            let now = Self::now_ms();
            db.execute(
                "UPDATE documents SET deleted_at = ?1 WHERE id = ?2",
                params![now, id],
            )
            .map_err(|e| e.to_string())?;
            remove_document_fts(db, id)?;

            Ok(IdTitle {
                id: id.to_string(),
                title,
            })
        })
    }

    pub fn rename_document(&self, id: &str, title: &str) -> Result<IdTitle, String> {
        let id = id.trim();
        let title = title.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }
        if title.is_empty() {
            return Err("title is required".to_string());
        }

        self.run_writable(|db| {
            let row: Option<(String, String, Option<i64>)> = db
                .query_row(
                    "SELECT title, content_json, deleted_at FROM documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((_, content_json, deleted_at)) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document not found: {id}"));
            }

            let now = Self::now_ms();
            db.execute(
                "UPDATE documents SET title = ?1, updated_at = ?2 WHERE id = ?3",
                params![title, now, id],
            )
            .map_err(|e| e.to_string())?;
            sync_document_fts(db, id, title, &content_json)?;

            Ok(IdTitle {
                id: id.to_string(),
                title: title.to_string(),
            })
        })
    }

    pub fn replace_document_content(&self, id: &str, content: &str) -> Result<IdTitle, String> {
        let id = id.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }

        let wiki_map: &'static HashMap<String, Option<String>> =
            Box::leak(Box::new(self.resolve_wiki_labels(content)));
        let resolver = Self::wiki_resolver_from_map(wiki_map);
        let content_json = plain_text_to_tiptap(content, Some(&resolver));

        self.run_writable(|db| {
            let row: Option<(String, String, Option<i64>)> = db
                .query_row(
                    "SELECT title, content_json, deleted_at FROM documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((title, existing_json, deleted_at)) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document not found: {id}"));
            }

            if existing_json != content_json {
                save_revision(db, id, &title, &existing_json)?;
            }

            let now = Self::now_ms();
            db.execute(
                "UPDATE documents SET content_json = ?1, updated_at = ?2 WHERE id = ?3",
                params![content_json, now, id],
            )
            .map_err(|e| e.to_string())?;
            sync_document_fts(db, id, &title, &content_json)?;
            sync_document_links(db, id, &content_json)?;

            Ok(IdTitle {
                id: id.to_string(),
                title,
            })
        })
    }

    pub fn set_document_favorite(&self, id: &str, favorite: bool) -> Result<IdTitle, String> {
        self.set_document_flag(id, "is_favorite", favorite)
    }

    pub fn set_document_pinned(&self, id: &str, pinned: bool) -> Result<IdTitle, String> {
        self.set_document_flag(id, "is_pinned", pinned)
    }

    fn set_document_flag(&self, id: &str, column: &str, value: bool) -> Result<IdTitle, String> {
        let id = id.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }
        if column != "is_favorite" && column != "is_pinned" {
            return Err("invalid flag column".to_string());
        }

        self.run_writable(|db| {
            let row: Option<(String, Option<i64>)> = db
                .query_row(
                    "SELECT title, deleted_at FROM documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((title, deleted_at)) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document not found: {id}"));
            }

            let sql = format!("UPDATE documents SET {column} = ?1, updated_at = ?2 WHERE id = ?3");
            db.execute(&sql, params![value as i64, Self::now_ms(), id])
                .map_err(|e| e.to_string())?;

            Ok(IdTitle {
                id: id.to_string(),
                title,
            })
        })
    }

    pub fn search_with_mode(
        &self,
        sidecar: &NlpSidecar,
        query: &str,
        limit: i64,
        mode: Option<&str>,
        filter: Option<&SearchFilter>,
    ) -> Result<Vec<SearchHit>, String> {
        let enabled = is_nlp_enabled(&self.db)?;
        let search_mode = SearchMode::parse(mode, enabled);
        let filter = filter.cloned().unwrap_or_default();
        let fetch_limit = if filter.is_empty() {
            limit
        } else {
            (limit * 5).clamp(limit, 200)
        };
        let mut hits = search_library(&self.db, sidecar, query, fetch_limit, search_mode)?;
        if !filter.is_empty() {
            hits.retain(|hit| self.hit_matches_filter(hit, &filter));
            hits.truncate(limit.clamp(1, 50) as usize);
        }
        Ok(hits)
    }

    fn hit_matches_filter(&self, hit: &SearchHit, filter: &SearchFilter) -> bool {
        let row: Option<(Option<String>, Option<String>, i64)> = self
            .db
            .query_row(
                "SELECT folder_id, tags, updated_at FROM documents
                 WHERE id = ?1 AND deleted_at IS NULL",
                params![hit.document_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .ok()
            .flatten();
        let Some((folder_id, tags_raw, updated_at)) = row else {
            return false;
        };
        if let Some(wanted) = filter.folder_id.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            if folder_id.as_deref() != Some(wanted) {
                return false;
            }
        }
        if let Some(tag) = filter.tag.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            let tags = Self::parse_tags(tags_raw);
            if !tags.iter().any(|existing| existing == tag) {
                return false;
            }
        }
        if let Some(from) = filter.from_date.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            if let Ok((start, _)) = date_key_bounds_ms(from, from) {
                if updated_at < start {
                    return false;
                }
            }
        }
        if let Some(to) = filter.to_date.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            if let Ok((_, end)) = date_key_bounds_ms(to, to) {
                if updated_at > end {
                    return false;
                }
            }
        }
        true
    }

    pub fn journal_summary(
        &self,
        sidecar: &NlpSidecar,
        input: &JournalSummaryInput,
    ) -> Result<JournalSummary, String> {
        require_nlp(&self.db)?;

        let docs = load_journal_documents(&self.db, input)?;
        let count = docs.len() as i64;

        let mut combined = String::new();
        for (title, content_json) in docs {
            combined.push_str(&title);
            combined.push('\n');
            combined.push_str(&extract_search_text(&content_json));
            combined.push_str("\n\n");
        }

        if combined.trim().is_empty() {
            return Ok(JournalSummary {
                summary: String::new(),
                bullets: Vec::new(),
                document_count: 0,
            });
        }

        sync_sidecar_backend(sidecar, &self.db)?;
        let result = sidecar.summarize(&combined, 5)?;
        let (summary, bullets) = parse_sidecar_summary(&result);

        let payload = json!({
            "fromDate": input.from_date,
            "toDate": input.to_date,
            "summary": summary,
            "bullets": bullets,
            "documentCount": count,
        });
        save_artifact(
            &self.db,
            &format!("journal:{}:{}", input.from_date, input.to_date),
            "journal_summary",
            &payload.to_string(),
            chrono::Utc::now().timestamp(),
        )?;

        Ok(JournalSummary {
            summary,
            bullets,
            document_count: count,
        })
    }

    pub fn summarize_document(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
        max_sentences: Option<i64>,
    ) -> Result<DocumentNlpSummary, String> {
        require_nlp(&self.db)?;

        let row: Option<(String, String, Option<i64>)> = self
            .db
            .query_row(
                "SELECT title, content_json, deleted_at FROM documents WHERE id = ?1",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let Some((title, content_json, deleted_at)) = row else {
            return Err(format!("Document not found: {document_id}"));
        };
        if deleted_at.is_some() {
            return Err(format!("Document not found: {document_id}"));
        }

        let text = format!("{title}\n{}", extract_search_text(&content_json));
        if text.trim().is_empty() {
            return Ok(DocumentNlpSummary {
                document_id: document_id.to_string(),
                title,
                summary: String::new(),
                bullets: Vec::new(),
            });
        }

        let max_sentences = max_sentences.unwrap_or(4).clamp(1, 12);
        sync_sidecar_backend(sidecar, &self.db)?;
        let result = sidecar.summarize(&text, max_sentences)?;
        let (summary, bullets) = parse_sidecar_summary(&result);

        Ok(DocumentNlpSummary {
            document_id: document_id.to_string(),
            title,
            summary,
            bullets,
        })
    }

    pub fn suggest_tags(&self, sidecar: &NlpSidecar, document_id: &str) -> Result<TagSuggestions, String> {
        require_nlp(&self.db)?;

        let (title, content_json): (String, String) = self
            .db
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;

        let text = format!("{title}\n{}", extract_search_text(&content_json));
        sync_sidecar_backend(sidecar, &self.db)?;
        let result = sidecar.extract_entities(&text)?;

        let entities = result
            .get("entities")
            .and_then(|value| value.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| {
                        Some(NlpEntity {
                            text: item.get("text")?.as_str()?.to_string(),
                            kind: item.get("kind")?.as_str()?.to_string(),
                        })
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let tag_suggestions = result
            .get("tagSuggestions")
            .and_then(|value| value.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(str::to_string))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        Ok(TagSuggestions {
            entities,
            tag_suggestions,
        })
    }

    pub fn library_report(&self, sidecar: &NlpSidecar) -> Result<LibraryReport, String> {
        require_nlp(&self.db)?;

        let mut stmt = self
            .db
            .prepare(
                "SELECT id, title, content_json, tags, updated_at
                 FROM documents WHERE deleted_at IS NULL",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut documents = Vec::new();
        for row in rows {
            let (id, title, content_json, tags_json, updated_at) = row.map_err(|e| e.to_string())?;
            let tags = Self::parse_tags(tags_json);
            documents.push(json!({
                "id": id,
                "title": title,
                "text": extract_search_text(&content_json),
                "tags": tags,
                "updatedAt": updated_at,
            }));
        }

        sync_sidecar_backend(sidecar, &self.db)?;
        let result = sidecar.library_report(json!(documents))?;
        let markdown = result
            .get("markdown")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        let stats = result.get("stats").cloned().unwrap_or(json!({}));

        let now = chrono::Utc::now().timestamp();
        save_artifact(
            &self.db,
            &format!("library-report:{now}"),
            "library_report",
            &result.to_string(),
            now,
        )?;

        Ok(LibraryReport { markdown, stats })
    }

    pub fn journal_tasks(
        &self,
        sidecar: &NlpSidecar,
        document_ids: &[String],
    ) -> Result<Vec<DocumentTask>, String> {
        let nlp_enabled = is_nlp_enabled(&self.db)?;
        let mut combined = Vec::new();

        for document_id in document_ids {
            let row: Option<(String, String)> = self
                .db
                .query_row(
                    "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                    params![document_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((title, content_json)) = row else {
                continue;
            };

            let mut tasks = extract_checkbox_tasks(&content_json);
            for task in &mut tasks {
                task.document_id = Some(document_id.clone());
                task.document_title = Some(title.clone());
            }

            if nlp_enabled {
                sync_sidecar_backend(sidecar, &self.db)?;
                let text = format!("{title}\n{}", extract_search_text(&content_json));
                if let Ok(result) = sidecar.extract_tasks(&text) {
                    append_phrase_tasks(&mut tasks, &result, document_id, &title);
                }
            }

            combined.extend(tasks);
        }

        Ok(merge_document_tasks(combined))
    }

    pub fn index_document(&self, sidecar: &NlpSidecar, document_id: &str) -> Result<IndexResult, String> {
        require_nlp(&self.db)?;

        let (title, content_json): (String, String) = self
            .db
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;

        let text = format!("{title}\n{}", extract_search_text(&content_json));
        sync_sidecar_backend(sidecar, &self.db)?;
        let (vector, model) = sidecar.embed_text(&text)?;
        upsert_embedding(
            &self.db,
            document_id,
            &vector,
            &model,
            chrono::Utc::now().timestamp(),
        )?;

        Ok(IndexResult {
            indexed: 1,
            model,
        })
    }

    pub fn index_all_documents(&self, sidecar: &NlpSidecar) -> Result<IndexResult, String> {
        const BATCH_SIZE: usize = 24;

        require_nlp(&self.db)?;
        sync_sidecar_backend(sidecar, &self.db)?;

        let mut stmt = self
            .db
            .prepare("SELECT id, title, content_json FROM documents WHERE deleted_at IS NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut docs: Vec<(String, String)> = Vec::new();
        for row in rows {
            let (id, title, content_json) = row.map_err(|e| e.to_string())?;
            let text = format!("{title}\n{}", extract_search_text(&content_json));
            docs.push((id, text));
        }

        if docs.is_empty() {
            return Ok(IndexResult {
                indexed: 0,
                model: "none".to_string(),
            });
        }

        let mut indexed = 0i64;
        let mut model = "none".to_string();
        let now = chrono::Utc::now().timestamp();

        for chunk in docs.chunks(BATCH_SIZE) {
            let ids: Vec<String> = chunk.iter().map(|(id, _)| id.clone()).collect();
            let texts: Vec<String> = chunk.iter().map(|(_, text)| text.clone()).collect();
            let (vectors, batch_model) = sidecar.embed_batch(&texts)?;
            model = batch_model;

            for (document_id, vector) in ids.into_iter().zip(vectors.into_iter()) {
                upsert_embedding(&self.db, &document_id, &vector, &model, now)?;
                indexed += 1;
            }
        }

        Ok(IndexResult { indexed, model })
    }

    pub fn get_or_create_journal(
        &self,
        slot: JournalSlot,
        date: Option<&str>,
    ) -> Result<JournalNote, String> {
        let date = match date.map(str::trim).filter(|value| !value.is_empty()) {
            Some(value) => {
                parse_date_key(value)?;
                value.to_string()
            }
            None => chrono::Local::now().format("%Y-%m-%d").to_string(),
        };

        if let Some(existing) = find_journal_note(&self.db, &date, slot)? {
            return Ok(existing);
        }

        self.run_writable(|db| {
            if let Some(existing) = find_journal_note(db, &date, slot)? {
                return Ok(existing);
            }

            let (folder_id, folder_name) = ensure_journal_folder(db)?;
            let locale_sk = folder_name == JOURNAL_FOLDER_SK;
            let title = journal_create_title(&date, slot, locale_sk);
            let content_json = journal_content_json(&title, slot);
            let id = Uuid::new_v4().to_string();
            let now = Self::now_ms();

            db.execute(
                "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5)",
                params![id, title, content_json, folder_id, now],
            )
            .map_err(|e| e.to_string())?;
            sync_document_fts(db, &id, &title, &content_json)?;
            sync_document_links(db, &id, &content_json)?;

            Ok(JournalNote {
                id,
                title: title.clone(),
                folder_id,
                date,
                slot: slot.as_str().to_string(),
                created: true,
                plain_text: tiptap_to_plain_text(&content_json),
            })
        })
    }

    pub fn list_nlp_artifacts(
        &self,
        kind: Option<&str>,
        limit: i64,
    ) -> Result<Vec<NlpArtifact>, String> {
        let max = limit.clamp(1, 100);
        let kind = kind.map(str::trim).filter(|value| !value.is_empty());
        let mut artifacts = Vec::new();
        if let Some(kind) = kind {
            let mut stmt = self
                .db
                .prepare(
                    "SELECT id, kind, payload_json, created_at
                     FROM nlp_artifacts WHERE kind = ?1
                     ORDER BY created_at DESC LIMIT ?2",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![kind, max], map_nlp_artifact_row)
                .map_err(|e| e.to_string())?;
            for row in rows {
                artifacts.push(row.map_err(|e| e.to_string())?);
            }
        } else {
            let mut stmt = self
                .db
                .prepare(
                    "SELECT id, kind, payload_json, created_at
                     FROM nlp_artifacts
                     ORDER BY created_at DESC LIMIT ?1",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![max], map_nlp_artifact_row)
                .map_err(|e| e.to_string())?;
            for row in rows {
                artifacts.push(row.map_err(|e| e.to_string())?);
            }
        }
        Ok(artifacts)
    }

    pub fn get_nlp_artifact(&self, id: &str) -> Result<Option<NlpArtifact>, String> {
        self.db
            .query_row(
                "SELECT id, kind, payload_json, created_at FROM nlp_artifacts WHERE id = ?1",
                params![id],
                map_nlp_artifact_row,
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn duplicate_document(
        &self,
        id: &str,
        title: Option<&str>,
    ) -> Result<DuplicateResult, String> {
        let id = id.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }

        self.run_writable(|db| {
            let row: Option<(String, String, Option<String>, Option<String>, Option<i64>)> = db
                .query_row(
                    "SELECT title, content_json, folder_id, tags, deleted_at
                     FROM documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((source_title, content_json, folder_id, tags, deleted_at)) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document not found: {id}"));
            }

            let title = title
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| format!("{source_title} (copy)"));
            let new_id = Uuid::new_v4().to_string();
            let now = Self::now_ms();
            db.execute(
                "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at, tags)
                 VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5, ?6)",
                params![new_id, title, content_json, folder_id, now, tags],
            )
            .map_err(|e| e.to_string())?;
            sync_document_fts(db, &new_id, &title, &content_json)?;
            sync_document_links(db, &new_id, &content_json)?;

            Ok(DuplicateResult {
                id: new_id,
                title,
                folder_id,
            })
        })
    }

    pub fn empty_trash(&self) -> Result<EmptyTrashResult, String> {
        self.run_writable(|db| {
            let ids: Vec<String> = {
                let mut stmt = db
                    .prepare("SELECT id FROM documents WHERE deleted_at IS NOT NULL")
                    .map_err(|e| e.to_string())?;
                let rows = stmt
                    .query_map([], |row| row.get::<_, String>(0))
                    .map_err(|e| e.to_string())?;
                rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
            };
            let purged = ids.len() as i64;
            for document_id in ids {
                db.execute("DELETE FROM documents WHERE id = ?1", params![document_id])
                    .map_err(|e| e.to_string())?;
                remove_document_fts(db, &document_id)?;
            }
            Ok(EmptyTrashResult { purged })
        })
    }

    pub fn delete_folder(&self, id: &str) -> Result<DeleteFolderResult, String> {
        let id = id.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }

        self.run_writable(|db| {
            let folder_ids = collect_folder_subtree_ids(db, id)?;
            if folder_ids.is_empty() {
                return Err(format!("Folder not found: {id}"));
            }

            let document_ids = collect_document_ids_in_folders(db, &folder_ids)?;
            let now = Self::now_ms();
            let mut trashed_document_ids = Vec::new();
            for document_id in document_ids {
                db.execute(
                    "UPDATE documents SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
                    params![now, document_id],
                )
                .map_err(|e| e.to_string())?;
                remove_document_fts(db, &document_id)?;
                trashed_document_ids.push(document_id);
            }

            db.execute("DELETE FROM folders WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;

            Ok(DeleteFolderResult {
                id: id.to_string(),
                trashed_document_ids,
            })
        })
    }

    pub fn move_folder(&self, id: &str, parent_id: Option<&str>) -> Result<FolderDetail, String> {
        let id = id.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }
        if parent_id == Some(id) {
            return Err("Folder cannot be moved into itself".to_string());
        }

        self.run_writable(|db| {
            let exists: Option<String> = db
                .query_row("SELECT id FROM folders WHERE id = ?1", params![id], |row| {
                    row.get(0)
                })
                .optional()
                .map_err(|e| e.to_string())?;
            if exists.is_none() {
                return Err(format!("Folder not found: {id}"));
            }

            if let Some(parent_id) = parent_id {
                let parent: Option<String> = db
                    .query_row(
                        "SELECT id FROM folders WHERE id = ?1",
                        params![parent_id],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(|e| e.to_string())?;
                if parent.is_none() {
                    return Err(format!("Parent folder not found: {parent_id}"));
                }
                let subtree = collect_folder_subtree_ids(db, id)?;
                if subtree.iter().any(|item| item == parent_id) {
                    return Err("Folder cannot be moved into its descendant".to_string());
                }
            }

            let now = Self::now_ms();
            let parent_value = parent_id.map(str::to_string);
            db.execute(
                "UPDATE folders SET parent_id = ?1, updated_at = ?2 WHERE id = ?3",
                params![parent_value, now, id],
            )
            .map_err(|e| e.to_string())?;
            load_folder_detail(db, id)
        })
    }

    pub fn set_folder_pinned(&self, id: &str, pinned: bool) -> Result<FolderDetail, String> {
        let id = id.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }

        self.run_writable(|db| {
            let now = Self::now_ms();
            let updated = db
                .execute(
                    "UPDATE folders SET is_pinned = ?1, updated_at = ?2 WHERE id = ?3",
                    params![pinned as i64, now, id],
                )
                .map_err(|e| e.to_string())?;
            if updated == 0 {
                return Err(format!("Folder not found: {id}"));
            }
            load_folder_detail(db, id)
        })
    }

    pub fn create_comment_thread(
        &self,
        document_id: &str,
        quote: &str,
        body: &str,
        author: Option<&str>,
    ) -> Result<CommentThreadRow, String> {
        let document_id = document_id.trim();
        let body = body.trim();
        if document_id.is_empty() {
            return Err("documentId is required".to_string());
        }
        if body.is_empty() {
            return Err("body is required".to_string());
        }
        let author = author
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("scribe-mcp");

        self.run_writable(|db| {
            let exists: Option<Option<i64>> = db
                .query_row(
                    "SELECT deleted_at FROM documents WHERE id = ?1",
                    params![document_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            match exists {
                None => return Err(format!("Document not found: {document_id}")),
                Some(Some(_)) => return Err(format!("Document not found: {document_id}")),
                Some(None) => {}
            }

            let thread_id = Uuid::new_v4().to_string();
            let comment_id = Uuid::new_v4().to_string();
            let now = chrono::Utc::now().timestamp();
            db.execute(
                "INSERT INTO comment_threads (id, document_id, quote, resolved, created_at)
                 VALUES (?1, ?2, ?3, 0, ?4)",
                params![thread_id, document_id, quote, now],
            )
            .map_err(|e| e.to_string())?;
            db.execute(
                "INSERT INTO comments (id, thread_id, document_id, author, body, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![comment_id, thread_id, document_id, author, body, now],
            )
            .map_err(|e| e.to_string())?;

            Ok(CommentThreadRow {
                id: thread_id.clone(),
                document_id: document_id.to_string(),
                quote: quote.to_string(),
                resolved: false,
                created_at: now,
                comments: vec![CommentRow {
                    id: comment_id,
                    thread_id,
                    document_id: document_id.to_string(),
                    author: author.to_string(),
                    body: body.to_string(),
                    created_at: now,
                }],
            })
        })
    }

    pub fn add_comment_reply(
        &self,
        thread_id: &str,
        body: &str,
        author: Option<&str>,
    ) -> Result<CommentRow, String> {
        let thread_id = thread_id.trim();
        let body = body.trim();
        if thread_id.is_empty() {
            return Err("threadId is required".to_string());
        }
        if body.is_empty() {
            return Err("body is required".to_string());
        }
        let author = author
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("scribe-mcp");

        self.run_writable(|db| {
            let document_id: Option<String> = db
                .query_row(
                    "SELECT document_id FROM comment_threads WHERE id = ?1",
                    params![thread_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            let document_id =
                document_id.ok_or_else(|| format!("Comment thread not found: {thread_id}"))?;

            let comment_id = Uuid::new_v4().to_string();
            let now = chrono::Utc::now().timestamp();
            db.execute(
                "INSERT INTO comments (id, thread_id, document_id, author, body, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![comment_id, thread_id, document_id, author, body, now],
            )
            .map_err(|e| e.to_string())?;

            Ok(CommentRow {
                id: comment_id,
                thread_id: thread_id.to_string(),
                document_id,
                author: author.to_string(),
                body: body.to_string(),
                created_at: now,
            })
        })
    }

    pub fn export_document(&self, id: &str, format: &str) -> Result<ExportDocument, String> {
        let doc = self
            .get_document(id, true)?
            .ok_or_else(|| format!("Document not found: {id}"))?;
        let format = match format.trim().to_lowercase().as_str() {
            "" | "plain" | "text" => "plain",
            "markdown" | "md" => "markdown",
            other => {
                return Err(format!(
                    "Unsupported export format: {other}. Use markdown or plain."
                ))
            }
        };
        let content = if format == "markdown" {
            tiptap_to_markdown(doc.content_json.as_deref().unwrap_or(""))
        } else {
            doc.plain_text.clone()
        };
        Ok(ExportDocument {
            id: doc.id,
            title: doc.title,
            format: format.to_string(),
            content,
        })
    }

    pub fn toggle_task(
        &self,
        id: &str,
        text: &str,
        checked: Option<bool>,
    ) -> Result<ToggleTaskResult, String> {
        let id = id.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }

        self.run_writable(|db| {
            let row: Option<(String, String, Option<i64>)> = db
                .query_row(
                    "SELECT title, content_json, deleted_at FROM documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            let Some((title, content_json, deleted_at)) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document not found: {id}"));
            }

            let (new_json, new_checked, matched_text) =
                toggle_matching_task(&content_json, text, checked)?;
            if new_json != content_json {
                save_revision(db, id, &title, &content_json)?;
            }
            let now = Self::now_ms();
            db.execute(
                "UPDATE documents SET content_json = ?1, updated_at = ?2 WHERE id = ?3",
                params![new_json, now, id],
            )
            .map_err(|e| e.to_string())?;
            sync_document_fts(db, id, &title, &new_json)?;
            sync_document_links(db, id, &new_json)?;

            Ok(ToggleTaskResult {
                id: id.to_string(),
                text: matched_text,
                checked: new_checked,
            })
        })
    }

    pub fn get_document_outline(&self, id: &str) -> Result<DocumentOutline, String> {
        let doc = self
            .get_document(id, true)?
            .ok_or_else(|| format!("Document not found: {id}"))?;
        Ok(DocumentOutline {
            document_id: doc.id,
            title: doc.title,
            headings: document_outline(doc.content_json.as_deref().unwrap_or("")),
        })
    }

    pub fn list_unresolved_wiki_links(&self, limit: i64) -> Result<Vec<UnresolvedWikiLink>, String> {
        let max = limit.clamp(1, 500);
        let mut stmt = self
            .db
            .prepare(
                "SELECT id, title, content_json FROM documents
                 WHERE deleted_at IS NULL
                 ORDER BY updated_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut unresolved = Vec::new();
        for row in rows {
            if unresolved.len() as i64 >= max {
                break;
            }
            let (document_id, document_title, content_json) = row.map_err(|e| e.to_string())?;
            collect_unresolved_wiki(
                &self.db,
                &document_id,
                &document_title,
                &content_json,
                &mut unresolved,
                max,
            )?;
        }
        Ok(unresolved)
    }

    pub fn list_graph_hubs(&self, limit: i64) -> Result<Vec<GraphHub>, String> {
        let max = limit.clamp(1, 50);
        let mut stmt = self
            .db
            .prepare(
                "SELECT d.id, d.title,
                        COALESCE(inc.n, 0) AS backlinks,
                        COALESCE(outg.n, 0) AS outgoing
                 FROM documents d
                 LEFT JOIN (
                    SELECT l.target_id AS id, COUNT(*) AS n
                    FROM document_links l
                    JOIN documents s ON s.id = l.source_id AND s.deleted_at IS NULL
                    GROUP BY l.target_id
                 ) inc ON inc.id = d.id
                 LEFT JOIN (
                    SELECT l.source_id AS id, COUNT(*) AS n
                    FROM document_links l
                    JOIN documents t ON t.id = l.target_id AND t.deleted_at IS NULL
                    GROUP BY l.source_id
                 ) outg ON outg.id = d.id
                 WHERE d.deleted_at IS NULL
                   AND (COALESCE(inc.n, 0) + COALESCE(outg.n, 0)) > 0
                 ORDER BY (COALESCE(inc.n, 0) + COALESCE(outg.n, 0)) DESC,
                          COALESCE(inc.n, 0) DESC,
                          d.title COLLATE NOCASE
                 LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![max], |row| {
                Ok(GraphHub {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    backlinks: row.get(2)?,
                    outgoing: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }
}

fn require_nlp(conn: &Connection) -> Result<(), String> {
    if !is_nlp_enabled(conn)? {
        return Err("NLP is disabled".to_string());
    }
    Ok(())
}

fn parse_sidecar_summary(result: &Value) -> (String, Vec<String>) {
    let summary = result
        .get("summary")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let bullets = result
        .get("bullets")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    (summary, bullets)
}

fn merge_open_tasks_per_document(mut tasks: Vec<DocumentTask>) -> Vec<DocumentTask> {
    let mut seen = std::collections::HashSet::new();
    tasks.retain(|task| {
        let key = (
            task.document_id.clone().unwrap_or_default(),
            task.text.to_lowercase(),
        );
        seen.insert(key)
    });
    tasks
}

const JOURNAL_FOLDER_EN: &str = "Journal";
const JOURNAL_FOLDER_SK: &str = "Denník";

fn journal_title_candidates(date: &str, slot: JournalSlot) -> Vec<String> {
    match slot {
        JournalSlot::Day => vec![date.to_string()],
        JournalSlot::Morning => vec![
            format!("{date} — morning"),
            format!("{date} — ráno"),
        ],
        JournalSlot::Evening => vec![
            format!("{date} — evening"),
            format!("{date} — večer"),
        ],
    }
}

fn journal_create_title(date: &str, slot: JournalSlot, locale_sk: bool) -> String {
    match slot {
        JournalSlot::Day => date.to_string(),
        JournalSlot::Morning if locale_sk => format!("{date} — ráno"),
        JournalSlot::Morning => format!("{date} — morning"),
        JournalSlot::Evening if locale_sk => format!("{date} — večer"),
        JournalSlot::Evening => format!("{date} — evening"),
    }
}

fn journal_content_json(heading: &str, slot: JournalSlot) -> String {
    let mut content = vec![json!({
        "type": "heading",
        "attrs": { "level": 1 },
        "content": [{ "type": "text", "text": heading }]
    })];

    match slot {
        JournalSlot::Morning => {
            content.push(json!({
                "type": "heading",
                "attrs": { "level": 2 },
                "content": [{ "type": "text", "text": "Intentions" }]
            }));
            content.push(json!({
                "type": "taskList",
                "content": [{
                    "type": "taskItem",
                    "attrs": { "checked": false },
                    "content": [{ "type": "paragraph" }]
                }]
            }));
            content.push(json!({
                "type": "heading",
                "attrs": { "level": 2 },
                "content": [{ "type": "text", "text": "Notes" }]
            }));
            content.push(json!({ "type": "paragraph" }));
        }
        JournalSlot::Evening => {
            content.push(json!({
                "type": "heading",
                "attrs": { "level": 2 },
                "content": [{ "type": "text", "text": "Highlights" }]
            }));
            content.push(json!({ "type": "paragraph" }));
            content.push(json!({
                "type": "heading",
                "attrs": { "level": 2 },
                "content": [{ "type": "text", "text": "Reflection" }]
            }));
            content.push(json!({ "type": "paragraph" }));
        }
        JournalSlot::Day => {
            content.push(json!({ "type": "paragraph" }));
        }
    }

    serde_json::to_string(&json!({ "type": "doc", "content": content })).unwrap_or_else(|_| {
        r#"{"type":"doc","content":[{"type":"paragraph"}]}"#.to_string()
    })
}

fn find_journal_folder(conn: &Connection) -> Result<Option<(String, String)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT f.id, f.name, COUNT(d.id) AS n
             FROM folders f
             LEFT JOIN documents d ON d.folder_id = f.id AND d.deleted_at IS NULL
             WHERE f.parent_id IS NULL AND (f.name = ?1 OR f.name = ?2)
             GROUP BY f.id
             ORDER BY n DESC, f.updated_at DESC
             LIMIT 1",
        )
        .map_err(|e| e.to_string())?;
    stmt.query_row(params![JOURNAL_FOLDER_EN, JOURNAL_FOLDER_SK], |row| {
        Ok((row.get(0)?, row.get(1)?))
    })
    .optional()
    .map_err(|e| e.to_string())
}

fn ensure_journal_folder(conn: &Connection) -> Result<(String, String), String> {
    if let Some(existing) = find_journal_folder(conn)? {
        return Ok(existing);
    }

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO folders (id, name, parent_id, created_at, updated_at)
         VALUES (?1, ?2, NULL, ?3, ?3)",
        params![id, JOURNAL_FOLDER_EN, now],
    )
    .map_err(|e| e.to_string())?;
    Ok((id, JOURNAL_FOLDER_EN.to_string()))
}

fn find_journal_note(
    conn: &Connection,
    date: &str,
    slot: JournalSlot,
) -> Result<Option<JournalNote>, String> {
    let titles = journal_title_candidates(date, slot);
    let mut best: Option<(i64, i64, JournalNote)> = None;

    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.title, d.folder_id, d.content_json, d.updated_at, f.name
             FROM documents d
             LEFT JOIN folders f ON f.id = d.folder_id
             WHERE d.deleted_at IS NULL AND d.title = ?1",
        )
        .map_err(|e| e.to_string())?;

    for title in &titles {
        let rows = stmt
            .query_map(params![title], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (id, title, folder_id, content_json, updated_at, folder_name) =
                row.map_err(|e| e.to_string())?;
            let rank = match folder_name.as_deref() {
                Some(JOURNAL_FOLDER_SK) => 0,
                Some(JOURNAL_FOLDER_EN) => 1,
                _ => 2,
            };
            let note = JournalNote {
                id,
                title,
                folder_id: folder_id.unwrap_or_default(),
                date: date.to_string(),
                slot: slot.as_str().to_string(),
                created: false,
                plain_text: tiptap_to_plain_text(&content_json),
            };
            let better = match &best {
                None => true,
                Some((best_rank, best_updated, _)) => {
                    rank < *best_rank || (rank == *best_rank && updated_at > *best_updated)
                }
            };
            if better {
                best = Some((rank, updated_at, note));
            }
        }
    }

    Ok(best.map(|(_, _, note)| note))
}

fn parse_date_key(value: &str) -> Result<chrono::NaiveDate, String> {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|error| format!("Invalid date: {error}"))
}

fn date_key_bounds(from_date: &str, to_date: &str) -> Result<(i64, i64), String> {
    let from = parse_date_key(from_date)?;
    let to = parse_date_key(to_date)?;
    let start = from
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| "Invalid range start".to_string())?
        .and_utc()
        .timestamp();
    let end = to
        .and_hms_opt(23, 59, 59)
        .ok_or_else(|| "Invalid range end".to_string())?
        .and_utc()
        .timestamp();
    Ok((start, end))
}

fn date_key_bounds_ms(from_date: &str, to_date: &str) -> Result<(i64, i64), String> {
    let (start, end) = date_key_bounds(from_date, to_date)?;
    Ok((start * 1000, end * 1000 + 999))
}

fn map_nlp_artifact_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<NlpArtifact> {
    let payload_raw: String = row.get(2)?;
    let payload = serde_json::from_str(&payload_raw).unwrap_or(Value::String(payload_raw));
    Ok(NlpArtifact {
        id: row.get(0)?,
        kind: row.get(1)?,
        created_at: row.get(3)?,
        payload,
    })
}

fn load_folder_detail(db: &Connection, id: &str) -> Result<FolderDetail, String> {
    db.query_row(
        "SELECT id, name, parent_id, created_at, updated_at, is_pinned FROM folders WHERE id = ?1",
        params![id],
        |row| {
            Ok(FolderDetail {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                is_pinned: row.get::<_, i64>(5)? != 0,
            })
        },
    )
    .map_err(|e| e.to_string())
}

fn collect_folder_subtree_ids(conn: &Connection, root_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            WITH RECURSIVE folder_tree(id) AS (
                SELECT id FROM folders WHERE id = ?1
                UNION ALL
                SELECT f.id FROM folders f
                INNER JOIN folder_tree ft ON f.parent_id = ft.id
            )
            SELECT id FROM folder_tree
            "#,
        )
        .map_err(|e| e.to_string())?;
    let ids = stmt
        .query_map(params![root_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(ids)
}

fn collect_document_ids_in_folders(
    conn: &Connection,
    folder_ids: &[String],
) -> Result<Vec<String>, String> {
    if folder_ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = std::iter::repeat("?")
        .take(folder_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT id FROM documents WHERE folder_id IN ({placeholders}) AND deleted_at IS NULL"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(folder_ids.iter()), |row| row.get(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn collect_unresolved_wiki(
    conn: &Connection,
    document_id: &str,
    document_title: &str,
    content_json: &str,
    out: &mut Vec<UnresolvedWikiLink>,
    max: i64,
) -> Result<(), String> {
    let Ok(value) = serde_json::from_str::<Value>(content_json) else {
        return Ok(());
    };
    walk_unresolved_wiki(conn, document_id, document_title, &value, out, max)
}

fn walk_unresolved_wiki(
    conn: &Connection,
    document_id: &str,
    document_title: &str,
    value: &Value,
    out: &mut Vec<UnresolvedWikiLink>,
    max: i64,
) -> Result<(), String> {
    if out.len() as i64 >= max {
        return Ok(());
    }
    if value.get("type").and_then(Value::as_str) == Some("wikiLink") {
        let label = value
            .pointer("/attrs/label")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        let target_id = value
            .pointer("/attrs/targetId")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_string);
        let resolved = if let Some(target_id) = target_id.as_deref() {
            let exists: Option<String> = conn
                .query_row(
                    "SELECT id FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                    params![target_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            exists.is_some()
        } else {
            false
        };
        if !resolved && !label.is_empty() {
            out.push(UnresolvedWikiLink {
                document_id: document_id.to_string(),
                document_title: document_title.to_string(),
                label,
                target_id,
            });
        }
    }
    if let Some(content) = value.get("content").and_then(Value::as_array) {
        for child in content {
            walk_unresolved_wiki(conn, document_id, document_title, child, out, max)?;
            if out.len() as i64 >= max {
                break;
            }
        }
    }
    Ok(())
}

fn load_journal_documents(
    conn: &Connection,
    input: &JournalSummaryInput,
) -> Result<Vec<(String, String)>, String> {
    if let Some(ids) = &input.document_ids {
        let unique = ids
            .iter()
            .map(|id| id.trim().to_string())
            .filter(|id| !id.is_empty())
            .collect::<Vec<_>>();
        if !unique.is_empty() {
            let placeholders = std::iter::repeat("?")
                .take(unique.len())
                .collect::<Vec<_>>()
                .join(", ");
            let sql = format!(
                "SELECT title, content_json FROM documents
                 WHERE deleted_at IS NULL AND id IN ({placeholders})
                 ORDER BY updated_at DESC"
            );
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(rusqlite::params_from_iter(unique.iter()), |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| e.to_string())?;

            let mut docs = Vec::new();
            for row in rows {
                docs.push(row.map_err(|e| e.to_string())?);
            }
            return Ok(docs);
        }
    }

    let (start_ts, end_ts) = date_key_bounds(&input.from_date, &input.to_date)?;
    let mut stmt = conn
        .prepare(
            "SELECT title, content_json FROM documents
             WHERE deleted_at IS NULL
               AND updated_at BETWEEN ?1 AND ?2
               AND (
                 (?3 IS NOT NULL AND folder_id = ?3)
                 OR (
                   substr(title, 1, 10) GLOB '????-??-??'
                   AND substr(title, 1, 10) >= ?4
                   AND substr(title, 1, 10) <= ?5
                 )
               )
             ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(
            params![
                start_ts,
                end_ts,
                input.journal_folder_id,
                input.from_date,
                input.to_date
            ],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let mut docs = Vec::new();
    for row in rows {
        docs.push(row.map_err(|e| e.to_string())?);
    }
    Ok(docs)
}

fn add_document_tag_in_conn(db: &Connection, id: &str, tag: &str) -> Result<IdTags, String> {
    let row: Option<(Option<String>, Option<i64>)> = db
        .query_row(
            "SELECT tags, deleted_at FROM documents WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let Some((tags_raw, deleted_at)) = row else {
        return Err(format!("Document not found: {id}"));
    };
    if deleted_at.is_some() {
        return Err(format!("Document not found: {id}"));
    }

    let mut tags = ScribeStore::parse_tags(tags_raw);
    if !tags.iter().any(|existing| existing == tag) {
        tags.push(tag.to_string());
        tags = ScribeStore::normalize_tags(&tags);
        db.execute(
            "UPDATE documents SET tags = ?1 WHERE id = ?2",
            params![ScribeStore::encode_tags(&tags), id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(IdTags {
        id: id.to_string(),
        tags,
    })
}

fn remove_document_tag_in_conn(db: &Connection, id: &str, tag: &str) -> Result<IdTags, String> {
    let row: Option<(Option<String>, Option<i64>)> = db
        .query_row(
            "SELECT tags, deleted_at FROM documents WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let Some((tags_raw, deleted_at)) = row else {
        return Err(format!("Document not found: {id}"));
    };
    if deleted_at.is_some() {
        return Err(format!("Document not found: {id}"));
    }

    let mut tags = ScribeStore::parse_tags(tags_raw);
    let before = tags.len();
    tags.retain(|existing| existing != tag);
    if tags.len() != before {
        tags = ScribeStore::normalize_tags(&tags);
        db.execute(
            "UPDATE documents SET tags = ?1 WHERE id = ?2",
            params![ScribeStore::encode_tags(&tags), id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(IdTags {
        id: id.to_string(),
        tags,
    })
}

/// Append one tag to a document (no-op if the tag is already present).
pub fn add_document_tag(conn: &Connection, id: &str, tag: &str) -> Result<IdTags, String> {
    let tag = tag.trim();
    if tag.is_empty() {
        return Err("tag is required".to_string());
    }
    add_document_tag_in_conn(conn, id, tag)
}

/// Remove one tag from a document.
pub fn remove_document_tag(conn: &Connection, id: &str, tag: &str) -> Result<IdTags, String> {
    let tag = tag.trim();
    if tag.is_empty() {
        return Err("tag is required".to_string());
    }
    remove_document_tag_in_conn(conn, id, tag)
}

pub fn sync_sidecar_backend(sidecar: &NlpSidecar, conn: &Connection) -> Result<(), String> {
    let backend = get_embed_backend(conn)?;
    let _ = sidecar.configure_embed_backend(&backend);
    Ok(())
}

pub fn search_library(
    conn: &Connection,
    sidecar: &NlpSidecar,
    query: &str,
    limit: i64,
    mode: SearchMode,
) -> Result<Vec<SearchHit>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    match mode {
        SearchMode::Fts => {
            let hits = search_documents_in_conn(conn, q, limit)?;
            Ok(hits
                .into_iter()
                .map(|mut hit| {
                    hit.match_kind = Some("fts".to_string());
                    hit
                })
                .collect())
        }
        SearchMode::Semantic => {
            if !is_nlp_enabled(conn)? {
                return search_library(conn, sidecar, q, limit, SearchMode::Fts);
            }
            sync_sidecar_backend(sidecar, conn)?;
            let (vector, model) = sidecar.embed_text(q)?;
            Ok(semantic_search(conn, &vector, limit, Some(&model))?)
        }
        SearchMode::Hybrid => {
            let fts_hits = search_documents_in_conn(conn, q, limit)?;
            if !is_nlp_enabled(conn)? {
                return Ok(fts_hits
                    .into_iter()
                    .map(|mut hit| {
                        hit.match_kind = Some("fts".to_string());
                        hit
                    })
                    .collect());
            }
            sync_sidecar_backend(sidecar, conn)?;
            let semantic_hits = match sidecar.embed_text(q) {
                Ok((vector, model)) => semantic_search(conn, &vector, limit, Some(&model)).unwrap_or_default(),
                Err(_) => Vec::new(),
            };
            Ok(fuse_search_hits(&fts_hits, &semantic_hits, limit))
        }
    }
}

fn assert_db_exists(db_path: &Path) -> Result<(), String> {
    if !db_path.exists() {
        return Err(format!(
            "Scribe database not found at {}. Open Scribe once to create it, or set SCRIBE_DB_PATH.",
            db_path.display()
        ));
    }
    Ok(())
}

fn open_writable(db_path: &Path) -> Result<ScribeStore, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|e| e.to_string())?;
    migrations::run_migrations(&conn).map_err(|e| e.to_string())?;
    Ok(ScribeStore {
        db: conn,
        writable: true,
    })
}

fn open_readonly(db_path: &Path) -> Result<ScribeStore, String> {
    let conn = Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA query_only = ON;")
        .map_err(|e| e.to_string())?;
    Ok(ScribeStore {
        db: conn,
        writable: false,
    })
}

pub fn open_scribe_store(db_path: Option<PathBuf>) -> Result<OpenStoreResult, String> {
    let db_path = db_path.unwrap_or_else(default_db_path);
    assert_db_exists(&db_path)?;

    let force_readonly = std::env::var("SCRIBE_MCP_WRITE").ok().as_deref() == Some("0");

    if !force_readonly {
        match open_writable(&db_path) {
            Ok(store) => {
                return Ok(OpenStoreResult {
                    store,
                    writable: true,
                    db_path,
                });
            }
            Err(error) => {
                eprintln!(
                    "[scribe-mcp] Writable open failed (falling back to readonly): {error}"
                );
            }
        }
    }

    let store = open_readonly(&db_path)?;
    Ok(OpenStoreResult {
        store,
        writable: false,
        db_path,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::seed_document;
    use crate::nlp::NlpSidecar;
    use std::path::PathBuf;

    fn dummy_sidecar() -> NlpSidecar {
        NlpSidecar::new(PathBuf::from("/tmp/scribe-nlp-missing.py"))
    }

    fn task_doc(open: &str, done: &str) -> String {
        serde_json::json!({
            "type": "doc",
            "content": [{
                "type": "taskList",
                "content": [
                    {
                        "type": "taskItem",
                        "attrs": { "checked": false },
                        "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": open }] }]
                    },
                    {
                        "type": "taskItem",
                        "attrs": { "checked": true },
                        "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": done }] }]
                    }
                ]
            }]
        })
        .to_string()
    }

    #[test]
    fn list_open_tasks_returns_unchecked_checkboxes_only() {
        let store = ScribeStore::from_memory();
        seed_document(&store.db, "doc-1", "Alpha", &task_doc("Buy milk", "Done already"), None);
        seed_document(&store.db, "doc-2", "Beta", &task_doc("Call mom", "Paid rent"), None);

        let tasks = store
            .list_open_tasks(&dummy_sidecar(), None, 50, false)
            .unwrap();
        let texts: Vec<_> = tasks.iter().map(|task| task.text.as_str()).collect();
        assert_eq!(texts.len(), 2);
        assert!(texts.contains(&"Buy milk"));
        assert!(texts.contains(&"Call mom"));
        assert!(!texts.iter().any(|text| *text == "Done already" || *text == "Paid rent"));
        assert!(tasks.iter().all(|task| !task.checked));
    }

    #[test]
    fn list_open_tasks_can_filter_by_folder() {
        let store = ScribeStore::from_memory();
        crate::db::test_helpers::seed_folder(&store.db, "folder-a", "Work", None);
        seed_document(&store.db, "doc-1", "Work note", &task_doc("Ship it", "Old"), Some("folder-a"));
        seed_document(&store.db, "doc-2", "Home note", &task_doc("Buy eggs", "Old"), None);

        let tasks = store
            .list_open_tasks(&dummy_sidecar(), Some("folder-a"), 50, false)
            .unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].text, "Ship it");
        assert_eq!(tasks[0].document_id.as_deref(), Some("doc-1"));
    }

    #[test]
    fn get_or_create_journal_is_idempotent() {
        let store = ScribeStore::from_memory();
        let first = store
            .get_or_create_journal(JournalSlot::Day, Some("2026-09-02"))
            .unwrap();
        assert!(first.created);
        assert_eq!(first.title, "2026-09-02");
        assert_eq!(first.slot, "day");

        let second = store
            .get_or_create_journal(JournalSlot::Day, Some("2026-09-02"))
            .unwrap();
        assert!(!second.created);
        assert_eq!(second.id, first.id);
    }

    #[test]
    fn get_or_create_journal_reuses_slovak_folder_and_titles() {
        let store = ScribeStore::from_memory();
        crate::db::test_helpers::seed_folder(&store.db, "dennik", "Denník", None);

        let morning = store
            .get_or_create_journal(JournalSlot::Morning, Some("2026-09-02"))
            .unwrap();
        assert!(morning.created);
        assert_eq!(morning.title, "2026-09-02 — ráno");
        assert_eq!(morning.folder_id, "dennik");

        let evening = store
            .get_or_create_journal(JournalSlot::Evening, Some("2026-09-02"))
            .unwrap();
        assert_eq!(evening.title, "2026-09-02 — večer");
        assert_ne!(morning.id, evening.id);
    }

    #[test]
    fn restore_document_revision_reverts_content_and_keeps_previous_snapshot() {
        let store = ScribeStore::from_memory();
        let created = store.create_note("Memo", Some("original body"), None).unwrap();
        store
            .replace_document_content(&created.id, "changed body")
            .unwrap();

        let revisions = store.list_document_revisions(&created.id, 10).unwrap();
        assert_eq!(revisions.len(), 1);

        let restored = store.restore_document_revision(&revisions[0].id).unwrap();
        assert_eq!(restored.title, "Memo");

        let doc = store.get_document(&created.id, false).unwrap().unwrap();
        assert!(doc.plain_text.contains("original body"));

        let after = store.list_document_revisions(&created.id, 10).unwrap();
        assert_eq!(after.len(), 2);
    }

    #[test]
    fn journal_slot_parses_aliases() {
        assert_eq!(JournalSlot::parse(None).unwrap(), JournalSlot::Day);
        assert_eq!(JournalSlot::parse(Some("morning")).unwrap(), JournalSlot::Morning);
        assert_eq!(JournalSlot::parse(Some("ráno")).unwrap(), JournalSlot::Morning);
        assert_eq!(JournalSlot::parse(Some("večer")).unwrap(), JournalSlot::Evening);
        assert!(JournalSlot::parse(Some("noon")).is_err());
    }

    #[test]
    fn duplicate_document_copies_body_and_keeps_original() {
        let store = ScribeStore::from_memory();
        let original = store.create_note("Memo", Some("hello world"), None).unwrap();
        let copy = store.duplicate_document(&original.id, None).unwrap();
        assert_ne!(copy.id, original.id);
        assert_eq!(copy.title, "Memo (copy)");
        let copied = store.get_document(&copy.id, false).unwrap().unwrap();
        assert!(copied.plain_text.contains("hello world"));
        assert!(store.get_document(&original.id, false).unwrap().is_some());
    }

    #[test]
    fn empty_trash_purges_soft_deleted_notes() {
        let store = ScribeStore::from_memory();
        let note = store.create_note("Gone", Some("bye"), None).unwrap();
        store.trash_document(&note.id).unwrap();
        let result = store.empty_trash().unwrap();
        assert_eq!(result.purged, 1);
        assert!(store.get_document(&note.id, false).unwrap().is_none());
    }

    #[test]
    fn toggle_task_checks_matching_checkbox() {
        let store = ScribeStore::from_memory();
        seed_document(&store.db, "doc-1", "Tasks", &task_doc("Buy milk", "Done already"), None);
        let result = store.toggle_task("doc-1", "Buy milk", None).unwrap();
        assert!(result.checked);
        let tasks = store
            .list_open_tasks(&dummy_sidecar(), None, 50, false)
            .unwrap();
        assert!(tasks.iter().all(|task| task.text != "Buy milk"));
    }

    #[test]
    fn outline_lists_headings_and_export_markdown_uses_them() {
        let store = ScribeStore::from_memory();
        let json = serde_json::json!({
            "type": "doc",
            "content": [
                {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Intro"}]},
                {"type": "paragraph", "content": [{"type": "text", "text": "Body"}]}
            ]
        })
        .to_string();
        seed_document(&store.db, "doc-1", "Note", &json, None);
        let outline = store.get_document_outline("doc-1").unwrap();
        assert_eq!(outline.headings.len(), 1);
        assert_eq!(outline.headings[0].text, "Intro");
        let exported = store.export_document("doc-1", "markdown").unwrap();
        assert!(exported.content.contains("# Intro"));
    }

    #[test]
    fn unresolved_wiki_links_ignore_existing_targets() {
        let store = ScribeStore::from_memory();
        seed_document(&store.db, "target", "Target", r#"{"type":"doc","content":[]}"#, None);
        let json = serde_json::json!({
            "type": "doc",
            "content": [{
                "type": "paragraph",
                "content": [
                    {"type": "wikiLink", "attrs": {"label": "Target", "targetId": "target"}},
                    {"type": "wikiLink", "attrs": {"label": "Missing", "targetId": null}}
                ]
            }]
        })
        .to_string();
        seed_document(&store.db, "source", "Source", &json, None);
        let unresolved = store.list_unresolved_wiki_links(20).unwrap();
        assert_eq!(unresolved.len(), 1);
        assert_eq!(unresolved[0].label, "Missing");
    }

    #[test]
    fn list_nlp_artifacts_returns_saved_payload() {
        let store = ScribeStore::from_memory();
        crate::db::save_artifact(
            &store.db,
            "journal:2026-09-01:2026-09-07",
            "journal_summary",
            r#"{"summary":"week"}"#,
            1,
        )
        .unwrap();
        let artifacts = store.list_nlp_artifacts(Some("journal_summary"), 10).unwrap();
        assert_eq!(artifacts.len(), 1);
        assert_eq!(artifacts[0].payload["summary"], "week");
    }

    #[test]
    fn graph_hubs_rank_most_connected_notes() {
        let store = ScribeStore::from_memory();
        seed_document(
            &store.db,
            "hub",
            "Hub",
            r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"wikiLink","attrs":{"label":"A","targetId":"a"}}]}]}"#,
            None,
        );
        seed_document(
            &store.db,
            "a",
            "A",
            r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"wikiLink","attrs":{"label":"Hub","targetId":"hub"}}]}]}"#,
            None,
        );
        seed_document(
            &store.db,
            "b",
            "B",
            r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"wikiLink","attrs":{"label":"Hub","targetId":"hub"}}]}]}"#,
            None,
        );
        crate::db::sync_document_links(
            &store.db,
            "hub",
            r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"wikiLink","attrs":{"label":"A","targetId":"a"}}]}]}"#,
        )
        .unwrap();
        crate::db::sync_document_links(
            &store.db,
            "a",
            r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"wikiLink","attrs":{"label":"Hub","targetId":"hub"}}]}]}"#,
        )
        .unwrap();
        crate::db::sync_document_links(
            &store.db,
            "b",
            r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"wikiLink","attrs":{"label":"Hub","targetId":"hub"}}]}]}"#,
        )
        .unwrap();
        let hubs = store.list_graph_hubs(10).unwrap();
        assert_eq!(hubs[0].id, "hub");
        assert_eq!(hubs[0].backlinks, 2);
        assert_eq!(hubs[0].outgoing, 1);
    }

    #[test]
    fn folder_pin_move_and_delete_trash_documents() {
        let store = ScribeStore::from_memory();
        let parent = store.create_folder("Work", None).unwrap();
        let child = store.create_folder("Nested", Some(&parent.id)).unwrap();
        let note = store
            .create_note("Inside", Some("secret"), Some(&child.id))
            .unwrap();
        let pinned = store.set_folder_pinned(&parent.id, true).unwrap();
        assert!(pinned.is_pinned);
        let moved = store.move_folder(&child.id, None).unwrap();
        assert!(moved.parent_id.is_none());
        let deleted = store.delete_folder(&child.id).unwrap();
        assert!(deleted.trashed_document_ids.contains(&note.id));
        let trashed = store.list_trashed_documents(10).unwrap();
        assert_eq!(trashed.len(), 1);
    }

    #[test]
    fn comments_can_be_created_and_replied() {
        let store = ScribeStore::from_memory();
        let note = store.create_note("Doc", Some("quote me"), None).unwrap();
        let thread = store
            .create_comment_thread(&note.id, "quote me", "looks good", Some("peter"))
            .unwrap();
        assert_eq!(thread.comments.len(), 1);
        let reply = store
            .add_comment_reply(&thread.id, "agreed", None)
            .unwrap();
        assert_eq!(reply.author, "scribe-mcp");
        let listed = store.list_comment_threads(&note.id).unwrap();
        assert_eq!(listed[0].comments.len(), 2);
    }
}
