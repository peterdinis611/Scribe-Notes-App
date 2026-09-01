use chrono::Utc;
use rusqlite::params;
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpJournalSummaryInput {
    pub from_date: String,
    pub to_date: String,
    pub journal_folder_id: Option<String>,
    pub document_ids: Option<Vec<String>>,
}

fn parse_date_key(value: &str) -> Result<chrono::NaiveDate, String> {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|error| format!("Neplatný dátum: {error}"))
}

fn date_key_bounds(from_date: &str, to_date: &str) -> Result<(i64, i64), String> {
    use chrono::TimeZone;

    let from = parse_date_key(from_date)?;
    let to = parse_date_key(to_date)?;
    let start = from
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| "Neplatný začiatok rozsahu".to_string())?
        .and_utc()
        .timestamp();
    let end = to
        .and_hms_opt(23, 59, 59)
        .ok_or_else(|| "Neplatný koniec rozsahu".to_string())?
        .and_utc()
        .timestamp();
    Ok((start, end))
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
    let script_path = sidecar.script_path().to_path_buf();
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
            script_path: crate::nlp::script_path_label(&script_path),
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
            script_path: crate::nlp::script_path_label(&script_path),
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
            script_path: crate::nlp::script_path_label(&script_path),
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
    let enabled = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        is_nlp_enabled(&conn)?
    };
    if !enabled {
        return Ok(Vec::new());
    }

    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    let (vector, _model) = sidecar.embed_text(q)?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    semantic_search(&conn, &vector, limit.unwrap_or(12))
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

        let (title, content_json): (String, String) = conn
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;

        format!("{title}\n{}", extract_search_text(&content_json))
    };

    let (vector, model) = sidecar.embed_text(&text)?;
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        upsert_embedding(&conn, &document_id, &vector, &model, now_ts())?;
    }

    Ok(NlpIndexResult {
        indexed: 1,
        model,
    })
}

#[tauri::command]
pub fn nlp_index_all(state: State<'_, DbState>, sidecar: State<'_, NlpSidecar>) -> Result<NlpIndexResult, String> {
    let docs = {
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
        docs
    };

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

    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        for (document_id, vector) in ids.into_iter().zip(vectors.into_iter()) {
            upsert_embedding(&conn, &document_id, &vector, &model, now)?;
        }
    }

    Ok(NlpIndexResult { indexed, model })
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

    let payload = json!({
        "fromDate": input.from_date,
        "toDate": input.to_date,
        "summary": summary,
        "bullets": bullets,
        "documentCount": count,
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
    })
}

#[tauri::command]
pub fn nlp_suggest_tags(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    document_id: String,
) -> Result<NlpTagSuggestions, String> {
    let text = {
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

        format!("{title}\n{}", extract_search_text(&content_json))
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
    let documents = {
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
        documents
    };

    let result = sidecar.library_report(json!(documents))?;
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
