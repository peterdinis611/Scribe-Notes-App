//! Agent plan phases — encode/decode followup chips + weak-answer heuristic.

use serde::{Deserialize, Serialize};
use serde_json::json;

pub const PHASE_PREFIX: &str = "phase:";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentPhaseWhen {
    Now,
    Next,
    Later,
}

impl AgentPhaseWhen {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Now => "now",
            Self::Next => "next",
            Self::Later => "later",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "now" => Some(Self::Now),
            "next" => Some(Self::Next),
            "later" => Some(Self::Later),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentPlanPhase {
    pub when: AgentPhaseWhen,
    pub goal: String,
    pub tools: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// Encode a next/later phase as a followup chip token.
pub fn encode_phase_followup(phase: &AgentPlanPhase) -> Option<String> {
    if phase.when == AgentPhaseWhen::Now || phase.tools.is_empty() {
        return None;
    }
    let tools: Vec<&str> = phase.tools.iter().take(4).map(String::as_str).collect();
    let mut payload = json!({
        "when": phase.when.as_str(),
        "goal": phase.goal.chars().take(160).collect::<String>(),
        "tools": tools,
    });
    if let Some(reason) = phase.reason.as_ref() {
        payload["reason"] = json!(reason.chars().take(80).collect::<String>());
    }
    let encoded = urlencoding_encode(&payload.to_string());
    Some(format!(
        "{PHASE_PREFIX}{}:{encoded}",
        phase.when.as_str()
    ))
}

pub fn is_phase_followup(token: &str) -> bool {
    token.starts_with(PHASE_PREFIX)
}

pub fn decode_phase_followup(token: &str) -> Option<AgentPlanPhase> {
    if !is_phase_followup(token) {
        return None;
    }
    let rest = &token[PHASE_PREFIX.len()..];
    let colon = rest.find(':')?;
    let when = AgentPhaseWhen::parse(&rest[..colon])?;
    if !matches!(when, AgentPhaseWhen::Next | AgentPhaseWhen::Later) {
        return None;
    }
    let body = urlencoding_decode(&rest[colon + 1..])?;
    let parsed: serde_json::Value = serde_json::from_str(&body).ok()?;
    let tools: Vec<String> = parsed
        .get("tools")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t.as_str().map(|s| s.trim().to_string()))
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();
    if tools.is_empty() {
        return None;
    }
    let goal = parsed
        .get("goal")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| tools.join(" + "));
    let reason = parsed
        .get("reason")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    Some(AgentPlanPhase {
        when,
        goal,
        tools,
        reason,
    })
}

/// True when a successful tool answer is empty or a soft "nothing found" stub.
pub fn is_weak_agent_answer(answer: Option<&str>) -> bool {
    let text = answer.unwrap_or("").trim();
    if text.is_empty() || text.len() < 12 {
        return true;
    }
    let lower = text.to_ascii_lowercase();
    lower.starts_with("no ")
        || lower.starts_with("none ")
        || lower.starts_with("nothing ")
        || lower.starts_with("nenájden")
        || lower.starts_with("nenajden")
        || lower.starts_with("žiadn")
        || lower.starts_with("ziadn")
}

pub fn phases_to_followups(phases: &[AgentPlanPhase]) -> Vec<String> {
    phases
        .iter()
        .filter(|p| p.when != AgentPhaseWhen::Now)
        .filter_map(encode_phase_followup)
        .collect()
}

pub fn normalize_plan_phases(
    raw: &serde_json::Value,
    fallback_tools: &[String],
    goal: &str,
) -> Vec<AgentPlanPhase> {
    let Some(arr) = raw.as_array() else {
        if fallback_tools.is_empty() {
            return Vec::new();
        }
        return vec![AgentPlanPhase {
            when: AgentPhaseWhen::Now,
            goal: goal.to_string(),
            tools: fallback_tools.to_vec(),
            reason: Some("Run immediately".into()),
        }];
    };
    if arr.is_empty() {
        if fallback_tools.is_empty() {
            return Vec::new();
        }
        return vec![AgentPlanPhase {
            when: AgentPhaseWhen::Now,
            goal: goal.to_string(),
            tools: fallback_tools.to_vec(),
            reason: Some("Run immediately".into()),
        }];
    }

    let mut out = Vec::new();
    for item in arr {
        let Some(obj) = item.as_object() else { continue };
        let when = obj
            .get("when")
            .and_then(|v| v.as_str())
            .and_then(AgentPhaseWhen::parse);
        let Some(when) = when else { continue };
        let tools: Vec<String> = obj
            .get("tools")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|t| t.as_str().map(|s| s.trim().to_string()))
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default();
        if tools.is_empty() {
            continue;
        }
        let goal = obj
            .get("goal")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| tools.join(" + "));
        let reason = obj
            .get("reason")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        out.push(AgentPlanPhase {
            when,
            goal,
            tools,
            reason,
        });
    }
    if !out.iter().any(|p| p.when == AgentPhaseWhen::Now) && !fallback_tools.is_empty() {
        out.insert(
            0,
            AgentPlanPhase {
                when: AgentPhaseWhen::Now,
                goal: goal.to_string(),
                tools: fallback_tools.to_vec(),
                reason: Some("Run immediately".into()),
            },
        );
    }
    out
}

pub fn now_tools_from_phases(phases: &[AgentPlanPhase], fallback: &[String]) -> Vec<String> {
    phases
        .iter()
        .find(|p| p.when == AgentPhaseWhen::Now)
        .map(|p| p.tools.clone())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| fallback.to_vec())
}

/// Minimal encodeURIComponent-compatible encoder for ASCII JSON payloads.
fn urlencoding_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~' | b'*'
            | b'\'' | b'(' | b')' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn urlencoding_decode(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let h = hex_nibble(bytes[i + 1])?;
                let l = hex_nibble(bytes[i + 2])?;
                out.push((h << 4) | l);
                i += 3;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}

fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_decode_roundtrip() {
        let phase = AgentPlanPhase {
            when: AgentPhaseWhen::Next,
            goal: "Prioritize tasks".into(),
            tools: vec!["rank_tasks".into(), "open_loops".into()],
            reason: Some("Suggested next".into()),
        };
        let token = encode_phase_followup(&phase).expect("token");
        assert!(token.starts_with("phase:next:"));
        let decoded = decode_phase_followup(&token).expect("decode");
        assert_eq!(decoded.when, AgentPhaseWhen::Next);
        assert_eq!(decoded.goal, "Prioritize tasks");
        assert_eq!(decoded.tools, vec!["rank_tasks", "open_loops"]);
    }

    #[test]
    fn weak_answers() {
        assert!(is_weak_agent_answer(Some("")));
        assert!(is_weak_agent_answer(Some("No commitments detected in this note.")));
        assert!(!is_weak_agent_answer(Some(
            "Here are three concrete next steps for the launch."
        )));
    }

    #[test]
    fn normalize_inserts_now() {
        let raw = serde_json::json!([
            {"when": "next", "goal": "Later", "tools": ["open_loops"]}
        ]);
        let phases = normalize_plan_phases(&raw, &["summarize".into()], "goal");
        assert_eq!(phases[0].when, AgentPhaseWhen::Now);
        assert_eq!(now_tools_from_phases(&phases, &[]), vec!["summarize"]);
    }
}
