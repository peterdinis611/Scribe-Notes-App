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
    pub agent_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendAgentMessageInput {
    pub document_id: String,
    pub role: String,
    pub text: String,
    pub steps: Option<Vec<AgentStepRecord>>,
    pub citations: Option<Vec<AgentCitation>>,
    pub agent_id: Option<String>,
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
    agent_id: Option<String>,
) -> Result<Vec<AgentMessage>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let agent_filter = agent_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| scribe_agent::normalize_agent_id(Some(value)));

    let mut stmt = if agent_filter.is_some() {
        conn.prepare(
            "SELECT id, document_id, role, text, created_at, steps_json, citations_json, \
             COALESCE(agent_id, 'general') \
             FROM agent_messages \
             WHERE document_id = ?1 AND COALESCE(agent_id, 'general') = ?2 \
             ORDER BY created_at ASC, id ASC",
        )
    } else {
        conn.prepare(
            "SELECT id, document_id, role, text, created_at, steps_json, citations_json, \
             COALESCE(agent_id, 'general') \
             FROM agent_messages \
             WHERE document_id = ?1 \
             ORDER BY created_at ASC, id ASC",
        )
    }
    .map_err(|e| e.to_string())?;

    let map_row = |row: &rusqlite::Row<'_>| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, i64>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, String>(7)?,
        ))
    };

    let rows = if let Some(agent_id) = agent_filter.as_deref() {
        stmt.query_map(params![document_id, agent_id], map_row)
    } else {
        stmt.query_map(params![document_id], map_row)
    }
    .map_err(|e| e.to_string())?;

    let mut messages = Vec::new();
    for row in rows {
        let (id, document_id, role, text, created_at, steps_json, citations_json, agent_id) =
            row.map_err(|e| e.to_string())?;
        messages.push(AgentMessage {
            id,
            document_id,
            role,
            text,
            created_at,
            steps: parse_json_vec(steps_json),
            citations: parse_json_vec(citations_json),
            agent_id,
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
    let agent_id = scribe_agent::normalize_agent_id(input.agent_id.as_deref());
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
             (id, document_id, role, text, created_at, steps_json, citations_json, agent_id) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                input.document_id,
                role,
                text,
                created_at,
                steps_json,
                citations_json,
                agent_id,
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
        agent_id,
    })
}

#[tauri::command]
pub fn clear_agent_messages(
    state: State<'_, DbState>,
    document_id: String,
    agent_id: Option<String>,
) -> Result<u64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let deleted = if let Some(raw) = agent_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let agent_id = scribe_agent::normalize_agent_id(Some(raw));
        conn.execute(
            "DELETE FROM agent_messages WHERE document_id = ?1 AND COALESCE(agent_id, 'general') = ?2",
            params![document_id, agent_id],
        )
    } else {
        conn.execute(
            "DELETE FROM agent_messages WHERE document_id = ?1",
            params![document_id],
        )
    }
    .map_err(|e| e.to_string())?;
    Ok(deleted as u64)
}

// --- scribe-agent.db (separate agent store) ---

use crate::agent_db::AgentDbState;
use crate::audit_db::AuditDbState;
use crate::commands::audit::append_audit;
use scribe_agent::{
    AgentDigestSchedule, AgentHandoff, AgentPrefs, AgentRoleState, AgentRunRecord, AgentTeaching,
    CustomAgentRecipe, SCHEMA_VERSION,
};
use serde_json::json;

#[tauri::command]
pub fn get_agent_prefs(agent: State<'_, AgentDbState>) -> Result<AgentPrefs, String> {
    let store = agent.store.lock().map_err(|e| e.to_string())?;
    store.get_prefs()
}

