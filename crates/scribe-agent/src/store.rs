use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::AgentDb;

pub const DEFAULT_MAX_STEPS: i32 = 3;
pub const TEACHINGS_MAX: usize = 24;
pub const TEACHING_MAX_LEN: usize = 280;
pub const RUNS_KEEP: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentPrefs {
    pub enabled: bool,
    pub max_steps: i32,
    pub prefer_fast: bool,
    pub preferred_tools: Vec<String>,
    pub disabled_tools: Vec<String>,
}

impl Default for AgentPrefs {
    fn default() -> Self {
        Self {
            enabled: true,
            max_steps: DEFAULT_MAX_STEPS,
            prefer_fast: false,
            preferred_tools: Vec::new(),
            disabled_tools: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentTeaching {
    pub id: String,
    pub text: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunRecord {
    pub id: String,
    pub scope: String,
    pub document_id: Option<String>,
    pub goal: String,
    pub steps_json: Option<String>,
    pub answer: Option<String>,
    pub created_at: i64,
}

pub struct AgentStore {
    db: AgentDb,
}

impl AgentStore {
    pub fn new(db: AgentDb) -> Self {
        Self { db }
    }

    pub fn from_path(path: &std::path::Path) -> Result<Self, String> {
        Ok(Self::new(crate::db::open_agent_db(path)?))
    }

    pub fn from_memory() -> Result<Self, String> {
        Ok(Self::new(crate::db::open_agent_db_memory()?))
    }

    pub fn conn(&self) -> &Connection {
        &self.db.conn
    }

    pub fn path(&self) -> Option<&std::path::Path> {
        self.db.path.as_deref()
    }

    pub fn get_prefs(&self) -> Result<AgentPrefs, String> {
        self.db
            .conn
            .query_row(
                "SELECT enabled, max_steps, prefer_fast, preferred_tools_json, disabled_tools_json \
                 FROM agent_prefs WHERE id = 1",
                [],
                |row| {
                    let preferred_raw: String = row.get(3)?;
                    let disabled_raw: String = row.get(4)?;
                    Ok(AgentPrefs {
                        enabled: row.get::<_, i64>(0)? != 0,
                        max_steps: clamp_steps(row.get(1)?),
                        prefer_fast: row.get::<_, i64>(2)? != 0,
                        preferred_tools: parse_string_list(&preferred_raw),
                        disabled_tools: parse_string_list(&disabled_raw),
                    })
                },
            )
            .map_err(|e| e.to_string())
    }

    pub fn set_prefs(&self, prefs: &AgentPrefs) -> Result<AgentPrefs, String> {
        let normalized = normalize_prefs(prefs);
        let preferred = serde_json::to_string(&normalized.preferred_tools).map_err(|e| e.to_string())?;
        let disabled = serde_json::to_string(&normalized.disabled_tools).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now().timestamp();
        self.db
            .conn
            .execute(
                "UPDATE agent_prefs SET enabled = ?1, max_steps = ?2, prefer_fast = ?3, \
                 preferred_tools_json = ?4, disabled_tools_json = ?5, updated_at = ?6 WHERE id = 1",
                params![
                    if normalized.enabled { 1 } else { 0 },
                    normalized.max_steps,
                    if normalized.prefer_fast { 1 } else { 0 },
                    preferred,
                    disabled,
                    now,
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(normalized)
    }

    pub fn list_teachings(&self) -> Result<Vec<AgentTeaching>, String> {
        let mut stmt = self
            .db
            .conn
            .prepare(
                "SELECT id, text, created_at FROM agent_teachings \
                 ORDER BY created_at DESC, id DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![TEACHINGS_MAX as i64], |row| {
                Ok(AgentTeaching {
                    id: row.get(0)?,
                    text: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn add_teaching(&self, text: &str) -> Result<AgentTeaching, String> {
        let text = normalize_teaching_text(text).ok_or_else(|| "teaching text is required".to_string())?;
        // Dedupe case-insensitive
        let existing: Option<String> = self
            .db
            .conn
            .query_row(
                "SELECT id FROM agent_teachings WHERE lower(text) = lower(?1) LIMIT 1",
                params![text],
                |row| row.get(0),
            )
            .ok();
        if let Some(id) = existing {
            let created_at: i64 = self
                .db
                .conn
                .query_row(
                    "SELECT created_at FROM agent_teachings WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            return Ok(AgentTeaching {
                id,
                text,
                created_at,
            });
        }

        let teaching = AgentTeaching {
            id: Uuid::new_v4().to_string(),
            text,
            created_at: chrono::Utc::now().timestamp(),
        };
        self.db
            .conn
            .execute(
                "INSERT INTO agent_teachings (id, text, created_at) VALUES (?1, ?2, ?3)",
                params![teaching.id, teaching.text, teaching.created_at],
            )
            .map_err(|e| e.to_string())?;

        // Cap table size
        self.db
            .conn
            .execute(
                "DELETE FROM agent_teachings WHERE id NOT IN (
                    SELECT id FROM agent_teachings ORDER BY created_at DESC, id DESC LIMIT ?1
                 )",
                params![TEACHINGS_MAX as i64],
            )
            .map_err(|e| e.to_string())?;

        Ok(teaching)
    }

    pub fn remove_teaching(&self, id: &str) -> Result<bool, String> {
        let deleted = self
            .db
            .conn
            .execute("DELETE FROM agent_teachings WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(deleted > 0)
    }

    pub fn clear_teachings(&self) -> Result<u64, String> {
        let deleted = self
            .db
            .conn
            .execute("DELETE FROM agent_teachings", [])
            .map_err(|e| e.to_string())?;
        Ok(deleted as u64)
    }

    pub fn append_run(
        &self,
        scope: &str,
        document_id: Option<&str>,
        goal: &str,
        steps_json: Option<&str>,
        answer: Option<&str>,
    ) -> Result<AgentRunRecord, String> {
        let goal = goal.trim();
        if goal.is_empty() {
            return Err("goal is required".to_string());
        }
        let scope = scope.trim().to_lowercase();
        if scope != "library" && scope != "document" {
            return Err("scope must be library or document".to_string());
        }
        let record = AgentRunRecord {
            id: Uuid::new_v4().to_string(),
            scope,
            document_id: document_id.map(str::to_string).filter(|value| !value.is_empty()),
            goal: goal.to_string(),
            steps_json: steps_json.map(str::to_string),
            answer: answer.map(str::to_string),
            created_at: chrono::Utc::now().timestamp(),
        };
        self.db
            .conn
            .execute(
                "INSERT INTO agent_runs (id, scope, document_id, goal, steps_json, answer, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    record.id,
                    record.scope,
                    record.document_id,
                    record.goal,
                    record.steps_json,
                    record.answer,
                    record.created_at,
                ],
            )
            .map_err(|e| e.to_string())?;

        self.db
            .conn
            .execute(
                "DELETE FROM agent_runs WHERE id NOT IN (
                    SELECT id FROM agent_runs ORDER BY created_at DESC, id DESC LIMIT ?1
                 )",
                params![RUNS_KEEP as i64],
            )
            .map_err(|e| e.to_string())?;

        Ok(record)
    }

    pub fn list_runs(&self, limit: usize) -> Result<Vec<AgentRunRecord>, String> {
        let limit = limit.clamp(1, RUNS_KEEP) as i64;
        let mut stmt = self
            .db
            .conn
            .prepare(
                "SELECT id, scope, document_id, goal, steps_json, answer, created_at \
                 FROM agent_runs ORDER BY created_at DESC, id DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![limit], |row| {
                Ok(AgentRunRecord {
                    id: row.get(0)?,
                    scope: row.get(1)?,
                    document_id: row.get(2)?,
                    goal: row.get(3)?,
                    steps_json: row.get(4)?,
                    answer: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }
}

fn clamp_steps(value: i32) -> i32 {
    value.clamp(1, 3)
}

fn parse_string_list(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw)
        .unwrap_or_default()
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .take(8)
        .collect()
}

fn normalize_prefs(prefs: &AgentPrefs) -> AgentPrefs {
    AgentPrefs {
        enabled: prefs.enabled,
        max_steps: clamp_steps(prefs.max_steps),
        prefer_fast: prefs.prefer_fast,
        preferred_tools: prefs
            .preferred_tools
            .iter()
            .map(|item| item.trim().to_string())
            .filter(|item| !item.is_empty())
            .take(8)
            .collect(),
        disabled_tools: prefs
            .disabled_tools
            .iter()
            .map(|item| item.trim().to_string())
            .filter(|item| !item.is_empty())
            .take(8)
            .collect(),
    }
}

fn normalize_teaching_text(text: &str) -> Option<String> {
    let trimmed = text.trim().split_whitespace().collect::<Vec<_>>().join(" ");
    if trimmed.len() < 2 {
        return None;
    }
    Some(trimmed.chars().take(TEACHING_MAX_LEN).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefs_roundtrip_and_clamp() {
        let store = AgentStore::from_memory().unwrap();
        let prefs = store
            .set_prefs(&AgentPrefs {
                enabled: false,
                max_steps: 9,
                prefer_fast: true,
                preferred_tools: vec!["summarize".into(), "tasks".into()],
                disabled_tools: vec!["flashcards".into()],
            })
            .unwrap();
        assert!(!prefs.enabled);
        assert_eq!(prefs.max_steps, 3);
        assert!(prefs.prefer_fast);
        let loaded = store.get_prefs().unwrap();
        assert_eq!(loaded, prefs);
    }

    #[test]
    fn teachings_add_list_clear() {
        let store = AgentStore::from_memory().unwrap();
        store.add_teaching("Prefer Slovak answers").unwrap();
        store.add_teaching("prefer slovak answers").unwrap(); // dedupe
        let list = store.list_teachings().unwrap();
        assert_eq!(list.len(), 1);
        store.clear_teachings().unwrap();
        assert!(store.list_teachings().unwrap().is_empty());
    }

    #[test]
    fn runs_append_and_list() {
        let store = AgentStore::from_memory().unwrap();
        store
            .append_run("document", Some("doc-1"), "Summarize", Some("[\"summarize\"]"), Some("ok"))
            .unwrap();
        let runs = store.list_runs(10).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].goal, "Summarize");
    }
}
