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
pub struct AgentCitation {
    pub document_id: String,
    pub title: String,
    pub snippet: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentStepRecord {
    pub tool: String,
    pub status: String,
    pub detail: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentMessage {
    pub id: String,
    pub document_id: String,
    pub role: String,
    pub text: String,
    pub created_at: i64,
    pub steps: Vec<AgentStepRecord>,
    pub citations: Vec<AgentCitation>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendAgentMessageInput {
    pub document_id: String,
    pub role: String,
    pub text: String,
    pub steps: Option<Vec<AgentStepRecord>>,
    pub citations: Option<Vec<AgentCitation>>,
}

fn parse_json_vec<T: for<'de> Deserialize<'de>>(raw: Option<String>) -> Vec<T> {
    let Some(json) = raw.filter(|value| !value.trim().is_empty()) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<T>>(&json).unwrap_or_default()
}

#[tauri::command]
pub fn list_agent_messages(
    state: State<'_, DbState>,
    document_id: String,
) -> Result<Vec<AgentMessage>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, document_id, role, text, created_at, steps_json, citations_json \
             FROM agent_messages \
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
        let (id, document_id, role, text, created_at, steps_json, citations_json) =
            row.map_err(|e| e.to_string())?;
        messages.push(AgentMessage {
            id,
            document_id,
            role,
            text,
            created_at,
            steps: parse_json_vec(steps_json),
            citations: parse_json_vec(citations_json),
        });
    }
    Ok(messages)
}

#[tauri::command]
pub fn append_agent_message(
    state: State<'_, DbState>,
    input: AppendAgentMessageInput,
) -> Result<AgentMessage, String> {
    let role = input.role.trim().to_lowercase();
    if role != "user" && role != "assistant" {
        return Err("agent.invalidRole".to_string());
    }
    let text = input.text.trim().to_string();
    if text.is_empty() {
        return Err("agent.emptyText".to_string());
    }

    let id = Uuid::new_v4().to_string();
    let created_at = now_ts();
    let steps = input.steps.unwrap_or_default();
    let citations = input.citations.unwrap_or_default();
    let steps_json = if steps.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&steps).map_err(|e| e.to_string())?)
    };
    let citations_json = if citations.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&citations).map_err(|e| e.to_string())?)
    };

    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![input.document_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if exists == 0 {
            return Err("agent.documentMissing".to_string());
        }

        conn.execute(
            "INSERT INTO agent_messages \
             (id, document_id, role, text, created_at, steps_json, citations_json) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                input.document_id,
                role,
                text,
                created_at,
                steps_json,
                citations_json,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(AgentMessage {
        id,
        document_id: input.document_id,
        role,
        text,
        created_at,
        steps,
        citations,
    })
}

#[tauri::command]
pub fn clear_agent_messages(
    state: State<'_, DbState>,
    document_id: String,
) -> Result<u64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let deleted = conn
        .execute(
            "DELETE FROM agent_messages WHERE document_id = ?1",
            params![document_id],
        )
        .map_err(|e| e.to_string())?;
    Ok(deleted as u64)
}
