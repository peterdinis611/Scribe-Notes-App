//! Inter-agent handoffs — structured inbox messages between specialists.

use regex::Regex;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use uuid::Uuid;

use crate::roles::{normalize_agent_id, AGENT_ROLE_IDS, DEFAULT_AGENT_ID};

pub const HANDOFFS_KEEP: usize = 120;
pub const HANDOFF_SUMMARY_MAX: usize = 600;

/// Default receiver when the goal does not name a target.
pub fn default_handoff_target(from_agent_id: &str) -> Option<&'static str> {
    match normalize_agent_id(Some(from_agent_id)).as_str() {
        "meeting" => Some("organizer"),
        "study" => Some("librarian"),
        "proofreader" => Some("general"),
        "organizer" => Some("meeting"),
        "librarian" => Some("general"),
        "developer" => Some("librarian"),
        "general" => Some("organizer"),
        _ => None,
    }
}

fn map_target_alias(raw: &str) -> Option<String> {
    let folded = raw.trim().to_ascii_lowercase();
    let mapped = normalize_agent_id(Some(&folded));
    // normalize_agent_id falls back to general for unknown — only accept known roles / aliases.
    if AGENT_ROLE_IDS.contains(&mapped.as_str()) {
        // Reject unknown tokens that wrongly became general unless explicitly general-like.
        if mapped == DEFAULT_AGENT_ID {
            let ok = matches!(
                folded.as_str(),
                "general" | "default" | "main"
            );
            if !ok && !AGENT_ROLE_IDS.contains(&folded.as_str()) {
                return None;
            }
        }
        return Some(mapped);
    }
    None
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedHandoffGoal {
    pub to_agent_id: String,
    pub summary: String,
}

fn handoff_patterns() -> &'static [Regex] {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        vec![
            Regex::new(
                r"(?iu)^(?:handoff|delegate|pass|send|tell|forward|pošli|posli|odovzdaj|predaj)\s+(?:to\s+|pre\s+)?([a-zA-ZáäčďéíľĺňóôŕšťúýžÁÄČĎÉÍĽĹŇÓÔŔŠŤÚÝŽ_]+)\s*(?:ovi|ovi:|:|\s+)\s*(.+)$",
            )
            .expect("handoff pattern"),
            Regex::new(r"(?u)^@([a-zA-Z_]+)\s+(.+)$").expect("at pattern"),
            Regex::new(r"(?iu)^(?:to|pre)\s+([a-zA-Z_]+)\s*[:-]\s*(.+)$").expect("to pattern"),
        ]
    })
}

fn strip_sk_suffix(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase();
    for suffix in ["ovi", "emu", "u", "a"] {
        if lower.len() > suffix.len() && lower.ends_with(suffix) {
            return raw[..raw.len() - suffix.len()].to_string();
        }
    }
    raw.to_string()
}

