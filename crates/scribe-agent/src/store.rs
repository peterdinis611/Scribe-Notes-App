use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::AgentDb;
use crate::roles::{agent_id_for_topic, normalize_agent_id, AGENT_ROLE_IDS, DEFAULT_AGENT_ID};

pub const DEFAULT_MAX_STEPS: i32 = 3;
pub const TEACHINGS_MAX: usize = 24;
pub const TEACHING_MAX_LEN: usize = 280;
pub const RUNS_KEEP: usize = 200;
pub const RUNS_KEEP_PER_AGENT: usize = 80;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentDigestSchedule {
    pub enabled: bool,
    /// Local wall-clock `HH:mm`
    pub time_local: String,
    /// `day` | `week`
    pub period: String,
    /// 0=Sun … 6=Sat when period is week
    pub weekday: i32,
    /// Last successful auto-run date `YYYY-MM-DD`
    pub last_run_date: String,
}

impl Default for AgentDigestSchedule {
    fn default() -> Self {
        Self {
            enabled: false,
            time_local: "08:00".into(),
            period: "day".into(),
            weekday: 1,
            last_run_date: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CustomAgentRecipe {
    pub id: String,
    pub label: String,
    pub tools: Vec<String>,
    #[serde(default)]
    pub document_preferred: bool,
    #[serde(default)]
    pub role_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentPrefs {
    pub enabled: bool,
    pub max_steps: i32,
    pub prefer_fast: bool,
    pub preferred_tools: Vec<String>,
    pub disabled_tools: Vec<String>,
    #[serde(default)]
    pub digest_schedule: AgentDigestSchedule,
    #[serde(default)]
    pub custom_recipes: Vec<CustomAgentRecipe>,
    /// Opaque FE-owned fields (budget, quietHours, pinnedFacts, episodes, …).
    #[serde(default)]
    pub extras: serde_json::Value,
}

impl Default for AgentPrefs {
    fn default() -> Self {
        Self {
            enabled: true,
            max_steps: DEFAULT_MAX_STEPS,
            prefer_fast: false,
            preferred_tools: Vec::new(),
            disabled_tools: Vec::new(),
            digest_schedule: AgentDigestSchedule::default(),
            custom_recipes: Vec::new(),
            extras: serde_json::json!({}),
        }
    }
}

pub const CUSTOM_RECIPES_MAX: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRoleState {
    pub agent_id: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentTeaching {
    pub id: String,
    pub text: String,
    pub created_at: i64,
    /// `general` standing prefs or `grammar` spelling/style rules.
    #[serde(default = "default_teaching_topic")]
    pub topic: String,
    /// Specialist partition (`general`, `proofreader`, …).
    #[serde(default = "default_agent_id")]
    pub agent_id: String,
}

fn default_teaching_topic() -> String {
    "general".into()
}

fn default_agent_id() -> String {
    DEFAULT_AGENT_ID.into()
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
    #[serde(default = "default_agent_id")]
    pub agent_id: String,
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
                "SELECT enabled, max_steps, prefer_fast, preferred_tools_json, disabled_tools_json, \
                 COALESCE(digest_schedule_json, '{}'), COALESCE(custom_recipes_json, '[]'), \
                 COALESCE(extras_json, '{}') \
                 FROM agent_prefs WHERE id = 1",
                [],
                |row| {
                    let preferred_raw: String = row.get(3)?;
                    let disabled_raw: String = row.get(4)?;
                    let digest_raw: String = row.get(5)?;
                    let recipes_raw: String = row.get(6)?;
                    let extras_raw: String = row.get(7)?;
                    Ok(AgentPrefs {
                        enabled: row.get::<_, i64>(0)? != 0,
                        max_steps: clamp_steps(row.get(1)?),
                        prefer_fast: row.get::<_, i64>(2)? != 0,
                        preferred_tools: parse_string_list(&preferred_raw),
                        disabled_tools: parse_string_list(&disabled_raw),
                        digest_schedule: parse_digest_schedule(&digest_raw),
                        custom_recipes: parse_custom_recipes(&recipes_raw),
                        extras: parse_extras(&extras_raw),
                    })
                },
            )
            .map_err(|e| e.to_string())
    }

    pub fn set_prefs(&self, prefs: &AgentPrefs) -> Result<AgentPrefs, String> {
        let normalized = normalize_prefs(prefs);
        let preferred = serde_json::to_string(&normalized.preferred_tools).map_err(|e| e.to_string())?;
        let disabled = serde_json::to_string(&normalized.disabled_tools).map_err(|e| e.to_string())?;
        let digest = serde_json::to_string(&normalized.digest_schedule).map_err(|e| e.to_string())?;
        let recipes = serde_json::to_string(&normalized.custom_recipes).map_err(|e| e.to_string())?;
        let extras = serde_json::to_string(&normalized.extras).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now().timestamp();
        self.db
            .conn
            .execute(
                "UPDATE agent_prefs SET enabled = ?1, max_steps = ?2, prefer_fast = ?3, \
                 preferred_tools_json = ?4, disabled_tools_json = ?5, updated_at = ?6, \
                 digest_schedule_json = ?7, custom_recipes_json = ?8, extras_json = ?9 \
                 WHERE id = 1",
                params![
                    if normalized.enabled { 1 } else { 0 },
                    normalized.max_steps,
                    if normalized.prefer_fast { 1 } else { 0 },
                    preferred,
                    disabled,
                    now,
                    digest,
                    recipes,
                    extras,
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(normalized)
    }

    /// Feedback tool sets from recent successful runs (for JEPA boost).
    pub fn recent_successful_tool_sets(&self, limit: usize) -> Result<Vec<Vec<String>>, String> {
        let rows = self.list_runs(limit.max(1).min(40), None)?;
        let mut out = Vec::new();
        for run in rows {
            let Some(raw) = run.steps_json.as_deref() else {
                continue;
            };
            let Ok(steps) = serde_json::from_str::<Vec<serde_json::Value>>(raw) else {
                continue;
            };
            let tools: Vec<String> = steps
                .iter()
                .filter(|step| {
                    step.get("status")
                        .and_then(|value| value.as_str())
                        .unwrap_or("ok")
                        == "ok"
                })
                .filter_map(|step| {
                    step.get("tool")
                        .and_then(|value| value.as_str())
                        .map(|tool| tool.trim().to_string())
                })
                .filter(|tool| !tool.is_empty())
                .collect();
            if !tools.is_empty() {
                out.push(tools);
            }
            if out.len() >= 24 {
                break;
            }
        }
        Ok(out)
    }

    pub fn list_role_states(&self) -> Result<Vec<AgentRoleState>, String> {
        let mut stmt = self
            .db
            .conn
            .prepare("SELECT agent_id, enabled FROM agent_role_state ORDER BY agent_id ASC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(AgentRoleState {
                    agent_id: row.get(0)?,
                    enabled: row.get::<_, i64>(1)? != 0,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut states = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        // Ensure every known role is present.
        for role in AGENT_ROLE_IDS {
            if !states.iter().any(|item| item.agent_id == *role) {
                states.push(AgentRoleState {
                    agent_id: (*role).into(),
                    enabled: true,
                });
            }
        }
        states.sort_by(|a, b| a.agent_id.cmp(&b.agent_id));
        Ok(states)
    }

    pub fn set_role_states(&self, states: &[AgentRoleState]) -> Result<Vec<AgentRoleState>, String> {
        let now = chrono::Utc::now().timestamp();
        for state in states {
            let agent_id = normalize_agent_id(Some(&state.agent_id));
            self.db
                .conn
                .execute(
                    "INSERT INTO agent_role_state (agent_id, enabled, updated_at) VALUES (?1, ?2, ?3) \
                     ON CONFLICT(agent_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at",
                    params![agent_id, if state.enabled { 1 } else { 0 }, now],
                )
                .map_err(|e| e.to_string())?;
        }
        self.list_role_states()
    }

    /// List teachings. When `agent_id` is set, return that role's rows plus shared `general`
    /// (unless the requested role is already `general`).
    pub fn list_teachings(&self, agent_id: Option<&str>) -> Result<Vec<AgentTeaching>, String> {
        match agent_id.map(|id| normalize_agent_id(Some(id))) {
            None => self.query_teachings_all(),
            Some(role) if role == "general" => self.query_teachings_general(),
            Some(role) => self.query_teachings_role(&role),
        }
    }

    fn query_teachings_all(&self) -> Result<Vec<AgentTeaching>, String> {
        let limit = (TEACHINGS_MAX * AGENT_ROLE_IDS.len()) as i64;
        let mut stmt = self
            .db
            .conn
            .prepare(
                "SELECT id, text, created_at, COALESCE(topic, 'general'), COALESCE(agent_id, 'general') \
                 FROM agent_teachings ORDER BY created_at DESC, id DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![limit], map_teaching_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    fn query_teachings_general(&self) -> Result<Vec<AgentTeaching>, String> {
        let mut stmt = self
            .db
            .conn
            .prepare(
                "SELECT id, text, created_at, COALESCE(topic, 'general'), COALESCE(agent_id, 'general') \
                 FROM agent_teachings WHERE COALESCE(agent_id, 'general') = 'general' \
                 ORDER BY created_at DESC, id DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![TEACHINGS_MAX as i64], map_teaching_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    fn query_teachings_role(&self, role: &str) -> Result<Vec<AgentTeaching>, String> {
        let mut stmt = self
            .db
            .conn
            .prepare(
                "SELECT id, text, created_at, COALESCE(topic, 'general'), COALESCE(agent_id, 'general') \
                 FROM agent_teachings \
                 WHERE COALESCE(agent_id, 'general') IN (?1, 'general') \
                 ORDER BY created_at DESC, id DESC LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![role, (TEACHINGS_MAX * 2) as i64], map_teaching_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn add_teaching(
        &self,
        text: &str,
        topic: Option<&str>,
        agent_id: Option<&str>,
    ) -> Result<AgentTeaching, String> {
        let text = normalize_teaching_text(text).ok_or_else(|| "teaching text is required".to_string())?;
        let topic = crate::grammar::normalize_topic(topic.unwrap_or("general"));
        let agent_id = match agent_id {
            Some(raw) => normalize_agent_id(Some(raw)),
            None => agent_id_for_topic(&topic),
        };

        // Dedupe case-insensitive within the same agent partition.
        let existing: Option<(String, String, String)> = self
            .db
            .conn
            .query_row(
                "SELECT id, COALESCE(topic, 'general'), COALESCE(agent_id, 'general') FROM agent_teachings \
                 WHERE lower(text) = lower(?1) AND COALESCE(agent_id, 'general') = ?2 LIMIT 1",
                params![text, agent_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .ok();
        if let Some((id, existing_topic, existing_agent)) = existing {
            let created_at: i64 = self
                .db
                .conn
                .query_row(
                    "SELECT created_at FROM agent_teachings WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            // Upgrade topic when re-teaching the same text as grammar.
            if topic == "grammar" && existing_topic != "grammar" {
                let _ = self.db.conn.execute(
                    "UPDATE agent_teachings SET topic = ?1 WHERE id = ?2",
                    params![topic, id],
                );
            }
            return Ok(AgentTeaching {
                id,
                text,
                created_at,
                topic: if topic == "grammar" {
                    "grammar".into()
                } else {
                    crate::grammar::normalize_topic(&existing_topic)
                },
                agent_id: existing_agent,
            });
        }

        let teaching = AgentTeaching {
            id: Uuid::new_v4().to_string(),
            text,
            created_at: chrono::Utc::now().timestamp(),
            topic,
            agent_id: agent_id.clone(),
        };
        self.db
            .conn
            .execute(
                "INSERT INTO agent_teachings (id, text, created_at, topic, agent_id) \
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    teaching.id,
                    teaching.text,
                    teaching.created_at,
                    teaching.topic,
                    teaching.agent_id
                ],
            )
            .map_err(|e| e.to_string())?;

        // Cap per-agent partition size.
        self.db
            .conn
            .execute(
                "DELETE FROM agent_teachings WHERE COALESCE(agent_id, 'general') = ?1 AND id NOT IN (
                    SELECT id FROM agent_teachings WHERE COALESCE(agent_id, 'general') = ?1 \
                    ORDER BY created_at DESC, id DESC LIMIT ?2
                 )",
                params![agent_id, TEACHINGS_MAX as i64],
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

    pub fn clear_teachings(&self, agent_id: Option<&str>) -> Result<u64, String> {
        let deleted = if let Some(raw) = agent_id {
            let agent_id = normalize_agent_id(Some(raw));
            self.db
                .conn
                .execute(
                    "DELETE FROM agent_teachings WHERE COALESCE(agent_id, 'general') = ?1",
                    params![agent_id],
                )
                .map_err(|e| e.to_string())?
        } else {
            self.db
                .conn
                .execute("DELETE FROM agent_teachings", [])
                .map_err(|e| e.to_string())?
        };
        Ok(deleted as u64)
    }

    pub fn append_run(
        &self,
        scope: &str,
        document_id: Option<&str>,
        goal: &str,
        steps_json: Option<&str>,
        answer: Option<&str>,
        agent_id: Option<&str>,
    ) -> Result<AgentRunRecord, String> {
        let goal = goal.trim();
        if goal.is_empty() {
            return Err("goal is required".to_string());
        }
        let scope = scope.trim().to_lowercase();
        if scope != "library" && scope != "document" {
            return Err("scope must be library or document".to_string());
        }
        let agent_id = normalize_agent_id(agent_id);
        let record = AgentRunRecord {
            id: Uuid::new_v4().to_string(),
            scope,
            document_id: document_id.map(str::to_string).filter(|value| !value.is_empty()),
            goal: goal.to_string(),
            steps_json: steps_json.map(str::to_string),
            answer: answer.map(str::to_string),
            created_at: chrono::Utc::now().timestamp(),
            agent_id: agent_id.clone(),
        };
        self.db
            .conn
            .execute(
                "INSERT INTO agent_runs \
                 (id, scope, document_id, goal, steps_json, answer, created_at, agent_id) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    record.id,
                    record.scope,
                    record.document_id,
                    record.goal,
                    record.steps_json,
                    record.answer,
                    record.created_at,
                    record.agent_id,
                ],
            )
            .map_err(|e| e.to_string())?;

        // Cap per-agent, then soft global cap.
        self.db
            .conn
            .execute(
                "DELETE FROM agent_runs WHERE COALESCE(agent_id, 'general') = ?1 AND id NOT IN (
                    SELECT id FROM agent_runs WHERE COALESCE(agent_id, 'general') = ?1 \
                    ORDER BY created_at DESC, id DESC LIMIT ?2
                 )",
                params![agent_id, RUNS_KEEP_PER_AGENT as i64],
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

    pub fn list_runs(
        &self,
        limit: usize,
        agent_id: Option<&str>,
    ) -> Result<Vec<AgentRunRecord>, String> {
        let limit = limit.clamp(1, RUNS_KEEP) as i64;
        if let Some(raw) = agent_id {
            let agent_id = normalize_agent_id(Some(raw));
            let mut stmt = self
                .db
                .conn
                .prepare(
                    "SELECT id, scope, document_id, goal, steps_json, answer, created_at, \
                     COALESCE(agent_id, 'general') \
                     FROM agent_runs WHERE COALESCE(agent_id, 'general') = ?1 \
                     ORDER BY created_at DESC, id DESC LIMIT ?2",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![agent_id, limit], map_run_row)
                .map_err(|e| e.to_string())?;
            return rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string());
        }

        let mut stmt = self
            .db
            .conn
            .prepare(
                "SELECT id, scope, document_id, goal, steps_json, answer, created_at, \
                 COALESCE(agent_id, 'general') \
                 FROM agent_runs ORDER BY created_at DESC, id DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![limit], map_run_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn send_handoff(
        &self,
        from_agent_id: &str,
        to_agent_id: &str,
        summary: &str,
        document_id: Option<&str>,
        payload_json: Option<&str>,
    ) -> Result<crate::handoffs::AgentHandoff, String> {
        crate::handoffs::insert_handoff(
            &self.db.conn,
            from_agent_id,
            to_agent_id,
            summary,
            document_id,
            payload_json,
        )
    }

    pub fn list_handoff_inbox(
        &self,
        to_agent_id: &str,
        status: Option<&str>,
        limit: usize,
    ) -> Result<Vec<crate::handoffs::AgentHandoff>, String> {
        crate::handoffs::list_inbox(&self.db.conn, to_agent_id, status, limit)
    }

    pub fn set_handoff_status(
        &self,
        id: &str,
        status: &str,
    ) -> Result<Option<crate::handoffs::AgentHandoff>, String> {
        crate::handoffs::set_status(&self.db.conn, id, status)
    }
}

fn map_teaching_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentTeaching> {
    Ok(AgentTeaching {
        id: row.get(0)?,
        text: row.get(1)?,
        created_at: row.get(2)?,
        topic: crate::grammar::normalize_topic(row.get::<_, String>(3)?.as_str()),
        agent_id: normalize_agent_id(Some(row.get::<_, String>(4)?.as_str())),
    })
}

fn map_run_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentRunRecord> {
    Ok(AgentRunRecord {
        id: row.get(0)?,
        scope: row.get(1)?,
        document_id: row.get(2)?,
        goal: row.get(3)?,
        steps_json: row.get(4)?,
        answer: row.get(5)?,
        created_at: row.get(6)?,
        agent_id: normalize_agent_id(Some(row.get::<_, String>(7)?.as_str())),
    })
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

fn normalize_time_local(raw: &str) -> String {
    let trimmed = raw.trim();
    let Some((h, m)) = trimmed.split_once(':') else {
        return "08:00".into();
    };
    let hour = h.parse::<i32>().unwrap_or(8).clamp(0, 23);
    let minute = m.parse::<i32>().unwrap_or(0).clamp(0, 59);
    format!("{hour:02}:{minute:02}")
}

fn parse_digest_schedule(raw: &str) -> AgentDigestSchedule {
    let Ok(value) = serde_json::from_str::<AgentDigestSchedule>(raw) else {
        return AgentDigestSchedule::default();
    };
    AgentDigestSchedule {
        enabled: value.enabled,
        time_local: normalize_time_local(&value.time_local),
        period: if value.period.eq_ignore_ascii_case("week") {
            "week".into()
        } else {
            "day".into()
        },
        weekday: value.weekday.clamp(0, 6),
        last_run_date: value.last_run_date.chars().take(10).collect(),
    }
}

fn parse_custom_recipes(raw: &str) -> Vec<CustomAgentRecipe> {
    let Ok(items) = serde_json::from_str::<Vec<CustomAgentRecipe>>(raw) else {
        return Vec::new();
    };
    items
        .into_iter()
        .filter_map(|item| {
            let label = item.label.trim().to_string();
            let tools: Vec<String> = item
                .tools
                .into_iter()
                .map(|tool| tool.trim().to_string())
                .filter(|tool| !tool.is_empty())
                .take(3)
                .collect();
            if label.len() < 2 || tools.is_empty() {
                return None;
            }
            Some(CustomAgentRecipe {
                id: item.id.chars().take(64).collect(),
                label: label.chars().take(80).collect(),
                tools,
                document_preferred: item.document_preferred,
                role_id: item.role_id.and_then(|role| {
                    let normalized = normalize_agent_id(Some(&role));
                    if AGENT_ROLE_IDS.iter().any(|known| *known == normalized) {
                        Some(normalized)
                    } else {
                        None
                    }
                }),
            })
        })
        .take(CUSTOM_RECIPES_MAX)
        .collect()
}

fn parse_extras(raw: &str) -> serde_json::Value {
    serde_json::from_str(raw).unwrap_or_else(|_| serde_json::json!({}))
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
        digest_schedule: parse_digest_schedule(
            &serde_json::to_string(&prefs.digest_schedule).unwrap_or_else(|_| "{}".into()),
        ),
        custom_recipes: parse_custom_recipes(
            &serde_json::to_string(&prefs.custom_recipes).unwrap_or_else(|_| "[]".into()),
        ),
        extras: if prefs.extras.is_null() {
            serde_json::json!({})
        } else {
            prefs.extras.clone()
        },
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
                ..AgentPrefs::default()
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
        store.add_teaching("Prefer Slovak answers", None, None).unwrap();
        store
            .add_teaching("prefer slovak answers", None, None)
            .unwrap(); // dedupe
        let list = store.list_teachings(None).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].topic, "general");
        assert_eq!(list[0].agent_id, "general");
        store.clear_teachings(None).unwrap();
        assert!(store.list_teachings(None).unwrap().is_empty());
    }

    #[test]
    fn teachings_grammar_topic_maps_to_proofreader() {
        let store = AgentStore::from_memory().unwrap();
        store
            .add_teaching("Prefer -ise endings", Some("grammar"), None)
            .unwrap();
        let list = store.list_teachings(Some("proofreader")).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].topic, "grammar");
        assert_eq!(list[0].agent_id, "proofreader");
    }

    #[test]
    fn teachings_are_partitioned_by_agent() {
        let store = AgentStore::from_memory().unwrap();
        store
            .add_teaching("Shared voice", None, Some("general"))
            .unwrap();
        store
            .add_teaching("Cite sources", None, Some("librarian"))
            .unwrap();
        store
            .add_teaching("Action items only", None, Some("meeting"))
            .unwrap();

        let librarian = store.list_teachings(Some("librarian")).unwrap();
        assert!(librarian.iter().any(|t| t.text == "Cite sources"));
        assert!(librarian.iter().any(|t| t.text == "Shared voice"));
        assert!(!librarian.iter().any(|t| t.text == "Action items only"));

        let meeting = store.list_teachings(Some("meeting")).unwrap();
        assert!(meeting.iter().any(|t| t.text == "Action items only"));
        assert!(!meeting.iter().any(|t| t.text == "Cite sources"));
    }

    #[test]
    fn runs_append_and_list_scoped() {
        let store = AgentStore::from_memory().unwrap();
        store
            .append_run(
                "document",
                Some("doc-1"),
                "Summarize",
                Some("[\"summarize\"]"),
                Some("ok"),
                Some("study"),
            )
            .unwrap();
        store
            .append_run(
                "library",
                None,
                "Find dupes",
                None,
                Some("none"),
                Some("organizer"),
            )
            .unwrap();
        let study = store.list_runs(10, Some("study")).unwrap();
        assert_eq!(study.len(), 1);
        assert_eq!(study[0].goal, "Summarize");
        assert_eq!(study[0].agent_id, "study");
        let all = store.list_runs(10, None).unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn prefs_digest_and_recipes_roundtrip() {
        let store = AgentStore::from_memory().unwrap();
        let saved = store
            .set_prefs(&AgentPrefs {
                enabled: true,
                max_steps: 2,
                prefer_fast: true,
                preferred_tools: vec!["summarize".into()],
                disabled_tools: vec![],
                digest_schedule: AgentDigestSchedule {
                    enabled: true,
                    time_local: "9:5".into(),
                    period: "week".into(),
                    weekday: 2,
                    last_run_date: "2026-10-09".into(),
                },
                custom_recipes: vec![CustomAgentRecipe {
                    id: "c1".into(),
                    label: "Wrap".into(),
                    tools: vec!["meeting".into(), "tasks".into()],
                    document_preferred: true,
                    role_id: Some("meeting".into()),
                }],
                extras: serde_json::json!({ "quietHours": true, "dailyRunBudget": 40 }),
            })
            .unwrap();
        assert_eq!(saved.digest_schedule.time_local, "09:05");
        assert_eq!(saved.digest_schedule.period, "week");
        assert_eq!(saved.custom_recipes.len(), 1);
        assert_eq!(saved.custom_recipes[0].tools, vec!["meeting", "tasks"]);
        assert_eq!(saved.extras["quietHours"], true);

        let loaded = store.get_prefs().unwrap();
        assert_eq!(loaded.digest_schedule.time_local, "09:05");
        assert_eq!(loaded.custom_recipes[0].label, "Wrap");
        assert_eq!(loaded.extras["dailyRunBudget"], 40);
    }

    #[test]
    fn role_states_roundtrip() {
        let store = AgentStore::from_memory().unwrap();
        let updated = store
            .set_role_states(&[AgentRoleState {
                agent_id: "meeting".into(),
                enabled: false,
            }])
            .unwrap();
        assert!(updated
            .iter()
            .any(|item| item.agent_id == "meeting" && !item.enabled));
    }

    #[test]
    fn handoffs_send_inbox_and_ack() {
        let store = AgentStore::from_memory().unwrap();
        let sent = store
            .send_handoff(
                "meeting",
                "organizer",
                "Three action items from standup",
                Some("doc-1"),
                Some(r#"{"tools":["tasks"]}"#),
            )
            .unwrap();
        assert_eq!(sent.from_agent_id, "meeting");
        assert_eq!(sent.to_agent_id, "organizer");
        assert_eq!(sent.status, "pending");

        let inbox = store
            .list_handoff_inbox("organizer", Some("pending"), 10)
            .unwrap();
        assert_eq!(inbox.len(), 1);
        assert!(store
            .list_handoff_inbox("meeting", Some("pending"), 10)
            .unwrap()
            .is_empty());

        let acked = store
            .set_handoff_status(&sent.id, "acknowledged")
            .unwrap()
            .unwrap();
        assert_eq!(acked.status, "acknowledged");
        assert!(store
            .list_handoff_inbox("organizer", Some("pending"), 10)
            .unwrap()
            .is_empty());
    }
}
