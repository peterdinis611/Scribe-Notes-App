use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocumentChatCitation {
    pub document_id: String,
    pub title: String,
    pub snippet: String,
}

#[derive(Debug, Serialize, Clone)]
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendDocumentChatMessageInput {
    pub document_id: String,
    pub role: String,
    pub text: String,
    pub action: Option<String>,
    pub citations: Option<Vec<DocumentChatCitationInput>>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocumentChatCitationInput {
    pub document_id: String,
    pub title: String,
    pub snippet: String,
}

fn parse_citations(raw: Option<String>) -> Vec<DocumentChatCitation> {
    let Some(json) = raw.filter(|value| !value.trim().is_empty()) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<DocumentChatCitation>>(&json).unwrap_or_default()
}

#[tauri::command]
pub fn list_document_chat_messages(
    state: State<'_, DbState>,
    document_id: String,
) -> Result<Vec<DocumentChatMessage>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, document_id, role, text, created_at, action, citations_json \
             FROM document_chat_messages \
             WHERE document_id = ?1 \
             ORDER BY created_at ASC, id ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![document_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut messages = Vec::new();
    for row in rows {
        let (id, document_id, role, text, created_at, action, citations_json) =
            row.map_err(|e| e.to_string())?;
        messages.push(DocumentChatMessage {
            id,
            document_id,
            role,
            text,
            created_at,
            action,
            citations: parse_citations(citations_json),
        });
    }
    Ok(messages)
}

#[tauri::command]
pub fn append_document_chat_message(
    state: State<'_, DbState>,
    input: AppendDocumentChatMessageInput,
) -> Result<DocumentChatMessage, String> {
    let role = input.role.trim().to_lowercase();
    if role != "user" && role != "assistant" {
        return Err("documentChat.invalidRole".to_string());
    }
    let text = input.text.trim().to_string();
    if text.is_empty() {
        return Err("documentChat.emptyText".to_string());
    }

    let id = Uuid::new_v4().to_string();
    let created_at = now_ts();
    let citations = input
        .citations
        .unwrap_or_default()
        .into_iter()
        .map(|item| DocumentChatCitation {
            document_id: item.document_id,
            title: item.title,
            snippet: item.snippet,
        })
        .collect::<Vec<_>>();
    let citations_json = if citations.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&citations).map_err(|e| e.to_string())?)
    };
    let action = input
        .action
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        // Ensure document exists
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![input.document_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if exists == 0 {
            return Err("documentChat.documentMissing".to_string());
        }

        conn.execute(
            "INSERT INTO document_chat_messages \
             (id, document_id, role, text, created_at, action, citations_json) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                input.document_id,
                role,
                text,
                created_at,
                action,
                citations_json,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(DocumentChatMessage {
        id,
        document_id: input.document_id,
        role,
        text,
        created_at,
        action,
        citations,
    })
}

#[tauri::command]
pub fn clear_document_chat_messages(
    state: State<'_, DbState>,
    document_id: String,
) -> Result<u64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let deleted = conn
        .execute(
            "DELETE FROM document_chat_messages WHERE document_id = ?1",
            params![document_id],
        )
        .map_err(|e| e.to_string())?;
    Ok(deleted as u64)
}
