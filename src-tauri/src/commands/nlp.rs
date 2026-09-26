use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::db::{
    count_embeddings, count_stale_embeddings, dominant_embedding_model, document_index_text,
    extract_search_text, fuse_search_hits, get_answer_backend, get_embed_backend, is_nlp_enabled,
    rank_document_chunks, rerank_search_hits, save_artifact, search_documents_for_library,
    semantic_search, semantic_search_filtered, set_answer_backend, set_embed_backend, set_nlp_enabled,
    similar_documents, upsert_embedding_with_chunks, EmbeddingChunkInput, SearchMode,
};
use scribe_core::{
    content_is_vault_cipher, date_key_bounds, extract_due_hint, require_document_not_vault,
    sync_sidecar_backend, ERR_VAULT_NLP,
};
use crate::db::SearchHit;
use crate::db::DbState;
use crate::nlp::{
    followups_from_sidecar, is_chat_memory_citation_title, merge_chat_memory_passages,
    normalize_rewrite_mode, parse_document_analysis, parse_rewrite_result, ChatTurn,
    NlpDocumentAnalysis, NlpRewriteResult, NlpSidecar,
};

fn now_ts() -> i64 {
    Utc::now().timestamp()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpStatus {
    pub enabled: bool,
    pub sidecar_available: bool,
    pub sidecar_ok: bool,
    pub version: Option<String>,
    pub model: Option<String>,
    pub indexed_count: i64,
    pub stored_model: Option<String>,
    pub index_stale: bool,
    pub stale_index_count: i64,
    pub embed_backend: String,
    pub answer_backend: String,
    pub quality_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fast_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub onnx_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub faiss_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hnsw_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bm25_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spacy_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub argos_available: Option<bool>,
    pub extras: Option<serde_json::Map<String, serde_json::Value>>,
    pub rust_extras: scribe_core::EnhanceStatus,
    pub script_path: String,
    pub python_bin: String,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpSetEnabledInput {
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpSetEmbedBackendInput {
    pub backend: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTask {
    pub text: String,
    pub checked: bool,
    pub source: String,
    pub due_hint: Option<String>,
    pub document_id: Option<String>,
    pub document_title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpJournalSummaryInput {
    pub from_date: String,
    pub to_date: String,
    pub journal_folder_id: Option<String>,
    pub document_ids: Option<Vec<String>>,
}

fn load_journal_documents(
    conn: &rusqlite::Connection,
    input: &NlpJournalSummaryInput,
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
            let library_id = crate::libraries::active_library_id(conn);
            let sql = format!(
                "SELECT title, content_json FROM documents
                 WHERE deleted_at IS NULL AND library_id = ? AND id IN ({placeholders})
                 ORDER BY updated_at DESC"
            );
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let mut values: Vec<String> = Vec::with_capacity(unique.len() + 1);
            values.push(library_id);
            values.extend(unique);
            let rows = stmt
                .query_map(rusqlite::params_from_iter(values.iter()), |row| {
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
    let library_id = crate::libraries::active_library_id(conn);
    let mut stmt = conn
        .prepare(
            "SELECT title, content_json FROM documents
             WHERE deleted_at IS NULL
               AND library_id = ?6
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
                input.to_date,
                library_id
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpIndexResult {
    pub indexed: i64,
    pub model: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpJournalSummary {
    pub summary: String,
    pub bullets: Vec<String>,
    pub document_count: i64,
    pub tone: Option<String>,
    pub tone_score: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpTagSuggestions {
    pub entities: Vec<NlpEntity>,
    pub tag_suggestions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_suggestion: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_suggestion_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpEntity {
    pub text: String,
    pub kind: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpLibraryReport {
    pub markdown: String,
    pub stats: serde_json::Value,
}

fn sidecar_status(
    sidecar: &NlpSidecar,
    enabled: bool,
    indexed_count: i64,
    stored_model: Option<String>,
    index_stale: bool,
    stale_index_count: i64,
    embed_backend: String,
    answer_backend: String,
    quality_available: bool,
    health: Option<crate::nlp::NlpHealth>,
    health_error: Option<String>,
) -> NlpStatus {
    let script_path = sidecar.script_path().to_path_buf();
    let python_bin = std::env::var("SCRIBE_NLP_PYTHON").unwrap_or_else(|_| "python3".to_string());
    let sidecar_available = sidecar.script_exists();
    let rust_extras = scribe_core::enhance_status();

    if !enabled {
        return NlpStatus {
            enabled,
            sidecar_available,
            sidecar_ok: false,
            version: None,
            model: None,
            indexed_count,
            stored_model,
            index_stale,
            stale_index_count,
            embed_backend,
            answer_backend,
            quality_available,
            fast_available: None,
            onnx_available: None,
            faiss_available: None,
            hnsw_available: None,
            bm25_available: None,
            spacy_available: None,
            argos_available: None,
            extras: None,
            rust_extras,
            script_path: crate::nlp::script_path_label(&script_path),
            python_bin,
            error: None,
        };
    }

    match health {
        Some(health) => NlpStatus {
            enabled,
            sidecar_available,
            sidecar_ok: health.ok,
            version: Some(health.version),
            model: Some(health.model),
            indexed_count,
            stored_model,
            index_stale,
            stale_index_count,
            embed_backend: health.embed_backend.unwrap_or(embed_backend),
            answer_backend,
            quality_available: health.quality_available.unwrap_or(quality_available),
            fast_available: health.fast_available,
            onnx_available: health.onnx_available,
            faiss_available: health.faiss_available,
            hnsw_available: health.hnsw_available,
            bm25_available: health.bm25_available,
            spacy_available: health.spacy_available,
            argos_available: health.argos_available,
            extras: health.extras,
            rust_extras,
            script_path: crate::nlp::script_path_label(&script_path),
            python_bin,
            error: None,
        },
        None => NlpStatus {
            enabled,
            sidecar_available,
            sidecar_ok: false,
            version: None,
            model: None,
            indexed_count,
            stored_model,
            index_stale,
            stale_index_count,
            embed_backend,
            answer_backend,
            quality_available,
            fast_available: None,
            onnx_available: None,
            faiss_available: None,
            hnsw_available: None,
            bm25_available: None,
            spacy_available: None,
            argos_available: None,
            extras: None,
            rust_extras,
            script_path: crate::nlp::script_path_label(&script_path),
            python_bin,
            error: health_error,
        },
    }
}

fn extract_checkbox_tasks(content_json: &str, apply_offline_due: bool) -> Vec<DocumentTask> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(content_json) else {
        return Vec::new();
    };
    let mut tasks = Vec::new();
    collect_checkbox_tasks(&value, &mut tasks, apply_offline_due);
    tasks
}

fn collect_checkbox_tasks(
    value: &serde_json::Value,
    tasks: &mut Vec<DocumentTask>,
    apply_offline_due: bool,
) {
    if let Some(obj) = value.as_object() {
        if obj.get("type").and_then(|item| item.as_str()) == Some("taskItem") {
            let checked = obj
                .get("attrs")
                .and_then(|attrs| attrs.get("checked"))
                .and_then(|checked| checked.as_bool())
                .unwrap_or(false);
            let text = node_plain_text(value);
            if !text.trim().is_empty() {
                let due_hint = if apply_offline_due {
                    extract_due_hint(&text)
                } else {
                    None
                };
                tasks.push(DocumentTask {
                    text,
                    checked,
                    source: "checkbox".to_string(),
                    due_hint,
                    document_id: None,
                    document_title: None,
                });
            }
        }
        if let Some(content) = obj.get("content").and_then(|item| item.as_array()) {
            for child in content {
                collect_checkbox_tasks(child, tasks, apply_offline_due);
            }
        }
    }
}

fn node_plain_text(value: &serde_json::Value) -> String {
    if let Some(text) = value.get("text").and_then(|item| item.as_str()) {
        return text.to_string();
    }
    let mut parts = Vec::new();
    if let Some(content) = value.get("content").and_then(|item| item.as_array()) {
        for child in content {
            let part = node_plain_text(child);
            if !part.is_empty() {
                parts.push(part);
            }
        }
    }
    parts.join("")
}

fn collect_document_tasks(
    sidecar: &NlpSidecar,
    conn: &rusqlite::Connection,
    document_id: &str,
    title: &str,
    content_json: &str,
    nlp_enabled: bool,
) -> Result<Vec<DocumentTask>, String> {
    let mut tasks = extract_checkbox_tasks(content_json, !nlp_enabled);
    for task in &mut tasks {
        task.document_id = Some(document_id.to_string());
        task.document_title = Some(title.to_string());
    }

    if nlp_enabled {
        sync_sidecar_backend(sidecar, conn)?;
        let text = format!("{title}\n{}", extract_search_text(content_json));
        if let Ok(result) = sidecar.extract_tasks(&text) {
            if let Some(items) = result.get("tasks").and_then(|value| value.as_array()) {
                for item in items {
                    let Some(body) = item.get("text").and_then(|value| value.as_str()) else {
                        continue;
                    };
                    let raw_source = item
                        .get("source")
                        .and_then(|value| value.as_str())
                        .unwrap_or("phrase");
                    let source = match raw_source {
                        "markdown" => "checkbox",
                        other => other,
                    };
                    let due_hint = item
                        .get("dueHint")
                        .and_then(|value| value.as_str())
                        .map(str::to_string);
                    tasks.push(DocumentTask {
                        text: body.to_string(),
                        checked: item
                            .get("checked")
                            .and_then(|value| value.as_bool())
                            .unwrap_or(false),
                        source: source.to_string(),
                        due_hint,
                        document_id: Some(document_id.to_string()),
                        document_title: Some(title.to_string()),
                    });
                }
            }
        }
        let texts: Vec<String> = tasks.iter().map(|task| task.text.clone()).collect();
        if let Ok(hints) = sidecar.resolve_due_hints(&texts) {
            for (task, hint) in tasks.iter_mut().zip(hints.into_iter()) {
                if let Some(value) = hint {
                    task.due_hint = Some(value);
                } else if task.due_hint.is_none() {
                    task.due_hint = extract_due_hint(&task.text);
                }
            }
        }
    }

    Ok(merge_document_tasks(tasks))
}

fn merge_document_tasks(mut tasks: Vec<DocumentTask>) -> Vec<DocumentTask> {
    let mut index_by_key = std::collections::HashMap::<String, usize>::new();
    let mut merged: Vec<DocumentTask> = Vec::new();
    for task in tasks.drain(..) {
        let key = task.text.to_lowercase();
        if let Some(&idx) = index_by_key.get(&key) {
            if merged[idx].due_hint.is_none() && task.due_hint.is_some() {
                merged[idx].due_hint = task.due_hint;
            }
            continue;
        }
        index_by_key.insert(key, merged.len());
        merged.push(task);
    }
    merged
}

fn build_nlp_status(
    sidecar: &NlpSidecar,
    conn: &rusqlite::Connection,
    enabled: bool,
) -> Result<NlpStatus, String> {
    let indexed_count = count_embeddings(conn)?;
    let stored_model = dominant_embedding_model(conn)?;
    let embed_backend = get_embed_backend(conn)?;
    let answer_backend = get_answer_backend(conn)?;
    let (health, health_error, quality_available, current_model) = if enabled && sidecar.script_exists() {
        let _ = sync_sidecar_backend(sidecar, conn);
        match sidecar.health() {
            Ok(health) => (
                Some(health.clone()),
                None,
                health.quality_available.unwrap_or(false),
                Some(health.model),
            ),
            Err(error) => (None, Some(error), false, None),
        }
    } else {
        (None, None, false, None)
    };
    let stale_index_count = match current_model.as_deref() {
        Some(model) if indexed_count > 0 => count_stale_embeddings(conn, model)?,
        _ => 0,
    };
    let index_stale = indexed_count > 0
        && stale_index_count > 0
        && current_model.is_some();

    Ok(sidecar_status(
        sidecar,
        enabled,
        indexed_count,
        stored_model,
        index_stale,
        stale_index_count,
        embed_backend,
        answer_backend,
        quality_available,
        health,
        health_error,
    ))
}

#[tauri::command]
pub fn nlp_status(state: State<'_, DbState>, sidecar: State<'_, NlpSidecar>) -> Result<NlpStatus, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let enabled = is_nlp_enabled(&conn)?;
    build_nlp_status(&sidecar, &conn, enabled)
}

#[tauri::command]
pub fn nlp_set_enabled(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    input: NlpSetEnabledInput,
) -> Result<NlpStatus, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    set_nlp_enabled(&conn, input.enabled)?;
    build_nlp_status(&sidecar, &conn, input.enabled)
}

#[tauri::command]
pub fn nlp_search(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    vault: State<'_, scribe_core::nlp::UnlockedVaultIndex>,
    query: String,
    limit: Option<i64>,
    mode: Option<String>,
    folder_id: Option<String>,
    tag: Option<String>,
    from_date: Option<String>,
    to_date: Option<String>,
    library_id: Option<String>,
) -> Result<Vec<SearchHit>, String> {
    let limit = limit.unwrap_or(12);
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    let (search_mode, nlp_enabled) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let enabled = is_nlp_enabled(&conn)?;
        (SearchMode::parse(mode.as_deref(), enabled), enabled)
    };

    let filter = crate::db::SearchFilter {
        folder_id,
        tag,
        from_date,
        to_date,
        library_id,
    };
    let fetch_limit = if filter.is_empty() {
        limit
    } else {
        (limit * 5).clamp(limit, 200)
    };

    let hits = match search_mode {
        SearchMode::Fts => {
            let conn = state.conn.lock().map_err(|e| e.to_string())?;
            scribe_core::search_library(&conn, &sidecar, q, fetch_limit, SearchMode::Fts)?
        }
        SearchMode::Semantic => {
            if !nlp_enabled {
                let conn = state.conn.lock().map_err(|e| e.to_string())?;
                scribe_core::search_library(&conn, &sidecar, q, fetch_limit, SearchMode::Fts)?
            } else {
                {
                    let conn = state.conn.lock().map_err(|e| e.to_string())?;
                    sync_sidecar_backend(&sidecar, &conn)?;
                }
                let embed_query = rewrite_query_for_embed(&sidecar, q);
                let (vector, model) = sidecar.embed_text(&embed_query)?;
                let conn = state.conn.lock().map_err(|e| e.to_string())?;
                semantic_search(&conn, &vector, fetch_limit, Some(&model))?
            }
        }
        SearchMode::Hybrid => {
            let fts_hits = {
                let conn = state.conn.lock().map_err(|e| e.to_string())?;
                let library_id = crate::libraries::active_library_id(&conn);
                search_documents_for_library(&conn, q, fetch_limit, &library_id)?
            };
            if !nlp_enabled {
                fts_hits
                    .into_iter()
                    .map(|mut hit| {
                        hit.match_kind = Some("fts".to_string());
                        hit
                    })
                    .collect()
            } else {
                {
                    let conn = state.conn.lock().map_err(|e| e.to_string())?;
                    sync_sidecar_backend(&sidecar, &conn)?;
                }
                let embed_query = rewrite_query_for_embed(&sidecar, q);
                let semantic_hits = match sidecar.embed_text(&embed_query) {
                    Ok((vector, model)) => {
                        let conn = state.conn.lock().map_err(|e| e.to_string())?;
                        let extra: Vec<String> =
                            fts_hits.iter().map(|hit| hit.document_id.clone()).collect();
                        semantic_search_filtered(
                            &conn,
                            &vector,
                            fetch_limit,
                            Some(&model),
                            Some(&extra),
                        )
                        .unwrap_or_default()
                    }
                    Err(_) => Vec::new(),
                };
                fuse_search_hits(&fts_hits, &semantic_hits, fetch_limit)
            }
        }
    };

    let mut hits = hits;
    for vault_hit in vault.search(q, 8, filter.folder_id.as_deref()) {
        if !hits.iter().any(|hit| hit.document_id == vault_hit.document_id) {
            hits.push(vault_hit);
        }
    }
    let hits = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        crate::db::filter_search_hits(&conn, hits, &filter, limit)
    };
    Ok(hits)
}

fn rewrite_query_for_embed(sidecar: &NlpSidecar, query: &str) -> String {
    match sidecar.rewrite_query(query, 8) {
        Ok(value) => value
            .get("rewritten")
            .and_then(|item| item.as_str())
            .filter(|item| !item.trim().is_empty())
            .unwrap_or(query)
            .to_string(),
        Err(_) => query.to_string(),
    }
}

#[tauri::command]
pub fn nlp_semantic_search(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    vault: State<'_, scribe_core::nlp::UnlockedVaultIndex>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<SearchHit>, String> {
    nlp_search(
        state,
        sidecar,
        vault,
        query,
        limit,
        Some("semantic".to_string()),
        None,
        None,
        None,
        None,
        None,
    )
}

#[tauri::command]
pub fn nlp_index_document(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    document_id: String,
) -> Result<NlpIndexResult, String> {
    let text = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        if !is_nlp_enabled(&conn)? {
            return Err("NLP is disabled".to_string());
        }
        sync_sidecar_backend(&sidecar, &conn)?;

        let (title, content_json, folder_vault): (String, String, i64) = conn
            .query_row(
                "SELECT d.title, d.content_json, COALESCE(f.is_vault, 0) \
                 FROM documents d LEFT JOIN folders f ON f.id = d.folder_id \
                 WHERE d.id = ?1 AND d.deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|e| e.to_string())?;

        if folder_vault != 0 || content_is_vault_cipher(&content_json) {
            return Err("Encrypted vault notes are not indexed".to_string());
        }

        document_index_text(&conn, &document_id, &title, &content_json)
    };

    let embedded = sidecar.embed_with_chunks(&text)?;
    let chunks: Vec<EmbeddingChunkInput> = embedded
        .chunks
        .into_iter()
        .map(|chunk| EmbeddingChunkInput {
            index: chunk.index,
            text: chunk.text,
            vector: chunk.vector,
        })
        .collect();
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        upsert_embedding_with_chunks(
            &conn,
            &document_id,
            &embedded.vector,
            &chunks,
            &embedded.model,
            now_ts(),
        )?;
    }

    Ok(NlpIndexResult {
        indexed: 1,
        model: embedded.model,
    })
}

#[tauri::command]
pub fn nlp_index_all(
    app: AppHandle,
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
) -> Result<NlpIndexResult, String> {
    let docs = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        if !is_nlp_enabled(&conn)? {
            return Err("NLP is disabled".to_string());
        }
        let _ = scribe_core::nlp::sync_embed_backend(&conn, &sidecar);
        let _ = scribe_core::nlp::prune_memory_artifacts(&conn);
        let library_id = crate::libraries::active_library_id(&conn);
        scribe_core::nlp::collect_index_documents(&conn, Some(&library_id), true)?
    };

    let result = scribe_core::nlp::index_collected_documents(
        &sidecar,
        docs,
        |ids, results, model| {
            let conn = state.conn.lock().map_err(|e| e.to_string())?;
            scribe_core::nlp::persist_embedded_batch(&conn, ids, results, model, now_ts()).map(|_| ())
        },
        |progress| {
            let _ = app.emit("nlp-index-progress", progress);
        },
    )?;

    Ok(NlpIndexResult {
        indexed: result.indexed,
        model: result.model,
    })
}

#[tauri::command]
pub fn nlp_cancel(sidecar: State<'_, NlpSidecar>) -> Result<(), String> {
    sidecar.cancel_inflight();
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpVaultIndexPutInput {
    pub document_id: String,
    pub folder_id: String,
    pub title: String,
    pub text: String,
}

#[tauri::command]
pub fn nlp_vault_index_put(
    vault: State<'_, scribe_core::nlp::UnlockedVaultIndex>,
    input: NlpVaultIndexPutInput,
) -> Result<(), String> {
    vault.upsert(scribe_core::nlp::UnlockedVaultNote {
        document_id: input.document_id,
        folder_id: input.folder_id,
        title: input.title,
        text: input.text,
    });
    Ok(())
}

#[tauri::command]
pub fn nlp_vault_index_remove(
    vault: State<'_, scribe_core::nlp::UnlockedVaultIndex>,
    document_id: String,
) -> Result<(), String> {
    vault.remove(&document_id);
    Ok(())
}

#[tauri::command]
pub fn nlp_vault_index_clear_folder(
    vault: State<'_, scribe_core::nlp::UnlockedVaultIndex>,
    folder_id: String,
) -> Result<(), String> {
    vault.clear_folder(&folder_id);
    Ok(())
}

#[tauri::command]
pub fn nlp_journal_summary(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    input: NlpJournalSummaryInput,
) -> Result<NlpJournalSummary, String> {
    let (docs, count) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        if !is_nlp_enabled(&conn)? {
            return Err("NLP is disabled".to_string());
        }

        let docs = load_journal_documents(&conn, &input)?;
        let count = docs.len() as i64;
        (docs, count)
    };

    let mut combined = String::new();
    for (title, content_json) in docs {
        combined.push_str(&title);
        combined.push_str("\n");
        combined.push_str(&extract_search_text(&content_json));
        combined.push_str("\n\n");
    }

    if combined.trim().is_empty() {
        return Ok(NlpJournalSummary {
            summary: String::new(),
            bullets: Vec::new(),
            document_count: 0,
            tone: None,
            tone_score: None,
        });
    }

    let result = sidecar.summarize(&combined, 5)?;
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

    let (tone, tone_score) = match sidecar.analyze_sentiment(&combined) {
        Ok(sentiment) => (
            sentiment
                .get("label")
                .and_then(|value| value.as_str())
                .map(str::to_string),
            sentiment.get("score").and_then(|value| value.as_f64()),
        ),
        Err(_) => (None, None),
    };

    let payload = json!({
        "fromDate": input.from_date,
        "toDate": input.to_date,
        "summary": summary,
        "bullets": bullets,
        "documentCount": count,
        "tone": tone,
        "toneScore": tone_score,
    });
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        save_artifact(
            &conn,
            &format!("journal:{}:{}", input.from_date, input.to_date),
            "journal_summary",
            &payload.to_string(),
            now_ts(),
        )?;
    }

    Ok(NlpJournalSummary {
        summary,
        bullets,
        document_count: count,
        tone,
        tone_score,
    })
}

#[tauri::command]
pub fn nlp_suggest_tags(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    document_id: String,
) -> Result<NlpTagSuggestions, String> {
    let (text, folder_id, tags_json, folders) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        if !is_nlp_enabled(&conn)? {
            return Err("NLP is disabled".to_string());
        }
        sync_sidecar_backend(&sidecar, &conn)?;

        let (title, content_json, folder_id, tags_json): (String, String, Option<String>, Option<String>) =
            conn
                .query_row(
                    "SELECT title, content_json, folder_id, tags FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                    params![document_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                )
                .map_err(|e| e.to_string())?;

        let library_id = crate::libraries::active_library_id(&conn);
        let mut folder_stmt = conn
            .prepare("SELECT id, name FROM folders WHERE library_id = ?1 ORDER BY name COLLATE NOCASE")
            .map_err(|e| e.to_string())?;
        let folder_rows = folder_stmt
            .query_map([library_id], |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "name": row.get::<_, String>(1)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        let folders = folder_rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        (
            format!("{title}\n{}", extract_search_text(&content_json)),
            folder_id,
            tags_json,
            folders,
        )
    };

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

    let existing_tags: Vec<String> = tags_json
        .as_deref()
        .and_then(|raw| serde_json::from_str::<Vec<String>>(raw).ok())
        .unwrap_or_default();
    let mut organize_tags = existing_tags;
    organize_tags.extend(tag_suggestions.iter().cloned());

    let (folder_suggestion, folder_suggestion_id) =
        match sidecar.suggest_organize(
            &text,
            json!(folders),
            json!(organize_tags),
            folder_id.as_deref(),
            3,
        ) {
            Ok(value) => (
                value
                    .get("bestFolderName")
                    .and_then(|item| item.as_str())
                    .map(str::to_string),
                value
                    .get("bestFolderId")
                    .and_then(|item| item.as_str())
                    .map(str::to_string),
            ),
            Err(_) => (None, None),
        };

    Ok(NlpTagSuggestions {
        entities,
        tag_suggestions,
        folder_suggestion,
        folder_suggestion_id,
    })
}

#[tauri::command]
pub fn nlp_library_report(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
) -> Result<NlpLibraryReport, String> {
    let (documents, folders) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        if !is_nlp_enabled(&conn)? {
            return Err("NLP is disabled".to_string());
        }

        let library_id = crate::libraries::active_library_id(&conn);
        let mut stmt = conn
            .prepare(
                "SELECT id, title, content_json, tags, updated_at, folder_id
                 FROM documents WHERE deleted_at IS NULL AND library_id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([library_id.clone()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut documents = Vec::new();
        for row in rows {
            let (id, title, content_json, tags_json, updated_at, folder_id) =
                row.map_err(|e| e.to_string())?;
            let tags: Vec<String> = tags_json
                .as_deref()
                .and_then(|value| serde_json::from_str(value).ok())
                .unwrap_or_default();
            documents.push(json!({
                "id": id,
                "title": title,
                "text": extract_search_text(&content_json),
                "tags": tags,
                "updatedAt": updated_at,
                "folderId": folder_id,
            }));
        }

        let mut folder_stmt = conn
            .prepare(
                "SELECT id, name, parent_id, COALESCE(is_vault, 0)
                 FROM folders WHERE library_id = ?1 ORDER BY name COLLATE NOCASE ASC",
            )
            .map_err(|e| e.to_string())?;
        let folder_rows = folder_stmt
            .query_map([library_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut folders = Vec::new();
        for row in folder_rows {
            let (id, name, parent_id, is_vault) = row.map_err(|e| e.to_string())?;
            folders.push(json!({
                "id": id,
                "name": name,
                "parentId": parent_id,
                "isVault": is_vault != 0,
            }));
        }

        (documents, folders)
    };

    let result = sidecar.library_report(json!(documents), json!(folders))?;
    let markdown = result
        .get("markdown")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let stats = result.get("stats").cloned().unwrap_or(json!({}));

    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        save_artifact(
            &conn,
            &format!("library-report:{}", now_ts()),
            "library_report",
            &result.to_string(),
            now_ts(),
        )?;
    }

    Ok(NlpLibraryReport { markdown, stats })
}

#[tauri::command]
pub fn nlp_similar_documents(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    document_id: String,
    limit: Option<i64>,
) -> Result<Vec<SearchHit>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    if !is_nlp_enabled(&conn)? {
        return Ok(Vec::new());
    }
    sync_sidecar_backend(&sidecar, &conn)?;
    drop(conn);

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let model = crate::db::get_document_embedding(&conn, &document_id)?
        .map(|item| item.model);
    similar_documents(&conn, &document_id, limit.unwrap_or(8), model.as_deref())
}

#[tauri::command]
pub fn nlp_document_tasks(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    document_id: String,
) -> Result<Vec<DocumentTask>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let nlp_enabled = is_nlp_enabled(&conn)?;
    let (title, content_json): (String, String) = conn
        .query_row(
            "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
            params![document_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    collect_document_tasks(
        &sidecar,
        &conn,
        &document_id,
        &title,
        &content_json,
        nlp_enabled,
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpJournalTasksInput {
    pub document_ids: Vec<String>,
}

#[tauri::command]
pub fn nlp_journal_tasks(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    input: NlpJournalTasksInput,
) -> Result<Vec<DocumentTask>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let nlp_enabled = is_nlp_enabled(&conn)?;
    let mut combined = Vec::new();

    for document_id in input.document_ids {
        let (title, content_json): (String, String) = match conn.query_row(
            "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
            params![document_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ) {
            Ok(row) => row,
            Err(_) => continue,
        };
        combined.extend(collect_document_tasks(
            &sidecar,
            &conn,
            &document_id,
            &title,
            &content_json,
            nlp_enabled,
        )?);
    }

    Ok(merge_document_tasks(combined))
}

#[tauri::command]
pub fn nlp_list_open_tasks(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    limit: Option<i64>,
    folder_id: Option<String>,
) -> Result<Vec<DocumentTask>, String> {
    let max_docs = limit.unwrap_or(200).clamp(1, 500);
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let library_id = crate::libraries::active_library_id(&conn);
    let folder = folder_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let rows: Vec<(String, String, String)> = if let Some(folder_id) = folder {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, content_json FROM documents
                 WHERE deleted_at IS NULL AND library_id = ?1 AND folder_id = ?2
                 ORDER BY updated_at DESC
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(params![library_id, folder_id, max_docs], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        mapped
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, content_json FROM documents
                 WHERE deleted_at IS NULL AND library_id = ?1
                 ORDER BY updated_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(params![library_id, max_docs], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        mapped
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    // Checkbox-only for speed; phrase extraction is available per-document in Insights.
    let mut open = Vec::new();
    for (document_id, title, content_json) in rows {
        if content_is_vault_cipher(&content_json) {
            continue;
        }
        let mut tasks = extract_checkbox_tasks(&content_json, true);
        for task in &mut tasks {
            task.document_id = Some(document_id.clone());
            task.document_title = Some(title.clone());
        }
        open.extend(tasks.into_iter().filter(|task| !task.checked));
    }

    let _ = sidecar;
    Ok(merge_document_tasks(open))
}

#[tauri::command]
pub fn nlp_set_embed_backend(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    input: NlpSetEmbedBackendInput,
) -> Result<NlpStatus, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let backend = match input.backend.trim().to_ascii_lowercase().as_str() {
        "quality" => "quality",
        "fast" => "fast",
        _ => "hash",
    };
    set_embed_backend(&conn, backend)?;
    sidecar.reset_process();
    let _ = sidecar.configure_embed_backend(backend);
    build_nlp_status(&sidecar, &conn, is_nlp_enabled(&conn)?)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpSetAnswerBackendInput {
    pub backend: String,
}

#[tauri::command]
pub fn nlp_set_answer_backend(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    input: NlpSetAnswerBackendInput,
) -> Result<NlpStatus, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    set_answer_backend(&conn, &input.backend)?;
    build_nlp_status(&sidecar, &conn, is_nlp_enabled(&conn)?)
}

#[tauri::command]
pub fn nlp_document_analysis(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    document_id: String,
) -> Result<NlpDocumentAnalysis, String> {
    let text = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        if !is_nlp_enabled(&conn)? {
            return Err("NLP is disabled".to_string());
        }
        require_document_not_vault(&conn, &document_id)?;

        let (title, content_json): (String, String) = conn
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        if content_is_vault_cipher(&content_json) {
            return Err(ERR_VAULT_NLP.to_string());
        }

        format!("{title}\n{}", extract_search_text(&content_json))
    };

    run_document_analysis(&sidecar, &text)
}

/// Ephemeral Local AI analysis of plaintext (unlocked vault note in the UI).
/// Text is never written to SQLite / FTS / embeddings.
#[tauri::command]
pub fn nlp_analyze_plaintext(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    text: String,
) -> Result<NlpDocumentAnalysis, String> {
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        if !is_nlp_enabled(&conn)? {
            return Err("NLP is disabled".to_string());
        }
        sync_sidecar_backend(&sidecar, &conn)?;
    }
    let trimmed = text.trim();
    if trimmed.len() < 8 {
        return Err("text is empty".to_string());
    }
    run_document_analysis(&sidecar, trimmed)
}

fn run_document_analysis(
    sidecar: &NlpSidecar,
    text: &str,
) -> Result<NlpDocumentAnalysis, String> {
    let result = sidecar.analyze_document(text, 12, 24, 3)?;
    Ok(parse_document_analysis(&result))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpSummarizeDiffInput {
    pub old_text: String,
    pub new_text: String,
    pub max_bullets: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpTemplateHintsInput {
    pub document_id: String,
    pub expected_sections: Option<Vec<String>>,
}

#[tauri::command]
pub fn nlp_find_duplicates(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    limit: Option<i64>,
) -> Result<serde_json::Value, String> {
    let limit = limit.unwrap_or(20);
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        if !is_nlp_enabled(&conn)? {
            return Err("NLP is disabled".to_string());
        }
        let stored = scribe_core::nlp::find_duplicates_from_embeddings(&conn, limit, 0.86)?;
        if stored.compared >= 2 {
            return serde_json::to_value(stored).map_err(|e| e.to_string());
        }
    }

    let documents = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
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
        let mut pending: Vec<(String, String, String)> = Vec::new();
        for row in rows {
            pending.push(row.map_err(|e| e.to_string())?);
        }
        drop(stmt);
        let mut documents = Vec::new();
        for (id, title, content_json) in pending {
            documents.push(json!({
                "id": id,
                "title": title,
                "text": document_index_text(&conn, &id, &title, &content_json),
            }));
        }
        documents
    };

    sidecar.find_duplicates(json!(documents), limit, 0.72)
}

#[tauri::command]
pub fn nlp_suggest_title(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    document_id: String,
) -> Result<serde_json::Value, String> {
    let text = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        if !is_nlp_enabled(&conn)? {
            return Err("NLP is disabled".to_string());
        }
        let (title, content_json): (String, String) = conn
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        format!("{title}\n{}", extract_search_text(&content_json))
    };
    sidecar.suggest_title(&text, 72)
}

#[tauri::command]
pub fn nlp_summarize_diff(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    input: NlpSummarizeDiffInput,
) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    if !is_nlp_enabled(&conn)? {
        return Err("NLP is disabled".to_string());
    }
    drop(conn);
    sidecar.summarize_diff(
        &input.old_text,
        &input.new_text,
        input.max_bullets.unwrap_or(5),
    )
}

#[tauri::command]
pub fn nlp_template_fill_hints(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    input: NlpTemplateHintsInput,
) -> Result<serde_json::Value, String> {
    let text = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        if !is_nlp_enabled(&conn)? {
            return Err("NLP is disabled".to_string());
        }
        let (title, content_json): (String, String) = conn
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![input.document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        format!("{title}\n{}", extract_search_text(&content_json))
    };
    let sections = input
        .expected_sections
        .map(|items| json!(items))
        .unwrap_or(json!(null));
    sidecar.template_fill_hints(&text, sections)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellIssue {
    pub word: String,
    pub offset: i64,
    pub length: i64,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellcheckResult {
    pub language: String,
    pub checked_language: String,
    pub issue_count: i64,
    pub issues: Vec<SpellIssue>,
    pub dictionary_size: i64,
}

#[tauri::command]
pub fn nlp_spellcheck(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    document_id: String,
) -> Result<SpellcheckResult, String> {
    let text = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        if !is_nlp_enabled(&conn)? {
            return Err("NLP is disabled".to_string());
        }
        let (title, content_json): (String, String) = conn
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        format!("{title}\n{}", extract_search_text(&content_json))
    };

    let result = sidecar.spellcheck(&text, None, 80)?;

    let issues = result
        .get("issues")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(SpellIssue {
                        word: item.get("word")?.as_str()?.to_string(),
                        offset: item.get("offset")?.as_i64().unwrap_or(0),
                        length: item.get("length")?.as_i64().unwrap_or(0),
                        suggestions: item
                            .get("suggestions")
                            .and_then(|value| value.as_array())
                            .map(|suggestions| {
                                suggestions
                                    .iter()
                                    .filter_map(|suggestion| suggestion.as_str().map(str::to_string))
                                    .collect::<Vec<_>>()
                            })
                            .unwrap_or_default(),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(SpellcheckResult {
        language: result
            .get("language")
            .and_then(|value| value.as_str())
            .unwrap_or("unknown")
            .to_string(),
        checked_language: result
            .get("checkedLanguage")
            .and_then(|value| value.as_str())
            .unwrap_or("both")
            .to_string(),
        issue_count: result
            .get("issueCount")
            .and_then(|value| value.as_i64())
            .unwrap_or(issues.len() as i64),
        issues,
        dictionary_size: result
            .get("dictionarySize")
            .and_then(|value| value.as_i64())
            .unwrap_or(0),
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryChatCitation {
    pub document_id: String,
    pub title: String,
    pub snippet: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chunk_index: Option<i32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryChatResult {
    pub answer: String,
    pub citations: Vec<LibraryChatCitation>,
    pub followups: Vec<String>,
}

#[tauri::command]
pub fn nlp_library_answer(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    question: String,
    limit: Option<i64>,
) -> Result<LibraryChatResult, String> {
    let trimmed = question.trim().to_string();
    if trimmed.is_empty() {
        return Err("libraryChat.emptyQuestion".to_string());
    }

    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        if !is_nlp_enabled(&conn)? {
            return Err("libraryChat.nlpDisabled".to_string());
        }
        if !sidecar.script_exists() {
            return Err("libraryChat.sidecarUnavailable".to_string());
        }
        sync_sidecar_backend(&sidecar, &conn)?;
    }

    let hits = {
        let limit = limit.unwrap_or(8).clamp(1, 20);
        let fetch = (limit * 2).clamp(limit, 40);
        let q = trimmed.as_str();
        let fts_hits = {
            let conn = state.conn.lock().map_err(|e| e.to_string())?;
            let library_id = crate::libraries::active_library_id(&conn);
            search_documents_for_library(&conn, q, fetch, &library_id)?
        };
        let embed_query = rewrite_query_for_embed(&sidecar, q);
        match sidecar.embed_text(&embed_query) {
            Ok((vector, model)) => {
                let conn = state.conn.lock().map_err(|e| e.to_string())?;
                let extra: Vec<String> =
                    fts_hits.iter().map(|hit| hit.document_id.clone()).collect();
                let semantic_hits = semantic_search_filtered(
                    &conn,
                    &vector,
                    fetch,
                    Some(&model),
                    Some(&extra),
                )
                .unwrap_or_default();
                let fused = fuse_search_hits(&fts_hits, &semantic_hits, fetch);
                rerank_search_hits(&conn, &vector, fused, Some(&model), limit)
            }
            Err(_) => fuse_search_hits(&fts_hits, &[], limit),
        }
    };

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
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        passages.extend(scribe_core::nlp::collect_library_memory_passages(
            &conn, &trimmed,
        ));
    }
    let max_sentences = if passages.len() > hits.len() { 6 } else { 4 };
    let result = sidecar.library_answer(&trimmed, json!(passages), max_sentences)?;
    let citations = result
        .get("citations")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(LibraryChatCitation {
                        document_id: item.get("documentId")?.as_str()?.to_string(),
                        title: item
                            .get("title")
                            .and_then(|value| value.as_str())
                            .unwrap_or("Untitled")
                            .to_string(),
                        snippet: item
                            .get("snippet")
                            .and_then(|value| value.as_str())
                            .unwrap_or("")
                            .to_string(),
                        chunk_index: item
                            .get("chunkIndex")
                            .and_then(|value| value.as_i64())
                            .map(|value| value as i32),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| {
            hits.iter()
                .map(|hit| LibraryChatCitation {
                    document_id: hit.document_id.clone(),
                    title: hit.title.clone(),
                    snippet: hit.snippet.clone(),
                    chunk_index: hit.chunk_index,
                })
                .collect()
        });

    let answer = result
        .get("answer")
        .and_then(|value| value.as_str())
        .unwrap_or("Based on your notes: No matching passages were found in your indexed library.")
        .to_string();
    {
        let mapped: Vec<scribe_core::nlp::NlpCitation> = citations
            .iter()
            .map(|item| scribe_core::nlp::NlpCitation {
                document_id: item.document_id.clone(),
                title: item.title.clone(),
                snippet: item.snippet.clone(),
                chunk_index: item.chunk_index,
            })
            .collect();
        if let Ok(conn) = state.conn.lock() {
            let _ = scribe_core::nlp::persist_library_memory(&conn, &trimmed, &answer, &mapped);
        }
    }

    Ok(LibraryChatResult {
        answer,
        citations,
        followups: followups_from_sidecar(&result),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentAnswerContextMessage {
    pub role: String,
    pub text: String,
}

#[tauri::command]
pub fn nlp_document_answer(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    document_id: String,
    question: String,
    context: Option<Vec<DocumentAnswerContextMessage>>,
) -> Result<LibraryChatResult, String> {
    let trimmed = question.trim().to_string();
    if trimmed.is_empty() {
        return Err("libraryChat.emptyQuestion".to_string());
    }

    let (title, text, needs_index, answer_backend) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        if !is_nlp_enabled(&conn)? {
            return Err("libraryChat.nlpDisabled".to_string());
        }
        if !sidecar.script_exists() {
            return Err("libraryChat.sidecarUnavailable".to_string());
        }
        sync_sidecar_backend(&sidecar, &conn)?;

        let (title, content_json): (String, String) = conn
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| "libraryChat.documentMissing".to_string())?;

        if content_is_vault_cipher(&content_json) {
            return Err(ERR_VAULT_NLP.to_string());
        }

        let text = document_index_text(&conn, &document_id, &title, &content_json);
        if text.trim().len() < 8 {
            return Err("libraryChat.documentEmpty".to_string());
        }
        let needs_index =
            scribe_core::nlp::document_needs_reindex(&conn, &sidecar, &document_id).unwrap_or(true);
        let answer_backend =
            scribe_core::nlp::resolve_answer_embed_backend(&conn, &sidecar).unwrap_or(None);
        (title, text, needs_index, answer_backend)
    };

    if needs_index {
        let embedded = sidecar.embed_with_chunks(&text)?;
        let chunks: Vec<EmbeddingChunkInput> = embedded
            .chunks
            .into_iter()
            .map(|chunk| EmbeddingChunkInput {
                index: chunk.index,
                text: chunk.text,
                vector: chunk.vector,
            })
            .collect();
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        upsert_embedding_with_chunks(
            &conn,
            &document_id,
            &embedded.vector,
            &chunks,
            &embedded.model,
            now_ts(),
        )?;
    }

    let ranked = match sidecar.embed_text(&trimmed) {
        Ok((vector, model)) => {
            let conn = state.conn.lock().map_err(|e| e.to_string())?;
            rank_document_chunks(
                &conn,
                &document_id,
                &vector,
                scribe_core::nlp::DOCUMENT_EMBED_RANK_LIMIT,
                Some(&model),
            )
            .unwrap_or_default()
        }
        Err(_) => Vec::new(),
    };
    let passages = scribe_core::nlp::build_document_answer_passages(
        &document_id,
        &title,
        &text,
        &trimmed,
        &ranked,
    );

    let passages = if let Some(messages) = context {
        let turns: Vec<ChatTurn> = messages
            .into_iter()
            .map(|message| ChatTurn {
                role: message.role,
                text: message.text,
            })
            .collect();
        merge_chat_memory_passages(&document_id, &title, passages, &turns)
    } else {
        passages
    };
    let mut combined: Vec<Value> = passages.as_array().cloned().unwrap_or_default();
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        combined.extend(scribe_core::nlp::collect_document_memory_passages(
            &conn,
            &document_id,
        ));
    }
    let passages = json!(combined);

    let result = sidecar.library_answer_scoped_with_backend(
        &trimmed,
        passages.clone(),
        8,
        "document",
        answer_backend.as_deref(),
    )?;
    let fallback_title = title.clone();
    let citations = result
        .get("citations")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let title = item
                        .get("title")
                        .and_then(|value| value.as_str())
                        .unwrap_or(fallback_title.as_str())
                        .to_string();
                    if is_chat_memory_citation_title(&title) {
                        return None;
                    }
                    Some(LibraryChatCitation {
                        document_id: item.get("documentId")?.as_str()?.to_string(),
                        title,
                        snippet: item
                            .get("snippet")
                            .and_then(|value| value.as_str())
                            .unwrap_or("")
                            .to_string(),
                        chunk_index: item
                            .get("chunkIndex")
                            .and_then(|value| value.as_i64())
                            .map(|value| value as i32),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| {
            passages
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|item| {
                    let title = item
                        .get("title")
                        .and_then(|value| value.as_str())
                        .unwrap_or(title.as_str())
                        .to_string();
                    if is_chat_memory_citation_title(&title) {
                        return None;
                    }
                    Some(LibraryChatCitation {
                        document_id: document_id.clone(),
                        title,
                        snippet: item.get("snippet")?.as_str()?.to_string(),
                        chunk_index: item
                            .get("chunkIndex")
                            .and_then(|value| value.as_i64())
                            .map(|value| value as i32),
                    })
                })
                .take(4)
                .collect()
        });

    let answer = result
        .get("answer")
        .and_then(|value| value.as_str())
        .unwrap_or("Based on this document: No matching passages were found.")
        .to_string();
    if let Ok(conn) = state.conn.lock() {
        let _ = scribe_core::nlp::persist_document_memory(&conn, &document_id, &trimmed, &answer);
    }

    Ok(LibraryChatResult {
        answer,
        citations,
        followups: followups_from_sidecar(&result),
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiLinkSuggestion {
    pub phrase: String,
    pub document_id: String,
    pub title: String,
    pub score: f64,
    pub reason: String,
}

#[tauri::command]
pub fn nlp_suggest_wiki_links(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    document_id: String,
    limit: Option<i64>,
) -> Result<Vec<WikiLinkSuggestion>, String> {
    let (text, documents) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        if !is_nlp_enabled(&conn)? {
            return Err("NLP is disabled".to_string());
        }
        sync_sidecar_backend(&sidecar, &conn)?;

        let (title, content_json): (String, String) = conn
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;

        let mut stmt = conn
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

        (
            format!("{title}\n{}", extract_search_text(&content_json)),
            documents,
        )
    };

    let result = sidecar.suggest_wiki_links(
        &text,
        json!(documents),
        limit.unwrap_or(8),
        Some(&document_id),
    )?;

    Ok(result
        .get("suggestions")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(WikiLinkSuggestion {
                        phrase: item.get("phrase")?.as_str()?.to_string(),
                        document_id: item.get("documentId")?.as_str()?.to_string(),
                        title: item.get("title")?.as_str()?.to_string(),
                        score: item.get("score")?.as_f64().unwrap_or(0.0),
                        reason: item
                            .get("reason")
                            .and_then(|value| value.as_str())
                            .unwrap_or("title_match")
                            .to_string(),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub document_id: Option<String>,
    pub document_title: Option<String>,
    pub text: String,
    pub kind: String,
    pub resolved_date: Option<String>,
}

#[tauri::command]
pub fn nlp_calendar_events(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    limit: Option<i64>,
    from_date: Option<String>,
    to_date: Option<String>,
) -> Result<Vec<CalendarEvent>, String> {
    let max_docs = limit.unwrap_or(80).clamp(1, 200);
    let documents = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        if !is_nlp_enabled(&conn)? {
            return Err("NLP is disabled".to_string());
        }
        sync_sidecar_backend(&sidecar, &conn)?;

        let mut stmt = conn
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
        docs
    };

    let result = sidecar.extract_dates_batch(json!(documents), 10)?;
    let from = from_date.as_deref().filter(|value| !value.is_empty());
    let to = to_date.as_deref().filter(|value| !value.is_empty());

    Ok(result
        .get("events")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let resolved = item
                        .get("resolvedDate")
                        .and_then(|value| value.as_str())
                        .map(str::to_string);
                    if let (Some(from), Some(day)) = (from, resolved.as_deref()) {
                        if day < from {
                            return None;
                        }
                    }
                    if let (Some(to), Some(day)) = (to, resolved.as_deref()) {
                        if day > to {
                            return None;
                        }
                    }
                    Some(CalendarEvent {
                        document_id: item
                            .get("documentId")
                            .and_then(|value| value.as_str())
                            .map(str::to_string),
                        document_title: item
                            .get("documentTitle")
                            .and_then(|value| value.as_str())
                            .map(str::to_string),
                        text: item.get("text")?.as_str()?.to_string(),
                        kind: item
                            .get("kind")
                            .and_then(|value| value.as_str())
                            .unwrap_or("absolute")
                            .to_string(),
                        resolved_date: resolved,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default())
}

#[tauri::command]
pub fn nlp_rewrite_selection(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    text: String,
    mode: Option<String>,
    custom_instruction: Option<String>,
) -> Result<NlpRewriteResult, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    if !is_nlp_enabled(&conn)? {
        return Err("NLP is disabled".to_string());
    }
    let mode = normalize_rewrite_mode(mode.as_deref());
    let res = sidecar.rewrite_selection(&text, &mode, custom_instruction.as_deref())?;
    Ok(parse_rewrite_result(&res, &mode, &text))
}

