//! Rolling Q&A memory stored as NLP artifacts (no extra ML process).

use rusqlite::{params, Connection};
use serde_json::{json, Value};

use crate::db::save_artifact;
use crate::nlp::NlpCitation;

pub const LIBRARY_MEMORY_KIND: &str = "library_memory";
pub const DOCUMENT_MEMORY_KIND: &str = "document_memory";
const LIBRARY_MEMORY_KEEP: usize = 24;
const LIBRARY_MEMORY_TTL_SECS: i64 = 14 * 24 * 60 * 60;
const MATCH_LIMIT: usize = 4;
const DIGEST_PAIRS: usize = 6;
const CLIP_CHARS: usize = 420;

fn fnv_key(text: &str) -> String {
    let mut hash: u32 = 2_166_136_261;
    for byte in text.trim().to_lowercase().bytes() {
        hash ^= u32::from(byte);
        hash = hash.wrapping_mul(16_777_619);
    }
    format!("{hash:08x}")
}

fn clip(text: &str, max: usize) -> String {
    let trimmed = text.trim();
    let count = trimmed.chars().count();
    if count <= max {
        return trimmed.to_string();
    }
    let mut out: String = trimmed.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

fn question_terms(question: &str) -> Vec<String> {
    question
        .split_whitespace()
        .map(|token| token.trim_matches(|ch: char| !ch.is_alphanumeric()).to_lowercase())
        .filter(|token| token.len() >= 3)
        .collect()
}

fn overlap_score(question: &str, stored: &str) -> f64 {
    let terms = question_terms(question);
    if terms.is_empty() {
        return 0.0;
    }
    let hay = stored.to_lowercase();
    let hits = terms.iter().filter(|term| hay.contains(term.as_str())).count();
    hits as f64 / terms.len() as f64
}

fn parse_payload(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or(json!({}))
}

fn memory_passage(document_id: &str, title: &str, snippet: &str, score: f64) -> Value {
    json!({
        "documentId": document_id,
        "title": title,
        "snippet": snippet,
        "score": score,
    })
}

pub fn collect_library_memory_passages(conn: &Connection, question: &str) -> Vec<Value> {
    let _ = prune_expired(conn);
    let mut stmt = match conn.prepare(
        "SELECT id, payload_json, created_at FROM nlp_artifacts
         WHERE kind = ?1 ORDER BY created_at DESC LIMIT 32",
    ) {
        Ok(stmt) => stmt,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map(params![LIBRARY_MEMORY_KIND], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
        ))
    }) {
        Ok(rows) => rows,
        Err(_) => return Vec::new(),
    };

    let mut scored: Vec<(f64, Value)> = Vec::new();
    for row in rows.flatten() {
        let payload = parse_payload(&row.1);
        let stored_q = payload
            .get("question")
            .and_then(Value::as_str)
            .unwrap_or("");
        let answer = payload.get("answer").and_then(Value::as_str).unwrap_or("");
        if stored_q.is_empty() || answer.is_empty() {
            continue;
        }
        let score = overlap_score(question, &format!("{stored_q} {answer}"));
        if score < 0.18 {
            continue;
        }
        let doc_id = payload
            .get("citations")
            .and_then(Value::as_array)
            .and_then(|items| items.first())
            .and_then(|item| item.get("documentId"))
            .and_then(Value::as_str)
            .unwrap_or("library-memory");
        scored.push((
            score,
            memory_passage(
                doc_id,
                "Library memory",
                &format!("Previous Q: {}\nPrevious A: {}", clip(stored_q, 180), clip(answer, CLIP_CHARS)),
                score,
            ),
        ));
    }
    scored.sort_by(|left, right| {
        right
            .0
            .partial_cmp(&left.0)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    scored.truncate(MATCH_LIMIT);
    scored.into_iter().map(|(_, item)| item).collect()
}

pub fn collect_document_memory_passages(conn: &Connection, document_id: &str) -> Vec<Value> {
    let id = format!("{DOCUMENT_MEMORY_KIND}:{document_id}");
    let raw: Option<String> = conn
        .query_row(
            "SELECT payload_json FROM nlp_artifacts WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .ok();
    let Some(raw) = raw else {
        return Vec::new();
    };
    let payload = parse_payload(&raw);
    let digest = payload.get("digest").and_then(Value::as_str).unwrap_or("");
    if digest.trim().is_empty() {
        return Vec::new();
    }
    vec![memory_passage(
        document_id,
        "Note memory",
        &format!("Earlier answers on this note:\n{}", clip(digest, 900)),
        0.22,
    )]
}

pub fn persist_library_memory(
    conn: &Connection,
    question: &str,
    answer: &str,
    citations: &[NlpCitation],
) -> Result<(), String> {
    let question = question.trim();
    let answer = answer.trim();
    if question.is_empty() || answer.is_empty() {
        return Ok(());
    }
    if answer.contains("No matching passages were found") {
        return Ok(());
    }
    let id = format!("{LIBRARY_MEMORY_KIND}:{}", fnv_key(question));
    let payload = json!({
        "question": clip(question, 280),
        "answer": clip(answer, 900),
        "citations": citations.iter().take(4).map(|item| json!({
            "documentId": item.document_id,
            "title": item.title,
            "snippet": clip(&item.snippet, 180),
            "chunkIndex": item.chunk_index,
        })).collect::<Vec<_>>(),
    });
    save_artifact(
        conn,
        &id,
        LIBRARY_MEMORY_KIND,
        &payload.to_string(),
        chrono::Utc::now().timestamp(),
    )?;
    prune_expired(conn)?;
    prune_kind(conn, LIBRARY_MEMORY_KIND, LIBRARY_MEMORY_KEEP)
}

pub fn persist_document_memory(
    conn: &Connection,
    document_id: &str,
    question: &str,
    answer: &str,
) -> Result<(), String> {
    let question = question.trim();
    let answer = answer.trim();
    if document_id.is_empty() || question.is_empty() || answer.is_empty() {
        return Ok(());
    }
    if answer.contains("No matching passages were found") {
        return Ok(());
    }
    let id = format!("{DOCUMENT_MEMORY_KIND}:{document_id}");
    let existing: Option<String> = conn
        .query_row(
            "SELECT payload_json FROM nlp_artifacts WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .ok();
    let previous = existing
        .as_deref()
        .map(parse_payload)
        .and_then(|payload| {
            payload
                .get("pairs")
                .and_then(Value::as_array)
                .cloned()
        })
        .unwrap_or_default();
    let mut pairs = previous;
    pairs.push(json!({
        "q": clip(question, 180),
        "a": clip(answer, CLIP_CHARS),
    }));
    if pairs.len() > DIGEST_PAIRS {
        let start = pairs.len() - DIGEST_PAIRS;
        pairs = pairs[start..].to_vec();
    }
    let digest = pairs
        .iter()
        .filter_map(|item| {
            Some(format!(
                "Q: {}\nA: {}",
                item.get("q")?.as_str()?,
                item.get("a")?.as_str()?
            ))
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    let payload = json!({
        "documentId": document_id,
        "pairs": pairs,
        "digest": digest,
    });
    save_artifact(
        conn,
        &id,
        DOCUMENT_MEMORY_KIND,
        &payload.to_string(),
        chrono::Utc::now().timestamp(),
    )?;
    prune_expired(conn).map(|_| ())
}

pub fn prune_expired(conn: &Connection) -> Result<i64, String> {
    let cutoff = chrono::Utc::now().timestamp() - LIBRARY_MEMORY_TTL_SECS;
    let n = conn
        .execute(
            "DELETE FROM nlp_artifacts
             WHERE kind IN (?1, ?2) AND created_at < ?3",
            params![LIBRARY_MEMORY_KIND, DOCUMENT_MEMORY_KIND, cutoff],
        )
        .map_err(|e| e.to_string())?;
    Ok(n as i64)
}

fn prune_kind(conn: &Connection, kind: &str, keep: usize) -> Result<(), String> {
    conn.execute(
        "DELETE FROM nlp_artifacts WHERE kind = ?1 AND id NOT IN (
            SELECT id FROM nlp_artifacts WHERE kind = ?1 ORDER BY created_at DESC LIMIT ?2
         )",
        params![kind, keep as i64],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;
    use crate::db::test_helpers::in_memory_conn;
    use crate::nlp::NlpCitation;

    #[test]
    fn stores_and_retrieves_overlapping_library_memory() {
        let conn = in_memory_conn();
        run_migrations(&conn).unwrap();
        persist_library_memory(
            &conn,
            "When is the Atlas deadline?",
            "Based on your notes: Friday.",
            &[NlpCitation {
                document_id: "d1".into(),
                title: "Atlas".into(),
                snippet: "Friday".into(),
                chunk_index: None,
            }],
        )
        .unwrap();
        let passages = collect_library_memory_passages(&conn, "atlas deadline");
        assert_eq!(passages.len(), 1);
        assert!(passages[0]["snippet"].as_str().unwrap().contains("Friday"));
    }

    #[test]
    fn document_memory_rolls_pairs() {
        let conn = in_memory_conn();
        run_migrations(&conn).unwrap();
        persist_document_memory(&conn, "doc-1", "What is the title?", "Guide.").unwrap();
        persist_document_memory(&conn, "doc-1", "Any deadline?", "Monday.").unwrap();
        let passages = collect_document_memory_passages(&conn, "doc-1");
        assert_eq!(passages.len(), 1);
        let snippet = passages[0]["snippet"].as_str().unwrap();
        assert!(snippet.contains("Guide."));
        assert!(snippet.contains("Monday."));
    }
}