#[tauri::command]
pub fn get_agent_schema_version() -> i32 {
    SCHEMA_VERSION
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAgentPrefsInput {
    pub enabled: bool,
    pub max_steps: i32,
    pub prefer_fast: bool,
    pub preferred_tools: Vec<String>,
    pub disabled_tools: Vec<String>,
    pub digest_schedule: Option<AgentDigestSchedule>,
    pub custom_recipes: Option<Vec<CustomAgentRecipe>>,
    pub extras: Option<serde_json::Value>,
}

#[tauri::command]
pub fn set_agent_prefs(
    agent: State<'_, AgentDbState>,
    audit: State<'_, AuditDbState>,
    input: SetAgentPrefsInput,
) -> Result<AgentPrefs, String> {
    let store = agent.store.lock().map_err(|e| e.to_string())?;
    let current = store.get_prefs().unwrap_or_default();
    let prefs = store.set_prefs(&AgentPrefs {
        enabled: input.enabled,
        max_steps: input.max_steps,
        prefer_fast: input.prefer_fast,
        preferred_tools: input.preferred_tools,
        disabled_tools: input.disabled_tools,
        digest_schedule: input.digest_schedule.unwrap_or(current.digest_schedule),
        custom_recipes: input.custom_recipes.unwrap_or(current.custom_recipes),
        extras: input.extras.unwrap_or(current.extras),
    })?;
    append_audit(
        &audit,
        "tauri",
        "prefs",
        "set_prefs",
        &format!(
            "Agent prefs updated (enabled={}, maxSteps={})",
            prefs.enabled, prefs.max_steps
        ),
        Some(json!({ "enabled": prefs.enabled, "maxSteps": prefs.max_steps })),
        "ok",
    );
    Ok(prefs)
}

#[tauri::command]
pub fn list_agent_role_states(
    agent: State<'_, AgentDbState>,
) -> Result<Vec<AgentRoleState>, String> {
    let store = agent.store.lock().map_err(|e| e.to_string())?;
    store.list_role_states()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAgentRoleStatesInput {
    pub roles: Vec<AgentRoleState>,
}

#[tauri::command]
pub fn set_agent_role_states(
    agent: State<'_, AgentDbState>,
    audit: State<'_, AuditDbState>,
    input: SetAgentRoleStatesInput,
) -> Result<Vec<AgentRoleState>, String> {
    let store = agent.store.lock().map_err(|e| e.to_string())?;
    let roles = store.set_role_states(&input.roles)?;
    append_audit(
        &audit,
        "tauri",
        "prefs",
        "set_roles",
        &format!("Updated {} agent role state(s)", roles.len()),
        None,
        "ok",
    );
    Ok(roles)
}

#[tauri::command]
pub fn list_agent_teachings(
    agent: State<'_, AgentDbState>,
    agent_id: Option<String>,
) -> Result<Vec<AgentTeaching>, String> {
    let store = agent.store.lock().map_err(|e| e.to_string())?;
    store.list_teachings(agent_id.as_deref())
}

#[tauri::command]
pub fn add_agent_teaching(
    agent: State<'_, AgentDbState>,
    audit: State<'_, AuditDbState>,
    text: String,
    topic: Option<String>,
    agent_id: Option<String>,
) -> Result<AgentTeaching, String> {
    let store = agent.store.lock().map_err(|e| e.to_string())?;
    let teaching = store.add_teaching(&text, topic.as_deref(), agent_id.as_deref())?;
    append_audit(
        &audit,
        "tauri",
        "agent",
        "add_teaching",
        "Agent teaching added",
        Some(json!({
            "id": teaching.id,
            "agentId": teaching.agent_id,
            "topic": teaching.topic,
        })),
        "ok",
    );
    Ok(teaching)
}

#[tauri::command]
pub fn remove_agent_teaching(
    agent: State<'_, AgentDbState>,
    audit: State<'_, AuditDbState>,
    id: String,
) -> Result<bool, String> {
    let store = agent.store.lock().map_err(|e| e.to_string())?;
    let removed = store.remove_teaching(&id)?;
    if removed {
        append_audit(
            &audit,
            "tauri",
            "agent",
            "remove_teaching",
            "Agent teaching removed",
            Some(json!({ "id": id })),
            "ok",
        );
    }
    Ok(removed)
}

#[tauri::command]
pub fn clear_agent_teachings(
    agent: State<'_, AgentDbState>,
    audit: State<'_, AuditDbState>,
    agent_id: Option<String>,
) -> Result<u64, String> {
    let store = agent.store.lock().map_err(|e| e.to_string())?;
    let cleared = store.clear_teachings(agent_id.as_deref())?;
    append_audit(
        &audit,
        "tauri",
        "agent",
        "clear_teachings",
        &format!("Cleared {cleared} agent teaching(s)"),
        Some(json!({ "agentId": agent_id })),
        "ok",
    );
    Ok(cleared)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendAgentRunInput {
    pub scope: String,
    pub document_id: Option<String>,
    pub goal: String,
    pub steps_json: Option<String>,
    pub answer: Option<String>,
    pub agent_id: Option<String>,
}

#[tauri::command]
pub fn append_agent_run(
    agent: State<'_, AgentDbState>,
    audit: State<'_, AuditDbState>,
    input: AppendAgentRunInput,
) -> Result<AgentRunRecord, String> {
    let store = agent.store.lock().map_err(|e| e.to_string())?;
    let run = store.append_run(
        &input.scope,
        input.document_id.as_deref(),
        &input.goal,
        input.steps_json.as_deref(),
        input.answer.as_deref(),
        input.agent_id.as_deref(),
    )?;
    append_audit(
        &audit,
        "tauri",
        "agent",
        "run",
        &format!("Agent run: {}", truncate(&run.goal, 120)),
        Some(json!({
            "id": run.id,
            "scope": run.scope,
            "agentId": run.agent_id,
            "documentId": run.document_id,
        })),
        "ok",
    );
    Ok(run)
}

#[tauri::command]
pub fn list_agent_runs(
    agent: State<'_, AgentDbState>,
    limit: Option<u32>,
    agent_id: Option<String>,
) -> Result<Vec<AgentRunRecord>, String> {
    let store = agent.store.lock().map_err(|e| e.to_string())?;
    store.list_runs(limit.unwrap_or(40) as usize, agent_id.as_deref())
}

#[tauri::command]
pub fn get_agent_db_path(agent: State<'_, AgentDbState>) -> Result<Option<String>, String> {
    let store = agent.store.lock().map_err(|e| e.to_string())?;
    Ok(store.path().map(|path| path.to_string_lossy().to_string()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendAgentHandoffInput {
    pub from_agent_id: String,
    pub to_agent_id: String,
    pub summary: String,
    pub document_id: Option<String>,
    pub payload_json: Option<String>,
}

#[tauri::command]
pub fn send_agent_handoff(
    agent: State<'_, AgentDbState>,
    audit: State<'_, AuditDbState>,
    input: SendAgentHandoffInput,
) -> Result<AgentHandoff, String> {
    let store = agent.store.lock().map_err(|e| e.to_string())?;
    let handoff = store.send_handoff(
        &input.from_agent_id,
        &input.to_agent_id,
        &input.summary,
        input.document_id.as_deref(),
        input.payload_json.as_deref(),
    )?;
    append_audit(
        &audit,
        "tauri",
        "handoff",
        "send",
        &format!(
            "Handoff {} → {}: {}",
            handoff.from_agent_id,
            handoff.to_agent_id,
            truncate(&handoff.summary, 100)
        ),
        Some(json!({
            "id": handoff.id,
            "fromAgentId": handoff.from_agent_id,
            "toAgentId": handoff.to_agent_id,
            "documentId": handoff.document_id,
        })),
        "ok",
    );
    Ok(handoff)
}

#[tauri::command]
pub fn list_agent_handoffs(
    agent: State<'_, AgentDbState>,
    to_agent_id: String,
    status: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<AgentHandoff>, String> {
    let store = agent.store.lock().map_err(|e| e.to_string())?;
    store.list_handoff_inbox(
        &to_agent_id,
        status.as_deref(),
        limit.unwrap_or(24) as usize,
    )
}

#[tauri::command]
pub fn set_agent_handoff_status(
    agent: State<'_, AgentDbState>,
    audit: State<'_, AuditDbState>,
    id: String,
    status: String,
) -> Result<Option<AgentHandoff>, String> {
    let store = agent.store.lock().map_err(|e| e.to_string())?;
    let handoff = store.set_handoff_status(&id, &status)?;
    if let Some(ref item) = handoff {
        append_audit(
            &audit,
            "tauri",
            "handoff",
            "status",
            &format!("Handoff {} → {}", item.id, item.status),
            Some(json!({ "id": item.id, "status": item.status })),
            "ok",
        );
    }
    Ok(handoff)
}

fn truncate(value: &str, max: usize) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() <= max {
        trimmed.to_string()
    } else {
        trimmed.chars().take(max.saturating_sub(1)).collect::<String>() + "…"
    }
}
