use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;

use crate::db::{
    count_embeddings, extract_search_text, is_nlp_enabled, save_artifact, semantic_search,
    set_nlp_enabled, upsert_embedding,
};
use crate::db::search::SearchHit;
use crate::db::DbState;
use crate::nlp::NlpSidecar;

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
    pub script_path: String,
    pub python_bin: String,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpSetEnabledInput {
    pub enabled: bool,
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
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpTagSuggestions {
    pub entities: Vec<NlpEntity>,
    pub tag_suggestions: Vec<String>,
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

fn sidecar_status(sidecar: &NlpSidecar, enabled: bool, indexed_count: i64) -> NlpStatus {
    let script_path = crate::nlp::resolve_script_path();
    let python_bin = std::env::var("SCRIBE_NLP_PYTHON").unwrap_or_else(|_| "python3".to_string());
    let sidecar_available = sidecar.script_exists();

    if !enabled {
        return NlpStatus {
            enabled,
            sidecar_available,
            sidecar_ok: false,
            version: None,
            model: None,
            indexed_count,
            script_path: script_path.to_string_lossy().to_string(),
            python_bin,
            error: None,
        };
    }

    match sidecar.health() {
        Ok(health) => NlpStatus {
            enabled,
            sidecar_available,
            sidecar_ok: health.ok,
            version: Some(health.version),
            model: Some(health.model),
            indexed_count,
            script_path: script_path.to_string_lossy().to_string(),
            python_bin,
            error: None,
        },
        Err(error) => NlpStatus {
            enabled,
            sidecar_available,
            sidecar_ok: false,
            version: None,
            model: None,
            indexed_count,
            script_path: script_path.to_string_lossy().to_string(),
            python_bin,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub fn nlp_status(state: State<'_, DbState>, sidecar: State<'_, NlpSidecar>) -> Result<NlpStatus, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let enabled = is_nlp_enabled(&conn)?;
    let indexed_count = count_embeddings(&conn)?;
    Ok(sidecar_status(&sidecar, enabled, indexed_count))
}

#[tauri::command]
pub fn nlp_set_enabled(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    input: NlpSetEnabledInput,
) -> Result<NlpStatus, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    set_nlp_enabled(&conn, input.enabled)?;
    let indexed_count = count_embeddings(&conn)?;
    Ok(sidecar_status(&sidecar, input.enabled, indexed_count))
}

#[tauri::command]
pub fn nlp_semantic_search(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<SearchHit>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    if !is_nlp_enabled(&conn)? {
        return Ok(Vec::new());
    }

    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    let (vector, _model) = sidecar.embed_text(q)?;
    semantic_search(&conn, &vector, limit.unwrap_or(12))
}

#[tauri::command]
pub fn nlp_index_document(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    document_id: String,
) -> Result<NlpIndexResult, String> {
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

    let text = format!("{title}\n{}", extract_search_text(&content_json));
    let (vector, model) = sidecar.embed_text(&text)?;
    upsert_embedding(&conn, &document_id, &vector, &model, now_ts())?;

    Ok(NlpIndexResult {
        indexed: 1,
        model,
    })
}

#[tauri::command]
pub fn nlp_index_all(state: State<'_, DbState>, sidecar: State<'_, NlpSidecar>) -> Result<NlpIndexResult, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    if !is_nlp_enabled(&conn)? {
        return Err("NLP is disabled".to_string());
    }

    let mut stmt = conn
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
        return Ok(NlpIndexResult {
            indexed: 0,
            model: "none".to_string(),
        });
    }

    let ids: Vec<String> = docs.iter().map(|(id, _)| id.clone()).collect();
    let texts: Vec<String> = docs.into_iter().map(|(_, text)| text).collect();
    let (vectors, model) = sidecar.embed_batch(&texts)?;
    let now = now_ts();
    let indexed = vectors.len() as i64;

    for (document_id, vector) in ids.into_iter().zip(vectors.into_iter()) {
        upsert_embedding(&conn, &document_id, &vector, &model, now)?;
    }

    Ok(NlpIndexResult { indexed, model })
}

#[tauri::command]
pub fn nlp_journal_summary(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    from_date: String,
    to_date: String,
) -> Result<NlpJournalSummary, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    if !is_nlp_enabled(&conn)? {
        return Err("NLP is disabled".to_string());
    }

    let mut stmt = conn
        .prepare(
            "SELECT title, content_json FROM documents
             WHERE deleted_at IS NULL AND title >= ?1 AND title <= ?2
             ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![from_date, to_date], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut combined = String::new();
    let mut count = 0i64;
    for row in rows {
        let (title, content_json) = row.map_err(|e| e.to_string())?;
        count += 1;
        combined.push_str(&title);
        combined.push_str("\n");
        combined.push_str(&extract_search_text(&content_json));
        combined.push_str("\n\n");
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

    let payload = json!({
        "fromDate": from_date,
        "toDate": to_date,
        "summary": summary,
        "bullets": bullets,
        "documentCount": count,
    });
    save_artifact(
        &conn,
        &format!("journal:{from_date}:{to_date}"),
        "journal_summary",
        &payload.to_string(),
        now_ts(),
    )?;

    Ok(NlpJournalSummary {
        summary,
        bullets,
        document_count: count,
    })
}

#[tauri::command]
pub fn nlp_suggest_tags(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    document_id: String,
) -> Result<NlpTagSuggestions, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    if !is_nlp_enabled(&conn)? {
        return Err("NLP is disabled".to_string());
    }

    let (title, content_json): (String, String) = conn
        .query_row(
            "SELECT title, content_json FROM documents WHERE id = ?1",
            params![document_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let text = format!("{title}\n{}", extract_search_text(&content_json));
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

    Ok(NlpTagSuggestions {
        entities,
        tag_suggestions,
    })
}

#[tauri::command]
pub fn nlp_library_report(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
) -> Result<NlpLibraryReport, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    if !is_nlp_enabled(&conn)? {
        return Err("NLP is disabled".to_string());
    }

    let mut stmt = conn
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
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut documents = Vec::new();
    for row in rows {
        let (id, title, content_json, tags_json, updated_at) = row.map_err(|e| e.to_string())?;
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
        documents.push(json!({
            "id": id,
            "title": title,
            "text": extract_search_text(&content_json),
            "tags": tags,
            "updatedAt": updated_at,
        }));
    }

    let result = sidecar.library_report(json!(documents))?;
    let markdown = result
        .get("markdown")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let stats = result.get("stats").cloned().unwrap_or(json!({}));

    save_artifact(
        &conn,
        &format!("library-report:{}", now_ts()),
        "library_report",
        &result.to_string(),
        now_ts(),
    )?;

    Ok(NlpLibraryReport { markdown, stats })
}
