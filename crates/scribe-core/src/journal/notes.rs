use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;
use uuid::Uuid;

use crate::dates::parse_date_key;
use crate::db::{active_library_id, sync_document_fts, sync_document_links};
use crate::plain_text::tiptap_to_plain_text;

use super::types::{JournalNote, JournalSlot};

pub(crate) const JOURNAL_FOLDER_EN: &str = "Journal";
pub(crate) const JOURNAL_FOLDER_SK: &str = "Denník";

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

pub fn resolve_journal_date(date: Option<&str>) -> Result<String, String> {
    match date.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => {
            parse_date_key(value)?;
            Ok(value.to_string())
        }
        None => Ok(chrono::Local::now().format("%Y-%m-%d").to_string()),
    }
}

pub fn find_journal_note(
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

/// Create a journal note when missing. Caller must hold a writable connection.
pub fn create_journal_note(
    conn: &Connection,
    date: &str,
    slot: JournalSlot,
) -> Result<JournalNote, String> {
    if let Some(existing) = find_journal_note(conn, date, slot)? {
        return Ok(existing);
    }

    let (folder_id, folder_name) = ensure_journal_folder(conn)?;
    let locale_sk = folder_name == JOURNAL_FOLDER_SK;
    let title = journal_create_title(date, slot, locale_sk);
    let content_json = journal_content_json(&title, slot);
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let library_id = active_library_id(conn);
    conn.execute(
        "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at, library_id)
         VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5, ?6)",
        params![id, title, content_json, folder_id, now, library_id],
    )
    .map_err(|e| e.to_string())?;
    sync_document_fts(conn, &id, &title, &content_json)?;
    sync_document_links(conn, &id, &content_json)?;

    Ok(JournalNote {
        id,
        title: title.clone(),
        folder_id,
        date: date.to_string(),
        slot: slot.as_str().to_string(),
        created: true,
        plain_text: tiptap_to_plain_text(&content_json),
    })
}
