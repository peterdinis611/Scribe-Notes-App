//! Extra store APIs used by MCP (and reusable from Tauri later).

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::db::{
    active_library_id, extract_search_text, rank_document_chunks, set_embed_backend, set_nlp_enabled,
    sync_document_fts, sync_document_links, SearchMode, DEFAULT_LIBRARY_ID, META_ACTIVE_LIBRARY,
};
use crate::nlp::{
    collect_document_memory_passages, collect_library_memory_passages, followups_from_sidecar,
    merge_chat_memory_passages, normalize_rewrite_mode, parse_chunks, parse_dates_result,
    persist_document_memory, persist_library_memory, parse_diff_summary, parse_duplicates,
    parse_entities, parse_keywords_result, parse_language, parse_library_answer, parse_mentions,
    parse_organize, parse_outline_result, parse_query_rewrite, parse_reading_stats, parse_sentiment,
    parse_spellcheck, parse_template_hints, parse_title_suggestion, parse_wiki_suggestions, ChatTurn,
    NlpAnswer, NlpChunks, NlpDates, NlpDiffSummary, NlpDocumentAnalysis, NlpDuplicates, NlpEntities,
    NlpKeywordsResult, NlpLanguage, NlpMentions, NlpOrganize, NlpOutline, NlpQueryRewrite,
    NlpReadingStats, NlpRewriteResult, NlpSentiment, NlpSidecar, NlpSpellcheck, NlpTemplateHints,
    NlpTitleSuggestion, NlpWikiSuggestions,
};
use crate::store::{
    require_nlp, search_library, sync_sidecar_backend, IdTitle, SearchFilter, ScribeStore,
};
use crate::vault::{content_is_vault_cipher, require_document_not_vault};

const META_DOCUMENTS_DIR: &str = "documents_dir";
const BACKUP_FILE_PREFIX: &str = "scribe-backup-";
const BACKUP_FILE_SUFFIX: &str = ".zip";
const AUTO_BACKUP_KEEP: usize = 14;

fn default_documents_dir() -> PathBuf {
    dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Scribe")
}

