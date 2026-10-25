//! Agent tool-list optimization — heavy tools, quiet hours, budget, preferred order.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const HEAVY_TOOLS: &[&str] = &[
    "flashcards",
    "style",
    "similar",
    "quiz",
    "revision",
    "duplicates",
    "citations",
    "meeting",
    "brief",
    "compare_notes",
    "files_answer",
    "glossary",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OptimizePrefs {
    pub max_steps: u32,
    pub prefer_fast: bool,
    pub preferred_tools: Vec<String>,
    pub disabled_tools: Vec<String>,
    pub quiet_hours: bool,
    /// When empty, do not filter by role tools.
    #[serde(default)]
    pub allowed_tools: Vec<String>,
}

pub fn is_heavy_agent_tool(tool: &str) -> bool {
    HEAVY_TOOLS.contains(&tool)
}

/// Quiet hours: 22:00–07:00 local.
pub fn is_quiet_hour_now(hour: u32) -> bool {
    hour >= 22 || hour < 7
}

pub fn can_run_agent_budget(daily_run_budget: i32, runs_today: i32) -> bool {
    if daily_run_budget <= 0 {
        return true;
    }
    runs_today < daily_run_budget
}

/// Reorder / filter a planned tool list using optimization prefs.
pub fn apply_agent_optimize(tools: &[String], prefs: &OptimizePrefs, hour: Option<u32>) -> Vec<String> {
    let disabled: HashSet<&str> = prefs.disabled_tools.iter().map(String::as_str).collect();
    let mut next: Vec<String> = tools
        .iter()
        .filter(|t| !disabled.contains(t.as_str()))
        .cloned()
        .collect();

    if !prefs.allowed_tools.is_empty() {
        let allowed: HashSet<&str> = prefs.allowed_tools.iter().map(String::as_str).collect();
        next.retain(|t| allowed.contains(t.as_str()));
    }

    let drop_heavy = prefs.prefer_fast
        || (prefs.quiet_hours && hour.map(is_quiet_hour_now).unwrap_or(false));
    if drop_heavy {
        let light: Vec<String> = next
            .iter()
            .filter(|t| !is_heavy_agent_tool(t))
            .cloned()
            .collect();
        if !light.is_empty() {
            next = light;
        }
    }

    let preferred: Vec<String> = prefs
        .preferred_tools
        .iter()
        .filter(|t| next.iter().any(|n| n == *t))
        .cloned()
        .collect();
    let rest: Vec<String> = next
        .into_iter()
        .filter(|t| !preferred.iter().any(|p| p == t))
        .collect();
    let mut ordered = preferred;
    ordered.extend(rest);

    let limit = prefs.max_steps.max(1) as usize;
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for tool in ordered {
        if !seen.insert(tool.clone()) {
            continue;
        }
        out.push(tool);
        if out.len() >= limit {
            break;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drops_heavy_when_prefer_fast() {
        let prefs = OptimizePrefs {
            max_steps: 3,
            prefer_fast: true,
            preferred_tools: vec![],
            disabled_tools: vec![],
            quiet_hours: false,
            allowed_tools: vec![],
        };
        let out = apply_agent_optimize(
            &["summarize".into(), "flashcards".into(), "tasks".into()],
            &prefs,
            None,
        );
        assert!(!out.contains(&"flashcards".into()));
        assert!(out.contains(&"summarize".into()));
    }

    #[test]
    fn budget_unlimited() {
        assert!(can_run_agent_budget(0, 999));
        assert!(!can_run_agent_budget(2, 2));
        assert!(can_run_agent_budget(2, 1));
    }
}