/// Extract `@organizer …`, `handoff to meeting: …`, `pošli proofreaderovi …`.
pub fn parse_handoff_goal(goal: &str, from_agent_id: &str) -> Option<ParsedHandoffGoal> {
    let trimmed = goal.trim();
    if trimmed.is_empty() {
        return None;
    }
    let from = normalize_agent_id(Some(from_agent_id));

    for pattern in handoff_patterns() {
        let Some(caps) = pattern.captures(trimmed) else {
            continue;
        };
        let mut raw_target = caps.get(1)?.as_str().trim().to_ascii_lowercase();
        raw_target = strip_sk_suffix(&raw_target);
        let summary = caps.get(2)?.as_str().trim();
        let Some(mapped) = map_target_alias(&raw_target) else {
            continue;
        };
        if summary.len() < 2 {
            continue;
        }
        if mapped == from {
            return None;
        }
        return Some(ParsedHandoffGoal {
            to_agent_id: mapped,
            summary: summary.chars().take(HANDOFF_SUMMARY_MAX).collect(),
        });
    }

    let fallback = default_handoff_target(&from)?;
    if fallback == from {
        return None;
    }
    let trigger = Regex::new(
        r"(?i)\b(handoff|delegate|pass|send|tell|forward|pošli|posli|odovzdaj|predaj|inbox)\b",
    )
    .ok()?;
    if !trigger.is_match(trimmed) {
        return None;
    }
    Some(ParsedHandoffGoal {
        to_agent_id: fallback.into(),
        summary: trimmed.chars().take(HANDOFF_SUMMARY_MAX).collect(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentHandoff {
    pub id: String,
    pub from_agent_id: String,
    pub to_agent_id: String,
    pub document_id: Option<String>,
    pub summary: String,
    pub payload_json: Option<String>,
    /// `pending` | `acknowledged` | `dismissed`
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn normalize_handoff_status(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "acknowledged" | "ack" | "done" | "read" => "acknowledged".into(),
        "dismissed" | "dismiss" | "ignore" | "cancel" => "dismissed".into(),
        _ => "pending".into(),
    }
}

pub fn normalize_summary(text: &str) -> Option<String> {
    let trimmed = text.trim().split_whitespace().collect::<Vec<_>>().join(" ");
    if trimmed.len() < 2 {
        return None;
    }
    Some(trimmed.chars().take(HANDOFF_SUMMARY_MAX).collect())
}

/// Standing inbox block for the receiving agent's memory.
pub fn inbox_preamble(handoffs: &[AgentHandoff]) -> Option<String> {
    let pending: Vec<&AgentHandoff> = handoffs
        .iter()
        .filter(|item| item.status == "pending")
        .take(6)
        .collect();
    if pending.is_empty() {
        return None;
    }
    let body = pending
        .iter()
        .map(|item| {
            let doc = item
                .document_id
                .as_deref()
                .filter(|value| !value.is_empty())
                .map(|id| format!(" [doc:{id}]"))
                .unwrap_or_default();
            format!("• From {}: {}{}", item.from_agent_id, item.summary, doc)
        })
        .collect::<Vec<_>>()
        .join("\n");
    Some(format!(
        "Pending handoffs from other local agents (use when relevant; do not invent extra tasks):\n{body}"
    ))
}

pub(crate) fn insert_handoff(
    conn: &rusqlite::Connection,
    from_agent_id: &str,
    to_agent_id: &str,
    summary: &str,
    document_id: Option<&str>,
    payload_json: Option<&str>,
) -> Result<AgentHandoff, String> {
    let from_agent_id = normalize_agent_id(Some(from_agent_id));
    let to_agent_id = normalize_agent_id(Some(to_agent_id));
    if from_agent_id == to_agent_id {
        return Err("handoff to and from agent must differ".into());
    }
    let summary = normalize_summary(summary).ok_or_else(|| "handoff summary is required".to_string())?;
    let now = chrono::Utc::now().timestamp();
    let record = AgentHandoff {
        id: Uuid::new_v4().to_string(),
        from_agent_id,
        to_agent_id,
        document_id: document_id.map(str::to_string).filter(|value| !value.is_empty()),
        summary,
        payload_json: payload_json.map(str::to_string).filter(|value| !value.trim().is_empty()),
        status: "pending".into(),
        created_at: now,
        updated_at: now,
    };
    conn.execute(
        "INSERT INTO agent_handoffs \
         (id, from_agent_id, to_agent_id, document_id, summary, payload_json, status, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            record.id,
            record.from_agent_id,
            record.to_agent_id,
            record.document_id,
            record.summary,
            record.payload_json,
            record.status,
            record.created_at,
            record.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM agent_handoffs WHERE id NOT IN (
            SELECT id FROM agent_handoffs ORDER BY created_at DESC, id DESC LIMIT ?1
         )",
        params![HANDOFFS_KEEP as i64],
    )
    .map_err(|e| e.to_string())?;

    Ok(record)
}

pub(crate) fn list_inbox(
    conn: &rusqlite::Connection,
    to_agent_id: &str,
    status: Option<&str>,
    limit: usize,
) -> Result<Vec<AgentHandoff>, String> {
    let to_agent_id = normalize_agent_id(Some(to_agent_id));
    let limit = limit.clamp(1, HANDOFFS_KEEP) as i64;
    let status = status.map(normalize_handoff_status);

    if let Some(status) = status {
        let mut stmt = conn
            .prepare(
                "SELECT id, from_agent_id, to_agent_id, document_id, summary, payload_json, status, \
                 created_at, updated_at \
                 FROM agent_handoffs \
                 WHERE to_agent_id = ?1 AND status = ?2 \
                 ORDER BY created_at DESC, id DESC LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![to_agent_id, status, limit], map_handoff_row)
            .map_err(|e| e.to_string())?;
        return rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string());
    }

    let mut stmt = conn
        .prepare(
            "SELECT id, from_agent_id, to_agent_id, document_id, summary, payload_json, status, \
             created_at, updated_at \
             FROM agent_handoffs \
             WHERE to_agent_id = ?1 \
             ORDER BY created_at DESC, id DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![to_agent_id, limit], map_handoff_row)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub(crate) fn set_status(
    conn: &rusqlite::Connection,
    id: &str,
    status: &str,
) -> Result<Option<AgentHandoff>, String> {
    let status = normalize_handoff_status(status);
    let now = chrono::Utc::now().timestamp();
    let updated = conn
        .execute(
            "UPDATE agent_handoffs SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, now, id],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Ok(None);
    }
    conn.query_row(
        "SELECT id, from_agent_id, to_agent_id, document_id, summary, payload_json, status, \
         created_at, updated_at FROM agent_handoffs WHERE id = ?1",
        params![id],
        map_handoff_row,
    )
    .map(Some)
    .map_err(|e| e.to_string())
}

fn map_handoff_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentHandoff> {
    Ok(AgentHandoff {
        id: row.get(0)?,
        from_agent_id: normalize_agent_id(Some(row.get::<_, String>(1)?.as_str())),
        to_agent_id: normalize_agent_id(Some(row.get::<_, String>(2)?.as_str())),
        document_id: row.get(3)?,
        summary: row.get(4)?,
        payload_json: row.get(5)?,
        status: normalize_handoff_status(&row.get::<_, String>(6)?),
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_aliases() {
        assert_eq!(normalize_handoff_status("ack"), "acknowledged");
        assert_eq!(normalize_handoff_status("ignore"), "dismissed");
        assert_eq!(normalize_handoff_status("pending"), "pending");
    }

    #[test]
    fn parses_explicit_handoff() {
        let parsed = parse_handoff_goal("Handoff to organizer: follow up todos", "meeting").unwrap();
        assert_eq!(parsed.to_agent_id, "organizer");
        assert!(parsed.summary.contains("follow up"));
    }

    #[test]
    fn preamble_lists_pending() {
        let handoffs = vec![AgentHandoff {
            id: "1".into(),
            from_agent_id: "meeting".into(),
            to_agent_id: "organizer".into(),
            document_id: Some("doc-1".into()),
            summary: "Three action items".into(),
            payload_json: None,
            status: "pending".into(),
            created_at: 1,
            updated_at: 1,
        }];
        let text = inbox_preamble(&handoffs).unwrap();
        assert!(text.contains("meeting"));
        assert!(text.contains("Three action items"));
    }
}