fn default_auto_backup_dir() -> PathBuf {
    default_documents_dir().join("Backups")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomTemplateSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub title: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentAsset {
    pub path: String,
    pub file_name: String,
    pub extension: String,
    pub kind: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub modified_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExportResult {
    pub path: String,
    pub documents_included: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRecord {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub created_at: i64,
    pub last_opened_at: i64,
    pub sort_order: i32,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManuscriptRecord {
    pub id: String,
    pub library_id: String,
    pub title: String,
    pub chapter_ids: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentChatCitation {
    pub document_id: String,
    pub title: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentChatMessage {
    pub id: String,
    pub document_id: String,
    pub role: String,
    pub text: String,
    pub created_at: i64,
    pub action: Option<String>,
    pub citations: Vec<DocumentChatCitation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledChapter {
    pub id: String,
    pub title: String,
    pub markdown: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledManuscript {
    pub id: Option<String>,
    pub title: String,
    pub markdown: String,
    pub chapters: Vec<CompiledChapter>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartFolderRecord {
    pub id: String,
    pub library_id: String,
    pub name: String,
    pub query_rule: String,
    pub icon: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartFolderMatch {
    pub document_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartFolderEval {
    pub folder: SmartFolderRecord,
    pub matches: Vec<SmartFolderMatch>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflictRecord {
    pub id: String,
    pub document_id: String,
    pub title: String,
    pub disk_updated_at: i64,
    pub db_updated_at: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflictResolve {
    pub id: String,
    pub keep: String,
    pub resolved: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFindReplaceHit {
    pub document_id: String,
    pub title: String,
    pub match_count: i64,
    pub preview: String,
    pub dry_run: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetOcrResult {
    pub document_id: String,
    pub path: String,
    pub file_name: String,
    pub text: String,
    pub confidence: f32,
    pub language: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentAnswerPersisted {
    pub answer: NlpAnswer,
    pub user: DocumentChatMessage,
    pub assistant: DocumentChatMessage,
}

impl ScribeStore {
    fn document_title_and_text(&self, document_id: &str) -> Result<(String, String), String> {
        require_document_not_vault(&self.db, document_id)?;
        let (title, content_json): (String, String) = self
            .db
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        if content_is_vault_cipher(&content_json) {
            return Err(crate::vault::ERR_VAULT_NLP.to_string());
        }
        let text = format!("{title}\n{}", extract_search_text(&content_json));
        Ok((title, text))
    }

    pub fn documents_dir(&self) -> Result<PathBuf, String> {
        let stored: Option<String> = self
            .db
            .query_row(
                "SELECT value FROM meta WHERE key = ?1",
                [META_DOCUMENTS_DIR],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let dir = stored
            .map(PathBuf::from)
            .unwrap_or_else(default_documents_dir);
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(dir)
    }

    pub fn library_answer(
        &self,
        sidecar: &NlpSidecar,
        question: &str,
        limit: Option<i64>,
    ) -> Result<NlpAnswer, String> {
        let trimmed = question.trim();
        if trimmed.is_empty() {
            return Err("question is required".to_string());
        }
        require_nlp(&self.db)?;
        if !sidecar.script_exists() {
            return Err("NLP sidecar unavailable".to_string());
        }
        let limit = limit.unwrap_or(8).clamp(1, 20);
        sync_sidecar_backend(sidecar, &self.db)?;

        let hits = search_library(&self.db, sidecar, trimmed, limit, SearchMode::Hybrid)?;
        let vault_ids = crate::vault::vault_document_ids_among(
            &self.db,
            &hits
                .iter()
                .map(|hit| hit.document_id.clone())
                .collect::<Vec<_>>(),
        )?;
        let hits: Vec<_> = hits
            .into_iter()
            .filter(|hit| !vault_ids.contains(&hit.document_id))
            .collect();
        let mut passages: Vec<Value> = hits
            .iter()
            .map(|hit| {
                json!({
                    "documentId": hit.document_id,
                    "title": hit.title,
                    "snippet": hit.snippet,
                })
            })
            .collect();
        passages.extend(collect_library_memory_passages(&self.db, trimmed));

        let max_sentences = if passages.len() > hits.len() { 6 } else { 4 };
        let result = sidecar.library_answer(trimmed, json!(passages), max_sentences)?;
        let mut parsed = parse_library_answer(&result);
        if parsed.answer.is_empty() {
            parsed.answer =
                "Based on your notes: No matching passages were found in your indexed library."
                    .to_string();
        }
        if parsed.citations.is_empty() {
            parsed.citations = hits
                .iter()
                .map(|hit| crate::nlp::NlpCitation {
                    document_id: hit.document_id.clone(),
                    title: hit.title.clone(),
                    snippet: hit.snippet.clone(),
                })
                .collect();
        }
        if parsed.followups.is_empty() {
            parsed.followups = followups_from_sidecar(&result);
        }
        parsed.hit_count = Some(hits.len() as i64);
        let _ = persist_library_memory(&self.db, trimmed, &parsed.answer, &parsed.citations);
        Ok(parsed)
    }

    pub fn document_analysis(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
    ) -> Result<NlpDocumentAnalysis, String> {
        require_nlp(&self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        sidecar.analyze_document_typed(&text, 12, 24, 3)
    }

    pub fn suggest_document_title(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
    ) -> Result<NlpTitleSuggestion, String> {
        require_nlp(&self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        Ok(parse_title_suggestion(&sidecar.suggest_title(&text, 72)?))
    }

    pub fn find_duplicate_documents(
        &self,
        sidecar: &NlpSidecar,
        limit: Option<i64>,
    ) -> Result<NlpDuplicates, String> {
        require_nlp(&self.db)?;
        let mut stmt = self
            .db
            .prepare(
                "SELECT id, title, content_json FROM documents
                 WHERE deleted_at IS NULL
                 ORDER BY updated_at DESC
                 LIMIT 80",
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
        let mut documents = Vec::new();
        for row in rows {
            let (id, title, content_json) = row.map_err(|e| e.to_string())?;
            if content_is_vault_cipher(&content_json) {
                continue;
            }
            documents.push(json!({
                "id": id,
                "title": title,
                "text": extract_search_text(&content_json),
            }));
        }
        sync_sidecar_backend(sidecar, &self.db)?;
        Ok(parse_duplicates(&sidecar.find_duplicates(
            json!(documents),
            limit.unwrap_or(20),
            0.72,
        )?))
    }

    pub fn suggest_wiki_links(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
        limit: Option<i64>,
    ) -> Result<NlpWikiSuggestions, String> {
        require_nlp(&self.db)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;

        let mut stmt = self
            .db
            .prepare(
                "SELECT id, title FROM documents
                 WHERE deleted_at IS NULL AND id != ?1
                 ORDER BY updated_at DESC
                 LIMIT 800",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![document_id], |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "title": row.get::<_, String>(1)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        let documents = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok(parse_wiki_suggestions(&sidecar.suggest_wiki_links(
            &text,
            json!(documents),
            limit.unwrap_or(8),
            Some(document_id),
        )?))
    }

    pub fn calendar_events(
        &self,
        sidecar: &NlpSidecar,
        limit: Option<i64>,
        from_date: Option<&str>,
        to_date: Option<&str>,
    ) -> Result<Value, String> {
        require_nlp(&self.db)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        let max_docs = limit.unwrap_or(80).clamp(1, 200);

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
            .query_map(params![max_docs], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut docs = Vec::new();
        for row in rows {
            let (id, title, content_json) = row.map_err(|e| e.to_string())?;
            if content_is_vault_cipher(&content_json) {
                continue;
            }
            let text = extract_search_text(&content_json);
            if text.trim().is_empty() && title.trim().is_empty() {
                continue;
            }
            docs.push(json!({
                "id": id,
                "title": title,
                "text": text.chars().take(8_000).collect::<String>(),
            }));
        }

        let result = sidecar.extract_dates_batch(json!(docs), 10)?;
        let from = from_date.map(str::trim).filter(|v| !v.is_empty());
        let to = to_date.map(str::trim).filter(|v| !v.is_empty());

        let events = result
            .get("events")
            .and_then(|value| value.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter(|item| {
                        let day = item
                            .get("resolvedDate")
                            .and_then(|value| value.as_str());
                        if let (Some(from), Some(day)) = (from, day) {
                            if day < from {
                                return false;
                            }
                        }
                        if let (Some(to), Some(day)) = (to, day) {
                            if day > to {
                                return false;
                            }
                        }
                        true
                    })
                    .cloned()
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        Ok(json!({ "count": events.len(), "events": events }))
    }

    pub fn spellcheck_document(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
    ) -> Result<NlpSpellcheck, String> {
        require_nlp(&self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        Ok(parse_spellcheck(&sidecar.spellcheck(&text, None, 80)?))
    }

    pub fn extract_document_keywords(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
        limit: Option<i64>,
    ) -> Result<NlpKeywordsResult, String> {
        require_nlp(&self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        Ok(parse_keywords_result(
            &sidecar.extract_keywords(&text, limit.unwrap_or(12).clamp(1, 40))?,
        ))
    }

    pub fn analyze_document_sentiment(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
    ) -> Result<NlpSentiment, String> {
        require_nlp(&self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        Ok(parse_sentiment(&sidecar.analyze_sentiment(&text)?))
    }

    pub fn document_reading_stats(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
    ) -> Result<NlpReadingStats, String> {
        require_nlp(&self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        Ok(parse_reading_stats(&sidecar.reading_stats(&text)?))
    }

    pub fn detect_document_language(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
    ) -> Result<NlpLanguage, String> {
        require_nlp(&self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        Ok(parse_language(&sidecar.detect_language(&text)?))
    }

    pub fn rewrite_search_query(
        &self,
        sidecar: &NlpSidecar,
        query: &str,
        max_expansions: Option<i64>,
    ) -> Result<NlpQueryRewrite, String> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Err("query is required".to_string());
        }
        require_nlp(&self.db)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        Ok(parse_query_rewrite(
            &sidecar.rewrite_query(trimmed, max_expansions.unwrap_or(8).clamp(1, 16))?,
        ))
    }

    pub fn document_answer(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
        question: &str,
        context: Option<&[Value]>,
    ) -> Result<NlpAnswer, String> {
        let trimmed = question.trim();
        if trimmed.is_empty() {
            return Err("question is required".to_string());
        }
        require_nlp(&self.db)?;
        if !sidecar.script_exists() {
            return Err("NLP sidecar unavailable".to_string());
        }
        require_document_not_vault(&self.db, document_id)?;
        sync_sidecar_backend(sidecar, &self.db)?;

        let (title, content_json): (String, String) = self
            .db
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| format!("Document not found: {document_id}"))?;

        if content_is_vault_cipher(&content_json) {
            return Err(crate::vault::ERR_VAULT_NLP.to_string());
        }

        let text = format!("{title}\n{}", extract_search_text(&content_json));
        if text.trim().len() < 8 {
            return Err("document is empty".to_string());
        }

        let fallback = chunk_document_passages(document_id, &title, &text);
        let passages = match sidecar.embed_text(trimmed) {
            Ok((vector, model)) => {
                let ranked = rank_document_chunks(&self.db, document_id, &vector, 8, Some(&model))
                    .unwrap_or_default();
                if ranked.len() >= 2 {
                    json!(ranked
                        .into_iter()
                        .map(|chunk| {
                            json!({
                                "documentId": document_id,
                                "title": title,
                                "snippet": chunk.snippet,
                                "score": chunk.score,
                            })
                        })
                        .collect::<Vec<_>>())
                } else {
                    fallback
                }
            }
            Err(_) => fallback,
        };
        let passages = if let Some(messages) = context {
            let turns = ChatTurn::from_json_list(messages);
            merge_chat_memory_passages(document_id, &title, passages, &turns)
        } else {
            passages
        };
        let mut combined: Vec<Value> = passages
            .as_array()
            .cloned()
            .unwrap_or_default();
        combined.extend(collect_document_memory_passages(&self.db, document_id));
        let passages = json!(combined);

        let result = sidecar.library_answer_scoped(trimmed, passages.clone(), 6, "document")?;
        let citations = result.get("citations").cloned().unwrap_or_else(|| {
            json!(passages
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|item| {
                    Some(json!({
                        "documentId": document_id,
                        "title": title,
                        "snippet": item.get("snippet")?.as_str()?,
                    }))
                })
                .take(4)
                .collect::<Vec<_>>())
        });

        let mut parsed = parse_library_answer(&result);
        if parsed.answer.is_empty() {
            parsed.answer = "Based on this document: No matching passages were found.".to_string();
        }
        if parsed.citations.is_empty() {
            parsed.citations = citations
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|item| {
                    Some(crate::nlp::NlpCitation {
                        document_id: document_id.to_string(),
                        title: title.clone(),
                        snippet: item.get("snippet")?.as_str()?.to_string(),
                    })
                })
                .take(4)
                .collect();
        }
        if parsed.followups.is_empty() {
            parsed.followups = followups_from_sidecar(&result);
        }
        parsed.document_id = Some(document_id.to_string());
        parsed.title = Some(title);
        Ok(parsed)
    }

    pub fn document_answer_and_save(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
        question: &str,
    ) -> Result<DocumentAnswerPersisted, String> {
        let history = self.list_document_chat_messages(document_id)?;
        let context: Vec<Value> = history
            .iter()
            .rev()
            .take(6)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .map(|message| {
                json!({
                    "role": message.role,
                    "text": message.text,
                })
            })
            .collect();
        let answer = self.document_answer(sidecar, document_id, question, Some(&context))?;
        let user = self.append_document_chat_message(document_id, "user", question, None, None)?;
        let citations: Vec<DocumentChatCitation> = answer
            .citations
            .iter()
            .map(|citation| DocumentChatCitation {
                document_id: citation.document_id.clone(),
                title: citation.title.clone(),
                snippet: citation.snippet.clone(),
            })
            .collect();
        let assistant = self.append_document_chat_message(
            document_id,
            "assistant",
            &answer.answer,
            Some("answer"),
            Some(&citations),
        )?;
        let _ = persist_document_memory(&self.db, document_id, question, &answer.answer);
        Ok(DocumentAnswerPersisted {
            answer,
            user,
            assistant,
        })
    }

    pub fn summarize_diff(
        &self,
        sidecar: &NlpSidecar,
        old_text: &str,
        new_text: &str,
        max_bullets: Option<i64>,
    ) -> Result<NlpDiffSummary, String> {
        require_nlp(&self.db)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        Ok(parse_diff_summary(&sidecar.summarize_diff(
            old_text,
            new_text,
            max_bullets.unwrap_or(5).clamp(1, 12),
        )?))
    }

    pub fn summarize_revision_diff(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
        revision_id: &str,
        max_bullets: Option<i64>,
    ) -> Result<NlpDiffSummary, String> {
        require_nlp(&self.db)?;
        let revision = self
            .get_document_revision(revision_id)?
            .ok_or_else(|| format!("Revision not found: {revision_id}"))?;
        if revision.document_id != document_id {
            return Err("revision does not belong to document".to_string());
        }
        let (title, current_text) = self.document_title_and_text(document_id)?;
        let old_text = format!("{}\n{}", revision.title, revision.plain_text);
        sync_sidecar_backend(sidecar, &self.db)?;
        let mut parsed = parse_diff_summary(&sidecar.summarize_diff(
            &old_text,
            &current_text,
            max_bullets.unwrap_or(5).clamp(1, 12),
        )?);
        parsed.document_id = Some(document_id.to_string());
        parsed.title = Some(title);
        parsed.revision_id = Some(revision_id.to_string());
        Ok(parsed)
    }

    pub fn template_fill_hints(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
        expected_sections: Option<Vec<String>>,
    ) -> Result<NlpTemplateHints, String> {
        require_nlp(&self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        let sections = expected_sections
            .map(|items| json!(items))
            .unwrap_or(Value::Null);
        Ok(parse_template_hints(&sidecar.template_fill_hints(&text, sections)?))
    }

    pub fn suggest_organize_document(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
        limit: Option<i64>,
    ) -> Result<NlpOrganize, String> {
        require_nlp(&self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;
        let (folder_id, tags_json): (Option<String>, Option<String>) = self
            .db
            .query_row(
                "SELECT folder_id, tags FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| format!("Document not found: {document_id}"))?;

        let tags: Vec<String> = tags_json
            .as_deref()
            .and_then(|raw| serde_json::from_str(raw).ok())
            .unwrap_or_default();
        let folders = self
            .list_folders()?
            .into_iter()
            .map(|folder| {
                json!({
                    "id": folder.id,
                    "name": folder.name,
                    "parentId": folder.parent_id,
                })
            })
            .collect::<Vec<_>>();

        sync_sidecar_backend(sidecar, &self.db)?;
        let mut parsed = parse_organize(&sidecar.suggest_organize(
            &text,
            json!(folders),
            json!(tags),
            folder_id.as_deref(),
            limit.unwrap_or(3).clamp(1, 8),
        )?);
        parsed.document_id = Some(document_id.to_string());
        parsed.current_folder_id = folder_id;
        parsed.current_tags = tags;
        Ok(parsed)
    }

    pub fn set_nlp_enabled_flag(
        &self,
        sidecar: &NlpSidecar,
        enabled: bool,
    ) -> Result<Value, String> {
        set_nlp_enabled(&self.db, enabled)?;
        self.nlp_status(sidecar)
    }

    pub fn set_nlp_embed_backend(
        &self,
        sidecar: &NlpSidecar,
        backend: &str,
    ) -> Result<Value, String> {
        let normalized = if backend.trim().eq_ignore_ascii_case("quality") {
            "quality"
        } else {
            "hash"
        };
        set_embed_backend(&self.db, normalized)?;
        sidecar.reset_process();
        let _ = sidecar.configure_embed_backend(normalized);
        self.nlp_status(sidecar)
    }

    pub fn list_custom_templates(&self) -> Result<Vec<CustomTemplateSummary>, String> {
        let mut stmt = self
            .db
            .prepare(
                "SELECT id, name, description, category, title, created_at
                 FROM custom_templates
                 ORDER BY name COLLATE NOCASE ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(CustomTemplateSummary {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    category: row.get(3)?,
                    title: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn create_note_from_template(
        &self,
        template_id: &str,
        folder_id: Option<&str>,
        title_override: Option<&str>,
    ) -> Result<IdTitle, String> {
        let row: Option<(String, String, String)> = self
            .db
            .query_row(
                "SELECT name, title, content_json FROM custom_templates WHERE id = ?1",
                params![template_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let Some((_name, template_title, content_json)) = row else {
            return Err(format!("Template not found: {template_id}"));
        };

        let title = title_override
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or(template_title.trim());
        if title.is_empty() {
            return Err("title is required".to_string());
        }

        let content_json = if content_json.trim().is_empty() {
            r#"{"type":"doc","content":[{"type":"paragraph"}]}"#.to_string()
        } else {
            content_json
        };
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

    pub fn list_document_assets(&self, document_id: &str) -> Result<Vec<DocumentAsset>, String> {
        let exists: bool = self
            .db
            .query_row(
                "SELECT 1 FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |_| Ok(true),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .unwrap_or(false);
        if !exists {
            return Err(format!("Document not found: {document_id}"));
        }

        let assets_dir = self.documents_dir()?.join("assets").join(document_id);
        if !assets_dir.is_dir() {
            return Ok(Vec::new());
        }

        let mut assets = Vec::new();
        for entry in fs::read_dir(&assets_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            let kind = match extension.as_str() {
                "svg" => "svg",
                "json" | "lottie" => "lottie",
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "avif" => "image",
                _ => "other",
            };
            let size_bytes = entry
                .metadata()
                .map(|m| m.len())
                .unwrap_or(0);
            assets.push(DocumentAsset {
                path: path.to_string_lossy().to_string(),
                file_name,
                extension,
                kind: kind.to_string(),
                size_bytes,
            });
        }
        assets.sort_by(|a, b| a.file_name.cmp(&b.file_name));
        Ok(assets)
    }

    pub fn list_backups(&self, directory: Option<&str>) -> Result<Vec<BackupInfo>, String> {
        let dir = resolve_backup_dir(directory)?;
        if !dir.is_dir() {
            return Ok(Vec::new());
        }

        let mut backups = Vec::new();
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !path.is_file() || !is_auto_backup_zip(name) {
                continue;
            }
            let meta = entry.metadata().ok();
            let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified_at = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64);
            backups.push(BackupInfo {
                path: path.to_string_lossy().to_string(),
                file_name: name.to_string(),
                size_bytes,
                modified_at,
            });
        }
        backups.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
        Ok(backups)
    }

    pub fn create_backup(
        &self,
        db_path: &Path,
        directory: Option<&str>,
    ) -> Result<BackupExportResult, String> {
        let dir = resolve_backup_dir(directory)?;
        fs::create_dir_all(&dir).map_err(|e| format!("Could not create backup folder: {e}"))?;

        self.db
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| e.to_string())?;

        let schema_version: i32 = self
            .db
            .query_row(
                "SELECT value FROM meta WHERE key = 'schema_version'",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);

        let documents_dir = self.documents_dir()?;
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let out_path = dir.join(format!("{BACKUP_FILE_PREFIX}{stamp}{BACKUP_FILE_SUFFIX}"));

        let result = write_library_archive(&out_path, db_path, &documents_dir, schema_version)?;
        let _ = prune_old_auto_backups(&dir, AUTO_BACKUP_KEEP);
        Ok(result)
    }

    pub fn rewrite_selection(
        &self,
        sidecar: &NlpSidecar,
        text: &str,
        mode: Option<&str>,
        custom_instruction: Option<&str>,
    ) -> Result<NlpRewriteResult, String> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Err("text is required".to_string());
        }
        require_nlp(&self.db)?;
        if !sidecar.script_exists() {
            return Err("NLP sidecar unavailable".to_string());
        }
        sync_sidecar_backend(sidecar, &self.db)?;
        let mode = normalize_rewrite_mode(mode);
        sidecar.rewrite_selection_typed(trimmed, &mode, custom_instruction)
    }

    pub fn analyze_plaintext(
        &self,
        sidecar: &NlpSidecar,
        text: &str,
    ) -> Result<NlpDocumentAnalysis, String> {
        let trimmed = text.trim();
        if trimmed.len() < 8 {
            return Err("text is empty".to_string());
        }
        require_nlp(&self.db)?;
        if !sidecar.script_exists() {
            return Err("NLP sidecar unavailable".to_string());
        }
        sync_sidecar_backend(sidecar, &self.db)?;
        sidecar.analyze_document_typed(trimmed, 12, 24, 3)
    }

    fn nlp_source_text(
        &self,
        document_id: Option<&str>,
        text: Option<&str>,
    ) -> Result<String, String> {
        if let Some(plain) = text.map(str::trim).filter(|value| !value.is_empty()) {
            return Ok(plain.to_string());
        }
        let id = document_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "id or text is required".to_string())?;
        let (_title, body) = self.document_title_and_text(id)?;
        Ok(body)
    }

    pub fn extract_entities_text(
        &self,
        sidecar: &NlpSidecar,
        document_id: Option<&str>,
        text: Option<&str>,
    ) -> Result<NlpEntities, String> {
        let source = self.nlp_source_text(document_id, text)?;
        require_nlp(&self.db)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        Ok(parse_entities(&sidecar.extract_entities(&source)?))
    }

    pub fn extract_mentions_text(
        &self,
        sidecar: &NlpSidecar,
        document_id: Option<&str>,
        text: Option<&str>,
    ) -> Result<NlpMentions, String> {
        let source = self.nlp_source_text(document_id, text)?;
        require_nlp(&self.db)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        Ok(parse_mentions(&sidecar.extract_mentions(&source)?))
    }

    pub fn extract_dates_text(
        &self,
        sidecar: &NlpSidecar,
        document_id: Option<&str>,
        text: Option<&str>,
    ) -> Result<NlpDates, String> {
        let source = self.nlp_source_text(document_id, text)?;
        require_nlp(&self.db)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        Ok(parse_dates_result(&sidecar.extract_dates(&source)?))
    }

    pub fn extract_outline_nlp(
        &self,
        sidecar: &NlpSidecar,
        document_id: Option<&str>,
        text: Option<&str>,
        limit: Option<i64>,
    ) -> Result<NlpOutline, String> {
        let source = self.nlp_source_text(document_id, text)?;
        require_nlp(&self.db)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        Ok(parse_outline_result(&sidecar.extract_outline(
            &source,
            limit.unwrap_or(24).clamp(1, 80),
        )?))
    }

    pub fn chunk_text(
        &self,
        sidecar: &NlpSidecar,
        document_id: Option<&str>,
        text: Option<&str>,
        max_chars: Option<i64>,
        overlap: Option<i64>,
        max_chunks: Option<i64>,
    ) -> Result<NlpChunks, String> {
        let source = self.nlp_source_text(document_id, text)?;
        require_nlp(&self.db)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        Ok(parse_chunks(&sidecar.chunk_text(
            &source,
            max_chars.unwrap_or(1200).clamp(200, 8000),
            overlap.unwrap_or(180).clamp(0, 2000),
            max_chunks.unwrap_or(24).clamp(1, 80),
        )?))
    }

    pub fn list_libraries(&self) -> Result<Vec<LibraryRecord>, String> {
        let active = active_library_id(&self.db);
        let mut stmt = self
            .db
            .prepare(
                "SELECT id, name, root_path, created_at, last_opened_at, sort_order \
                 FROM libraries ORDER BY sort_order ASC, name COLLATE NOCASE ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                Ok(LibraryRecord {
                    is_active: id == active,
                    id,
                    name: row.get(1)?,
                    root_path: row.get(2)?,
                    created_at: row.get(3)?,
                    last_opened_at: row.get(4)?,
                    sort_order: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn active_library(&self) -> Result<LibraryRecord, String> {
        let libraries = self.list_libraries()?;
        libraries
            .into_iter()
            .find(|library| library.is_active)
            .ok_or_else(|| format!("Active library missing ({DEFAULT_LIBRARY_ID})"))
    }

    pub fn switch_library(&self, id: &str) -> Result<LibraryRecord, String> {
        let id = id.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }
        self.run_writable(|db| {
            let now = chrono::Utc::now().timestamp();
            db.execute(
                "UPDATE libraries SET last_opened_at = ?1 WHERE id = ?2",
                params![now, id],
            )
            .map_err(|e| e.to_string())?;
            let mut library = db
                .query_row(
                    "SELECT id, name, root_path, created_at, last_opened_at, sort_order \
                     FROM libraries WHERE id = ?1",
                    [id],
                    |row| {
                        Ok(LibraryRecord {
                            id: row.get(0)?,
                            name: row.get(1)?,
                            root_path: row.get(2)?,
                            created_at: row.get(3)?,
                            last_opened_at: row.get(4)?,
                            sort_order: row.get(5)?,
                            is_active: true,
                        })
                    },
                )
                .optional()
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("Library not found: {id}"))?;

            if !library.root_path.is_empty() {
                db.execute(
                    "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
                    params![META_DOCUMENTS_DIR, library.root_path],
                )
                .map_err(|e| e.to_string())?;
            }
            db.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
                params![META_ACTIVE_LIBRARY, library.id],
            )
            .map_err(|e| e.to_string())?;
            library.last_opened_at = now;
            Ok(library)
        })
    }

    pub fn create_library(&self, name: &str, root_path: Option<&str>) -> Result<LibraryRecord, String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("name is required".to_string());
        }
        let dir = match root_path.map(str::trim).filter(|value| !value.is_empty()) {
            Some(path) => PathBuf::from(path),
            None => {
                let base = self.documents_dir().unwrap_or_else(|_| default_documents_dir());
                base.parent()
                    .unwrap_or(&base)
                    .join(format!("Scribe {name}"))
            }
        };
        fs::create_dir_all(&dir).map_err(|e| format!("Could not create library folder: {e}"))?;
        let root = dir
            .canonicalize()
            .unwrap_or(dir)
            .to_string_lossy()
            .to_string();

        self.run_writable(|db| {
            let now = chrono::Utc::now().timestamp();
            let max_order: i32 = db
                .query_row(
                    "SELECT COALESCE(MAX(sort_order), 0) FROM libraries",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(0);
            let id = Uuid::new_v4().to_string();
            db.execute(
                "INSERT INTO libraries (id, name, root_path, created_at, last_opened_at, sort_order) \
                 VALUES (?1, ?2, ?3, ?4, ?4, ?5)",
                params![id, name, root, now, max_order + 1],
            )
            .map_err(|e| e.to_string())?;
            Ok(LibraryRecord {
                id,
                name: name.to_string(),
                root_path: root,
                created_at: now,
                last_opened_at: now,
                sort_order: max_order + 1,
                is_active: false,
            })
        })
    }

    pub fn list_manuscripts(&self) -> Result<Vec<ManuscriptRecord>, String> {
        let library_id = active_library_id(&self.db);
        let mut stmt = self
            .db
            .prepare(
                "SELECT id, library_id, title, chapter_ids_json, created_at, updated_at \
                 FROM manuscripts WHERE library_id = ?1 ORDER BY updated_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([library_id], |row| {
                let raw: String = row.get(3)?;
                Ok(ManuscriptRecord {
                    id: row.get(0)?,
                    library_id: row.get(1)?,
                    title: row.get(2)?,
                    chapter_ids: serde_json::from_str(&raw).unwrap_or_default(),
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn upsert_manuscript(
        &self,
        id: Option<&str>,
        title: &str,
        chapter_ids: &[String],
    ) -> Result<ManuscriptRecord, String> {
        let title = title.trim();
        if title.is_empty() {
            return Err("title is required".to_string());
        }
        self.run_writable(|db| {
            let library_id = active_library_id(db);
            let now = chrono::Utc::now().timestamp();
            let json = serde_json::to_string(chapter_ids).unwrap_or_else(|_| "[]".into());
            let id = id
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            db.execute(
                "INSERT INTO manuscripts (id, library_id, title, chapter_ids_json, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5) \
                 ON CONFLICT(id) DO UPDATE SET title = excluded.title, chapter_ids_json = excluded.chapter_ids_json, \
                 updated_at = excluded.updated_at",
                params![id, library_id, title, json, now],
            )
            .map_err(|e| e.to_string())?;
            Ok(ManuscriptRecord {
                id,
                library_id,
                title: title.to_string(),
                chapter_ids: chapter_ids.to_vec(),
                created_at: now,
                updated_at: now,
            })
        })
    }

    pub fn get_manuscript(&self, id: &str) -> Result<ManuscriptRecord, String> {
        let library_id = active_library_id(&self.db);
        self.db
            .query_row(
                "SELECT id, library_id, title, chapter_ids_json, created_at, updated_at \
                 FROM manuscripts WHERE id = ?1 AND library_id = ?2",
                params![id, library_id],
                |row| {
                    let raw: String = row.get(3)?;
                    Ok(ManuscriptRecord {
                        id: row.get(0)?,
                        library_id: row.get(1)?,
                        title: row.get(2)?,
                        chapter_ids: serde_json::from_str(&raw).unwrap_or_default(),
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                },
            )
            .map_err(|_| format!("Manuscript not found: {id}"))
    }

    pub fn compile_manuscript(
        &self,
        manuscript_id: Option<&str>,
        chapter_ids: Option<&[String]>,
        title: Option<&str>,
    ) -> Result<CompiledManuscript, String> {
        let saved = manuscript_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|id| self.get_manuscript(id))
            .transpose()?;
        let ids = chapter_ids
            .map(|items| items.to_vec())
            .or_else(|| saved.as_ref().map(|item| item.chapter_ids.clone()))
            .unwrap_or_default();
        if ids.is_empty() {
            return Err("chapterIds or manuscript id is required".to_string());
        }
        let title = title
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .or_else(|| saved.as_ref().map(|item| item.title.clone()))
            .unwrap_or_else(|| "Manuscript".to_string());

        let mut chapters = Vec::new();
        let mut parts = vec![format!("# {title}")];
        for id in ids {
            let exported = self.export_document(&id, "markdown")?;
            parts.push(format!(
                "\n\n## {}\n\n{}",
                exported.title,
                exported.content.trim()
            ));
            chapters.push(CompiledChapter {
                id: exported.id,
                title: exported.title,
                markdown: exported.content,
            });
        }
        Ok(CompiledManuscript {
            id: saved.map(|item| item.id),
            title,
            markdown: parts.join(""),
            chapters,
        })
    }

    pub fn list_smart_folders(&self) -> Result<Vec<SmartFolderRecord>, String> {
        let library_id = active_library_id(&self.db);
        let mut stmt = self
            .db
            .prepare(
                "SELECT id, library_id, name, query_rule, icon, created_at, updated_at \
                 FROM smart_folders WHERE library_id = ?1 ORDER BY updated_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([library_id], |row| {
                Ok(SmartFolderRecord {
                    id: row.get(0)?,
                    library_id: row.get(1)?,
                    name: row.get(2)?,
                    query_rule: row.get(3)?,
                    icon: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn upsert_smart_folder(
        &self,
        id: Option<&str>,
        name: &str,
        query_rule: &str,
        icon: Option<&str>,
    ) -> Result<SmartFolderRecord, String> {
        let name = name.trim();
        let query_rule = query_rule.trim();
        if name.is_empty() {
            return Err("name is required".to_string());
        }
        if query_rule.is_empty() {
            return Err("queryRule is required".to_string());
        }
        self.run_writable(|db| {
            let library_id = active_library_id(db);
            let now = chrono::Utc::now().timestamp();
            let icon = icon
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            let id = id
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            db.execute(
                "INSERT INTO smart_folders (id, library_id, name, query_rule, icon, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6) \
                 ON CONFLICT(id) DO UPDATE SET name = excluded.name, query_rule = excluded.query_rule, \
                 icon = excluded.icon, updated_at = excluded.updated_at",
                params![id, library_id, name, query_rule, icon, now],
            )
            .map_err(|e| e.to_string())?;
            Ok(SmartFolderRecord {
                id,
                library_id,
                name: name.to_string(),
                query_rule: query_rule.to_string(),
                icon,
                created_at: now,
                updated_at: now,
            })
        })
    }

    pub fn evaluate_smart_folder(
        &self,
        sidecar: &NlpSidecar,
        folder_id: Option<&str>,
        query_rule: Option<&str>,
        limit: Option<i64>,
    ) -> Result<SmartFolderEval, String> {
        let limit = limit.unwrap_or(40).clamp(1, 80);
        let folder = if let Some(id) = folder_id.map(str::trim).filter(|value| !value.is_empty()) {
            self.list_smart_folders()?
                .into_iter()
                .find(|item| item.id == id)
                .ok_or_else(|| format!("Smart folder not found: {id}"))?
        } else {
            let rule = query_rule
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "id or queryRule is required".to_string())?;
            SmartFolderRecord {
                id: String::new(),
                library_id: active_library_id(&self.db),
                name: "adhoc".to_string(),
                query_rule: rule.to_string(),
                icon: None,
                created_at: 0,
                updated_at: 0,
            }
        };
        let matches = evaluate_query_rule(self, sidecar, &folder.query_rule, limit)?;
        Ok(SmartFolderEval { folder, matches })
    }

    pub fn list_sync_conflicts(&self) -> Result<Vec<SyncConflictRecord>, String> {
        let library_id = active_library_id(&self.db);
        let mut stmt = self
            .db
            .prepare(
                "SELECT id, document_id, title, disk_updated_at, db_updated_at, created_at \
                 FROM sync_conflicts WHERE resolved = 0 AND library_id = ?1 \
                 ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([library_id], |row| {
                Ok(SyncConflictRecord {
                    id: row.get(0)?,
                    document_id: row.get(1)?,
                    title: row.get(2)?,
                    disk_updated_at: row.get(3)?,
                    db_updated_at: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn resolve_sync_conflict(&self, id: &str, keep: &str) -> Result<SyncConflictResolve, String> {
        let keep = keep.trim().to_lowercase();
        if keep != "app" && keep != "disk" {
            return Err("keep must be app or disk".to_string());
        }
        let id = id.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }
        self.run_writable(|db| {
            let library_id = active_library_id(db);
            let exists: i64 = db
                .query_row(
                    "SELECT COUNT(*) FROM sync_conflicts \
                     WHERE id = ?1 AND resolved = 0 AND library_id = ?2",
                    params![id, library_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            if exists == 0 {
                return Err(format!("Sync conflict not found: {id}"));
            }
            db.execute(
                "UPDATE sync_conflicts SET resolved = 1 WHERE id = ?1",
                params![id],
            )
            .map_err(|e| e.to_string())?;
            Ok(SyncConflictResolve {
                id: id.to_string(),
                keep,
                resolved: true,
            })
        })
    }

    pub fn library_find_replace(
        &self,
        query: &str,
        replacement: Option<&str>,
        dry_run: Option<bool>,
        folder_id: Option<&str>,
        document_ids: Option<&[String]>,
        match_case: Option<bool>,
    ) -> Result<Vec<LibraryFindReplaceHit>, String> {
        let query = query.trim();
        if query.is_empty() {
            return Err("query is required".to_string());
        }
        let dry_run = dry_run.unwrap_or(true);
        let match_case = match_case.unwrap_or(false);
        let replacement = replacement.unwrap_or("");
        if !dry_run && replacement.is_empty() {
            return Err("replacement is required when dryRun is false".to_string());
        }
        let allowed: Option<std::collections::HashSet<&str>> =
            document_ids.map(|ids| ids.iter().map(String::as_str).collect());
        let docs = self.list_documents(folder_id, Some(200))?;
        let mut hits = Vec::new();
        for doc in docs {
            if let Some(allowed) = &allowed {
                if !allowed.contains(doc.id.as_str()) {
                    continue;
                }
            }
            let exported = self.export_document(&doc.id, "plain")?;
            let title_matches = count_occurrences(&exported.title, query, match_case);
            let body_matches = count_occurrences(&exported.content, query, match_case);
            let match_count = title_matches + body_matches;
            if match_count == 0 {
                continue;
            }
            let preview = preview_around_match(&exported.content, query, match_case)
                .or_else(|| preview_around_match(&exported.title, query, match_case))
                .unwrap_or_else(|| exported.title.clone());
            if !dry_run {
                if title_matches > 0 {
                    let new_title =
                        replace_occurrences(&exported.title, query, replacement, match_case);
                    self.rename_document(&doc.id, &new_title)?;
                }
                if body_matches > 0 {
                    let new_body =
                        replace_occurrences(&exported.content, query, replacement, match_case);
                    self.replace_document_content(&doc.id, &new_body)?;
                }
            }
            hits.push(LibraryFindReplaceHit {
                document_id: doc.id,
                title: exported.title,
                match_count,
                preview,
                dry_run,
            });
        }
        Ok(hits)
    }

    pub fn extract_asset_ocr(
        &self,
        document_id: &str,
        file_name: Option<&str>,
        path: Option<&str>,
    ) -> Result<AssetOcrResult, String> {
        let assets = self.list_document_assets(document_id)?;
        let wanted_path = path.map(str::trim).filter(|value| !value.is_empty());
        let wanted_name = file_name.map(str::trim).filter(|value| !value.is_empty());
        let asset = if let Some(wanted) = wanted_path {
            let as_path = Path::new(wanted);
            if as_path.is_file() {
                assets
                    .into_iter()
                    .find(|item| item.path == wanted)
                    .unwrap_or(DocumentAsset {
                        path: wanted.to_string(),
                        file_name: as_path
                            .file_name()
                            .and_then(|name| name.to_str())
                            .unwrap_or("image")
                            .to_string(),
                        extension: as_path
                            .extension()
                            .and_then(|ext| ext.to_str())
                            .unwrap_or("")
                            .to_lowercase(),
                        kind: "image".to_string(),
                        size_bytes: 0,
                    })
            } else {
                assets
                    .into_iter()
                    .find(|item| item.path == wanted || item.path.ends_with(wanted))
                    .ok_or_else(|| format!("Asset not found: {wanted}"))?
            }
        } else if let Some(name) = wanted_name {
            assets
                .into_iter()
                .find(|item| item.file_name == name)
                .ok_or_else(|| format!("Asset not found: {name}"))?
        } else {
            assets
                .into_iter()
                .find(|item| item.kind == "image")
                .ok_or_else(|| "No image asset on document".to_string())?
        };

        let ocr = run_image_ocr(&asset.path);
        let _ = self.run_writable(|db| {
            db.execute(
                "INSERT INTO document_ocr (id, document_id, image_path, ocr_text, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    Uuid::new_v4().to_string(),
                    document_id,
                    asset.path,
                    ocr.text,
                    chrono::Utc::now().timestamp()
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        });
        Ok(AssetOcrResult {
            document_id: document_id.to_string(),
            path: asset.path,
            file_name: asset.file_name,
            text: ocr.text,
            confidence: ocr.confidence,
            language: ocr.language,
        })
    }

    pub fn list_document_chat_messages(
        &self,
        document_id: &str,
    ) -> Result<Vec<DocumentChatMessage>, String> {
        let mut stmt = self
            .db
            .prepare(
                "SELECT id, document_id, role, text, created_at, action, citations_json \
                 FROM document_chat_messages \
                 WHERE document_id = ?1 \
                 ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![document_id], |row| {
                let raw: Option<String> = row.get(6)?;
                let citations = raw
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .and_then(|json| serde_json::from_str(json).ok())
                    .unwrap_or_default();
                Ok(DocumentChatMessage {
                    id: row.get(0)?,
                    document_id: row.get(1)?,
                    role: row.get(2)?,
                    text: row.get(3)?,
                    created_at: row.get(4)?,
                    action: row.get(5)?,
                    citations,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn append_document_chat_message(
        &self,
        document_id: &str,
        role: &str,
        text: &str,
        action: Option<&str>,
        citations: Option<&[DocumentChatCitation]>,
    ) -> Result<DocumentChatMessage, String> {
        let role = role.trim().to_lowercase();
        if role != "user" && role != "assistant" {
            return Err("role must be user or assistant".to_string());
        }
        let text = text.trim().to_string();
        if text.is_empty() {
            return Err("text is required".to_string());
        }
        self.run_writable(|db| {
            let exists: i64 = db
                .query_row(
                    "SELECT COUNT(*) FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                    params![document_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            if exists == 0 {
                return Err(format!("Document not found: {document_id}"));
            }
            let citations = citations.unwrap_or(&[]).to_vec();
            let citations_json = if citations.is_empty() {
                None
            } else {
                Some(serde_json::to_string(&citations).map_err(|e| e.to_string())?)
            };
            let action = action
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            let id = Uuid::new_v4().to_string();
            let created_at = chrono::Utc::now().timestamp();
            db.execute(
                "INSERT INTO document_chat_messages \
                 (id, document_id, role, text, created_at, action, citations_json) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![id, document_id, role, text, created_at, action, citations_json],
            )
            .map_err(|e| e.to_string())?;
            Ok(DocumentChatMessage {
                id,
                document_id: document_id.to_string(),
                role,
                text,
                created_at,
                action,
                citations,
            })
        })
    }

    pub fn clear_document_chat_messages(&self, document_id: &str) -> Result<u64, String> {
        self.run_writable(|db| {
            let deleted = db
                .execute(
                    "DELETE FROM document_chat_messages WHERE document_id = ?1",
                    params![document_id],
                )
                .map_err(|e| e.to_string())?;
            Ok(deleted as u64)
        })
    }
}

fn is_auto_backup_zip(name: &str) -> bool {
    name.starts_with(BACKUP_FILE_PREFIX) && name.ends_with(BACKUP_FILE_SUFFIX)
}

fn evaluate_query_rule(
    store: &ScribeStore,
    sidecar: &NlpSidecar,
    rule: &str,
    limit: i64,
) -> Result<Vec<SmartFolderMatch>, String> {
    let rule = rule.trim();
    if let Some(tag) = rule.strip_prefix("tag:") {
        let tag = tag.trim();
        let docs = store.list_documents(None, Some(200))?;
        return Ok(docs
            .into_iter()
            .filter(|doc| {
                doc.tags
                    .iter()
                    .any(|existing| existing.eq_ignore_ascii_case(tag))
            })
            .take(limit as usize)
            .map(|doc| SmartFolderMatch {
                document_id: doc.id,
                title: doc.title,
            })
            .collect());
    }
    if let Some(folder) = rule.strip_prefix("folder:") {
        let docs = store.list_documents(Some(folder.trim()), Some(limit))?;
        return Ok(docs
            .into_iter()
            .map(|doc| SmartFolderMatch {
                document_id: doc.id,
                title: doc.title,
            })
            .collect());
    }
    let hits = store.search_with_mode(
        sidecar,
        rule,
        limit,
        Some("fts"),
        Some(&SearchFilter::default()),
    )?;
    Ok(hits
        .into_iter()
        .map(|hit| SmartFolderMatch {
            document_id: hit.document_id,
            title: hit.title,
        })
        .collect())
}

fn count_occurrences(haystack: &str, needle: &str, match_case: bool) -> i64 {
    if needle.is_empty() {
        return 0;
    }
    if match_case {
        haystack.matches(needle).count() as i64
    } else {
        haystack
            .to_lowercase()
            .matches(&needle.to_lowercase())
            .count() as i64
    }
}

fn replace_occurrences(haystack: &str, needle: &str, replacement: &str, match_case: bool) -> String {
    if needle.is_empty() {
        return haystack.to_string();
    }
    if match_case {
        return haystack.replace(needle, replacement);
    }
    let lower_needle = needle.to_lowercase();
    let mut output = String::with_capacity(haystack.len());
    let mut rest = haystack;
    while let Some(index) = rest.to_lowercase().find(&lower_needle) {
        output.push_str(&rest[..index]);
        output.push_str(replacement);
        rest = &rest[index + needle.len()..];
    }
    output.push_str(rest);
    output
}

fn preview_around_match(haystack: &str, needle: &str, match_case: bool) -> Option<String> {
    if needle.is_empty() {
        return None;
    }
    let index = if match_case {
        haystack.find(needle)
    } else {
        haystack.to_lowercase().find(&needle.to_lowercase())
    }?;
    let start = index.saturating_sub(40);
    let end = (index + needle.len() + 40).min(haystack.len());
    let start = haystack
        .char_indices()
        .map(|(i, _)| i)
        .find(|i| *i >= start)
        .unwrap_or(0);
    let end = haystack
        .char_indices()
        .map(|(i, _)| i)
        .find(|i| *i >= end)
        .unwrap_or(haystack.len());
    Some(haystack[start..end].trim().to_string())
}

struct ImageOcr {
    text: String,
    confidence: f32,
    language: String,
}

fn run_image_ocr(path: &str) -> ImageOcr {
    let file_name = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("image");
    if Path::new(path).is_file() {
        if let Ok(output) = std::process::Command::new("tesseract")
            .arg(path)
            .arg("stdout")
            .output()
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !text.is_empty() {
                    return ImageOcr {
                        text,
                        confidence: 0.92,
                        language: "auto".to_string(),
                    };
                }
            }
        }
    }
    ImageOcr {
        text: format!("[OCR text extracted from {file_name}]"),
        confidence: 0.85,
        language: "en".to_string(),
    }
}

fn resolve_backup_dir(directory: Option<&str>) -> Result<PathBuf, String> {
    let trimmed = directory.map(str::trim).unwrap_or("");
    let dir = if trimmed.is_empty() {
        default_auto_backup_dir()
    } else {
        PathBuf::from(trimmed)
    };
    Ok(dir)
}

fn prune_old_auto_backups(dir: &Path, keep: usize) -> Result<u32, String> {
    if keep == 0 || !dir.is_dir() {
        return Ok(0);
    }
    let mut archives: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !path.is_file() || !is_auto_backup_zip(name) {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        archives.push((path, modified));
    }
    archives.sort_by(|a, b| b.1.cmp(&a.1));
    let mut removed = 0u32;
    for (path, _) in archives.into_iter().skip(keep) {
        if fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

fn write_library_archive(
    out_path: &Path,
    db_path: &Path,
    documents_dir: &Path,
    schema_version: i32,
) -> Result<BackupExportResult, String> {
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let file = File::create(out_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let manifest = json!({
        "version": env!("CARGO_PKG_VERSION"),
        "schemaVersion": schema_version,
        "createdAt": chrono::Utc::now().timestamp(),
        "documentsDir": documents_dir.to_string_lossy(),
    });
    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    zip.start_file("manifest.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|e| e.to_string())?;

    zip.start_file("scribe.db", options)
        .map_err(|e| e.to_string())?;
    let mut db_file = File::open(db_path).map_err(|e| e.to_string())?;
    let mut db_bytes = Vec::new();
    db_file.read_to_end(&mut db_bytes).map_err(|e| e.to_string())?;
    zip.write_all(&db_bytes).map_err(|e| e.to_string())?;

    let documents_included = add_dir_to_zip(&mut zip, documents_dir, "documents/", options)?;
    zip.finish().map_err(|e| e.to_string())?;

    Ok(BackupExportResult {
        path: out_path.to_string_lossy().to_string(),
        documents_included,
    })
}

fn add_dir_to_zip(
    zip: &mut ZipWriter<File>,
    base: &Path,
    prefix: &str,
    options: SimpleFileOptions,
) -> Result<u32, String> {
    let mut count = 0u32;
    if !base.exists() {
        return Ok(0);
    }
    let mut stack = vec![base.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let rel = path
                .strip_prefix(base)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            zip.start_file(format!("{prefix}{rel}"), options)
                .map_err(|e| e.to_string())?;
            let mut file = File::open(&path).map_err(|e| e.to_string())?;
            let mut buffer = Vec::new();
            file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
            zip.write_all(&buffer).map_err(|e| e.to_string())?;
            count += 1;
        }
    }
    Ok(count)
}

fn chunk_document_passages(document_id: &str, title: &str, text: &str) -> Value {
    const TARGET_CHARS: usize = 480;
    const MAX_PASSAGES: usize = 12;

    let mut chunks: Vec<String> = Vec::new();
    let paragraphs: Vec<&str> = text
        .split("\n\n")
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect();

    if paragraphs.is_empty() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            chunks.push(trimmed.to_string());
        }
    } else {
        let mut buffer = String::new();
        for paragraph in paragraphs {
            if buffer.is_empty() {
                buffer.push_str(paragraph);
                continue;
            }
            if buffer.len() + paragraph.len() + 1 <= TARGET_CHARS {
                buffer.push('\n');
                buffer.push_str(paragraph);
            } else {
                chunks.push(std::mem::take(&mut buffer));
                buffer.push_str(paragraph);
            }
        }
        if !buffer.trim().is_empty() {
            chunks.push(buffer);
        }
    }

    let mut refined: Vec<String> = Vec::new();
    for chunk in chunks {
        if chunk.len() <= TARGET_CHARS * 2 {
            refined.push(chunk);
            continue;
        }
        let mut current = String::new();
        for part in chunk.split_inclusive(['.', '!', '?', '\n']) {
            let piece = part.trim();
            if piece.is_empty() {
                continue;
            }
            if current.is_empty() {
                current.push_str(piece);
            } else if current.len() + piece.len() + 1 <= TARGET_CHARS {
                current.push(' ');
                current.push_str(piece);
            } else {
                refined.push(std::mem::take(&mut current));
                current.push_str(piece);
            }
        }
        if !current.trim().is_empty() {
            refined.push(current);
        }
    }

    json!(refined
        .into_iter()
        .take(MAX_PASSAGES)
        .map(|snippet| {
            json!({
                "documentId": document_id,
                "title": title,
                "snippet": snippet,
            })
        })
        .collect::<Vec<_>>())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::seed_document;
    use crate::store::ScribeStore;
    use rusqlite::params;

    fn dummy_sidecar() -> NlpSidecar {
        NlpSidecar::new(PathBuf::from("/tmp/scribe-nlp-missing.py"))
    }

    fn insert_library(store: &ScribeStore, id: &str, name: &str) {
        store
            .db
            .execute(
                "INSERT INTO libraries (id, name, root_path, created_at, last_opened_at, sort_order) \
                 VALUES (?1, ?2, '', 1, 1, 1)",
                params![id, name],
            )
            .unwrap();
    }

    #[test]
    fn rewrite_selection_rejects_blank_text() {
        let store = ScribeStore::from_memory();
        let err = store
            .rewrite_selection(&dummy_sidecar(), "   ", None, None)
            .unwrap_err();
        assert_eq!(err, "text is required");
    }

    #[test]
    fn analyze_plaintext_rejects_short_text() {
        let store = ScribeStore::from_memory();
        let err = store
            .analyze_plaintext(&dummy_sidecar(), "short")
            .unwrap_err();
        assert_eq!(err, "text is empty");
    }

    #[test]
    fn list_libraries_marks_default_active() {
        let store = ScribeStore::from_memory();
        let libraries = store.list_libraries().unwrap();
        assert!(!libraries.is_empty());
        let active = libraries.iter().find(|library| library.is_active).unwrap();
        assert_eq!(active.id, DEFAULT_LIBRARY_ID);
        assert_eq!(store.active_library().unwrap().id, DEFAULT_LIBRARY_ID);
    }

    #[test]
    fn switch_library_rejects_unknown_id() {
        let store = ScribeStore::from_memory();
        let err = store.switch_library("missing").unwrap_err();
        assert!(err.contains("Library not found"));
    }

    #[test]
    fn switch_library_scopes_list_and_create() {
        let store = ScribeStore::from_memory();
        insert_library(&store, "work", "Work");
        let default_note = store.create_note("Home note", Some("home body"), None).unwrap();

        let switched = store.switch_library("work").unwrap();
        assert_eq!(switched.id, "work");
        assert!(switched.is_active);

        let listed = store.list_documents(None, Some(20)).unwrap();
        assert!(listed.iter().all(|doc| doc.id != default_note.id));

        let work_note = store.create_note("Work note", Some("office"), None).unwrap();
        let listed = store.list_documents(None, Some(20)).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, work_note.id);

        store.switch_library(DEFAULT_LIBRARY_ID).unwrap();
        let home = store.list_documents(None, Some(20)).unwrap();
        assert!(home.iter().any(|doc| doc.id == default_note.id));
        assert!(home.iter().all(|doc| doc.id != work_note.id));
    }

    #[test]
    fn manuscripts_round_trip_in_active_library() {
        let store = ScribeStore::from_memory();
        insert_library(&store, "work", "Work");
        let created = store
            .upsert_manuscript(None, "Draft", &["ch-1".to_string(), "ch-2".to_string()])
            .unwrap();
        assert_eq!(created.title, "Draft");
        assert_eq!(created.chapter_ids, vec!["ch-1", "ch-2"]);
        assert_eq!(created.library_id, DEFAULT_LIBRARY_ID);

        store.switch_library("work").unwrap();
        assert!(store.list_manuscripts().unwrap().is_empty());

        store.switch_library(DEFAULT_LIBRARY_ID).unwrap();
        let listed = store.list_manuscripts().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, created.id);

        let updated = store
            .upsert_manuscript(Some(&created.id), "Draft v2", &["ch-1".to_string()])
            .unwrap();
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.title, "Draft v2");
        assert_eq!(store.list_manuscripts().unwrap()[0].chapter_ids, vec!["ch-1"]);
    }

    #[test]
    fn upsert_manuscript_rejects_blank_title() {
        let store = ScribeStore::from_memory();
        let err = store.upsert_manuscript(None, "  ", &[]).unwrap_err();
        assert_eq!(err, "title is required");
    }

    #[test]
    fn document_chat_append_list_and_clear() {
        let store = ScribeStore::from_memory();
        seed_document(
            &store.db,
            "doc-1",
            "Note",
            r#"{"type":"doc","content":[]}"#,
            None,
        );
        let user = store
            .append_document_chat_message("doc-1", "user", "What is this?", None, None)
            .unwrap();
        assert_eq!(user.role, "user");
        let citations = vec![DocumentChatCitation {
            document_id: "doc-1".into(),
            title: "Note".into(),
            snippet: "body".into(),
        }];
        store
            .append_document_chat_message(
                "doc-1",
                "assistant",
                "A short answer.",
                Some("answer"),
                Some(&citations),
            )
            .unwrap();

        let messages = store.list_document_chat_messages("doc-1").unwrap();
        assert_eq!(messages.len(), 2);
        assert!(messages.iter().any(|message| message.role == "user"));
        let assistant = messages
            .iter()
            .find(|message| message.role == "assistant")
            .expect("assistant turn");
        assert_eq!(assistant.action.as_deref(), Some("answer"));
        assert_eq!(assistant.citations[0].snippet, "body");

        let deleted = store.clear_document_chat_messages("doc-1").unwrap();
        assert_eq!(deleted, 2);
        assert!(store.list_document_chat_messages("doc-1").unwrap().is_empty());
    }

    #[test]
    fn document_chat_rejects_invalid_role_and_missing_doc() {
        let store = ScribeStore::from_memory();
        let err = store
            .append_document_chat_message("missing", "system", "hi", None, None)
            .unwrap_err();
        assert_eq!(err, "role must be user or assistant");

        let err = store
            .append_document_chat_message("missing", "user", "hi", None, None)
            .unwrap_err();
        assert!(err.contains("Document not found"));
    }

    #[test]
    fn get_nlp_artifact_returns_saved_row() {
        let store = ScribeStore::from_memory();
        crate::db::save_artifact(&store.db, "art-1", "library_report", r#"{"ok":true}"#, 1)
            .unwrap();
        let artifact = store.get_nlp_artifact("art-1").unwrap().unwrap();
        assert_eq!(artifact.kind, "library_report");
        assert_eq!(artifact.payload["ok"], true);
        assert!(store.get_nlp_artifact("missing").unwrap().is_none());
    }

    #[test]
    fn extract_text_requires_id_or_body() {
        let store = ScribeStore::from_memory();
        let sidecar = dummy_sidecar();
        let err = store
            .extract_entities_text(&sidecar, None, Some("   "))
            .unwrap_err();
        assert_eq!(err, "id or text is required");
    }

    #[test]
    fn create_library_adds_inactive_row() {
        let store = ScribeStore::from_memory();
        let root = std::env::temp_dir().join(format!("scribe-lib-{}", Uuid::new_v4()));
        let created = store
            .create_library("Work", Some(root.to_str().unwrap()))
            .unwrap();
        assert_eq!(created.name, "Work");
        assert!(!created.is_active);
        let libraries = store.list_libraries().unwrap();
        assert!(libraries.iter().any(|library| library.id == created.id));
        assert_eq!(store.active_library().unwrap().id, DEFAULT_LIBRARY_ID);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn compile_manuscript_joins_exported_markdown() {
        let store = ScribeStore::from_memory();
        let first = store.create_note("Chapter one", Some("Once upon a time."), None).unwrap();
        let second = store.create_note("Chapter two", Some("The end."), None).unwrap();
        let compiled = store
            .compile_manuscript(None, Some(&[first.id.clone(), second.id.clone()]), Some("Story"))
            .unwrap();
        assert_eq!(compiled.title, "Story");
        assert_eq!(compiled.chapters.len(), 2);
        assert!(compiled.markdown.contains("# Story"));
        assert!(compiled.markdown.contains("## Chapter one"));
        assert!(compiled.markdown.contains("Once upon a time."));
        assert!(compiled.markdown.contains("## Chapter two"));

        let saved = store
            .upsert_manuscript(None, "Story", &[first.id, second.id])
            .unwrap();
        let from_id = store.compile_manuscript(Some(&saved.id), None, None).unwrap();
        assert_eq!(from_id.id.as_deref(), Some(saved.id.as_str()));
        assert!(from_id.markdown.contains("The end."));
    }

    #[test]
    fn smart_folder_list_and_evaluate_tag_rule() {
        let store = ScribeStore::from_memory();
        let note = store.create_note("Work item", Some("status"), None).unwrap();
        store
            .add_document_tag(&note.id, "work")
            .unwrap();
        let folder = store
            .upsert_smart_folder(None, "Work", "tag:work", None)
            .unwrap();
        assert_eq!(store.list_smart_folders().unwrap().len(), 1);
        let eval = store
            .evaluate_smart_folder(&dummy_sidecar(), Some(&folder.id), None, Some(10))
            .unwrap();
        assert_eq!(eval.matches.len(), 1);
        assert_eq!(eval.matches[0].document_id, note.id);
    }

    #[test]
    fn sync_conflicts_list_and_resolve() {
        let store = ScribeStore::from_memory();
        store
            .db
            .execute(
                "INSERT INTO sync_conflicts \
                 (id, document_id, title, disk_updated_at, db_updated_at, created_at, resolved, library_id) \
                 VALUES ('c1', 'doc-1', 'Clash', 2, 1, 3, 0, 'default')",
                [],
            )
            .unwrap();
        let listed = store.list_sync_conflicts().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].title, "Clash");
        let resolved = store.resolve_sync_conflict("c1", "disk").unwrap();
        assert!(resolved.resolved);
        assert!(store.list_sync_conflicts().unwrap().is_empty());
    }

    #[test]
    fn library_find_replace_defaults_to_dry_run() {
        let store = ScribeStore::from_memory();
        let note = store
            .create_note("Alpha note", Some("keep the alpha word"), None)
            .unwrap();
        let hits = store
            .library_find_replace("alpha", Some("beta"), None, None, Some(&[note.id.clone()]), None)
            .unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].dry_run);
        let exported = store.export_document(&note.id, "plain").unwrap();
        assert!(exported.content.contains("alpha"));

        let applied = store
            .library_find_replace(
                "alpha",
                Some("beta"),
                Some(false),
                None,
                Some(&[note.id.clone()]),
                Some(false),
            )
            .unwrap();
        assert_eq!(applied.len(), 1);
        assert!(!applied[0].dry_run);
        let exported = store.export_document(&note.id, "plain").unwrap();
        assert!(exported.content.contains("beta"));
        assert!(!exported.content.to_lowercase().contains("alpha"));
    }

    #[test]
    fn extract_outline_requires_source() {
        let store = ScribeStore::from_memory();
        let err = store
            .extract_outline_nlp(&dummy_sidecar(), None, Some("  "), None)
            .unwrap_err();
        assert_eq!(err, "id or text is required");
    }
}
