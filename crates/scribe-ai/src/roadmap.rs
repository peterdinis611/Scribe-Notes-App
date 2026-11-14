//! Offline roadmap extraction from a note (phases / horizons / milestones).

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::OnceLock;

use crate::forward_plan::forward_plan;
use crate::section_summaries::section_summaries;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpRoadmapItem {
    pub text: String,
    #[serde(default)]
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpRoadmapPhase {
    pub id: String,
    pub title: String,
    /// now | next | later | milestone | phase
    #[serde(default)]
    pub horizon: String,
    pub order: i64,
    #[serde(default)]
    pub items: Vec<NlpRoadmapItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpRoadmap {
    #[serde(default)]
    pub phases: Vec<NlpRoadmapPhase>,
    #[serde(default)]
    pub count: i64,
    #[serde(default)]
    pub item_count: i64,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub strategy: String,
}

fn heading_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^(#{1,6})\s+(.+)$").expect("heading"))
}

fn bullet_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\s*(?:[-*•]|\d+[.)]|\[(?: |x|X)\])\s+(.+)$").expect("bullet"))
}

fn phase_title_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)^(roadmap|road\s*map|cesta|mapa|phases?|fázy|fazy|milestones?|míľniky|milniky|now|next|later|teraz|ďalej|dalej|neskôr|neskor|q[1-4]|h[12]|phase\s*\d+|fáza\s*\d+|faza\s*\d+|sprint\s*\d+|epics?)\b",
        )
        .expect("phase_title")
    })
}

fn horizon_for_title(title: &str) -> &'static str {
    let t = title.trim().to_ascii_lowercase();
    if matches!(t.as_str(), "now" | "teraz" | "today" | "dnes") {
        return "now";
    }
    if matches!(t.as_str(), "next" | "ďalej" | "dalej" | "soon" | "čoskoro" | "coskoro")
        || t.starts_with("next ")
        || t.starts_with("ďal")
        || t.starts_with("dal")
    {
        return "next";
    }
    if matches!(t.as_str(), "later" | "neskôr" | "neskor" | "someday" | "budúcnosť" | "buducnost")
        || t.starts_with("later")
        || t.starts_with("nesk")
    {
        return "later";
    }
    if t.contains("milestone") || t.contains("míľnik") || t.contains("milnik") {
        return "milestone";
    }
    "phase"
}

fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn push_item(items: &mut Vec<NlpRoadmapItem>, raw: &str, kind: &str, limit: usize) {
    if items.len() >= limit {
        return;
    }
    let cleaned = normalize(raw.trim());
    if cleaned.len() < 3 {
        return;
    }
    if items
        .iter()
        .any(|existing| existing.text.eq_ignore_ascii_case(&cleaned))
    {
        return;
    }
    items.push(NlpRoadmapItem {
        text: cleaned,
        kind: kind.to_string(),
    });
}

fn collect_bullets(body: &str, limit: usize) -> Vec<NlpRoadmapItem> {
    let mut items = Vec::new();
    for line in body.lines() {
        if let Some(caps) = bullet_re().captures(line) {
            if let Some(m) = caps.get(1) {
                push_item(&mut items, m.as_str(), "bullet", limit);
            }
            continue;
        }
        let trimmed = line.trim();
        if trimmed.len() >= 12 && !trimmed.starts_with('#') {
            // Keep short prose lines as soft items when there are few bullets.
            if items.len() < 2 {
                push_item(&mut items, trimmed, "note", limit);
            }
        }
    }
    items
}

fn phases_from_headings(text: &str, limit: usize) -> Vec<NlpRoadmapPhase> {
    let mut phases = Vec::new();
    let mut title = String::new();
    let mut body_lines: Vec<&str> = Vec::new();
    let mut order = 0_i64;

    let flush = |phases: &mut Vec<NlpRoadmapPhase>,
                 title: &str,
                 body_lines: &mut Vec<&str>,
                 order: &mut i64,
                 limit: usize| {
        if title.is_empty() {
            body_lines.clear();
            return;
        }
        if !phase_title_re().is_match(title) && *order == 0 && phases.is_empty() {
            // Skip intro unless it looks like a roadmap heading.
            body_lines.clear();
            return;
        }
        let items = collect_bullets(&body_lines.join("\n"), 12);
        if items.is_empty() && !phase_title_re().is_match(title) {
            body_lines.clear();
            return;
        }
        *order += 1;
        let horizon = horizon_for_title(title).to_string();
        phases.push(NlpRoadmapPhase {
            id: format!("phase-{}", *order),
            title: normalize(title),
            horizon,
            order: *order,
            items,
        });
        body_lines.clear();
        if phases.len() >= limit {
            return;
        }
    };

    for line in text.lines() {
        if phases.len() >= limit {
            break;
        }
        if let Some(caps) = heading_re().captures(line) {
            flush(&mut phases, &title, &mut body_lines, &mut order, limit);
            title = caps
                .get(2)
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_default();
            continue;
        }
        body_lines.push(line);
    }
    flush(&mut phases, &title, &mut body_lines, &mut order, limit);
    phases
}

fn phases_from_outline(text: &str, limit: usize) -> Vec<NlpRoadmapPhase> {
    let sections = section_summaries(text, limit, 2);
    let mut phases = Vec::new();
    for (index, section) in sections.sections.into_iter().enumerate() {
        if section.title.eq_ignore_ascii_case("Introduction") && section.char_count < 40 {
            continue;
        }
        let mut items = Vec::new();
        for bullet in section.bullets.iter().take(8) {
            push_item(&mut items, bullet, "summary", 8);
        }
        if items.is_empty() && !section.summary.is_empty() {
            push_item(&mut items, &section.summary, "summary", 8);
        }
        if items.is_empty() {
            continue;
        }
        let order = (index + 1) as i64;
        phases.push(NlpRoadmapPhase {
            id: format!("outline-{order}"),
            title: section.title,
            horizon: "phase".to_string(),
            order,
            items,
        });
        if phases.len() >= limit {
            break;
        }
    }
    phases
}

fn phases_from_forward_plan(text: &str, limit: usize) -> Vec<NlpRoadmapPhase> {
    let plan = forward_plan(text, 16);
    let mut phases = Vec::new();

    if !plan.next_steps.is_empty() {
        phases.push(NlpRoadmapPhase {
            id: "now".into(),
            title: "Now".into(),
            horizon: "now".into(),
            order: 1,
            items: plan
                .next_steps
                .into_iter()
                .take(8)
                .map(|item| NlpRoadmapItem {
                    text: item.text,
                    kind: item.kind,
                })
                .collect(),
        });
    }
    if !plan.agenda.is_empty() {
        phases.push(NlpRoadmapPhase {
            id: "next".into(),
            title: "Next".into(),
            horizon: "next".into(),
            order: 2,
            items: plan
                .agenda
                .into_iter()
                .take(8)
                .map(|item| NlpRoadmapItem {
                    text: item.text,
                    kind: item.kind,
                })
                .collect(),
        });
    }
    if !plan.upcoming.is_empty() {
        phases.push(NlpRoadmapPhase {
            id: "later".into(),
            title: "Later".into(),
            horizon: "later".into(),
            order: 3,
            items: plan
                .upcoming
                .into_iter()
                .take(8)
                .map(|item| NlpRoadmapItem {
                    text: item.text,
                    kind: item.kind,
                })
                .collect(),
        });
    }
    phases.truncate(limit);
    phases
}

/// Build a roadmap from document text (headings → outline → forward-plan buckets).
pub fn roadmap(text: &str, limit: usize) -> NlpRoadmap {
    let limit = limit.clamp(1, 16);
    let mut strategy = "empty";
    let mut phases = phases_from_headings(text, limit);
    if !phases.is_empty() {
        strategy = "headings";
    } else {
        phases = phases_from_outline(text, limit);
        if !phases.is_empty() {
            strategy = "outline";
        } else {
            phases = phases_from_forward_plan(text, limit);
            if !phases.is_empty() {
                strategy = "forward_plan";
            }
        }
    }

    let item_count = phases.iter().map(|p| p.items.len() as i64).sum();
    NlpRoadmap {
        count: phases.len() as i64,
        item_count,
        phases,
        source: "rust".to_string(),
        strategy: strategy.to_string(),
    }
}

pub fn roadmap_value(text: &str, limit: usize) -> Value {
    serde_json::to_value(roadmap(text, limit)).unwrap_or_else(|_| json!({}))
}

/// Markdown suitable for inserting into the note.
pub fn roadmap_to_markdown(plan: &NlpRoadmap) -> String {
    if plan.phases.is_empty() {
        return String::new();
    }
    let mut lines = Vec::new();
    lines.push("## Roadmap".to_string());
    lines.push(String::new());
    for phase in &plan.phases {
        lines.push(format!("### {}", phase.title));
        if phase.items.is_empty() {
            lines.push(format!("- _{}_", phase.horizon));
        } else {
            for item in &phase.items {
                lines.push(format!("- [ ] {}", item.text));
            }
        }
        lines.push(String::new());
    }
    lines.join("\n").trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_now_next_later_headings() {
        let text = r#"
# Product notes

## Now
- Ship logging bridge
- Fix audit CVE

## Next
- Roadmap from document
- Agent slash command

## Later
- Public API for roadmaps
"#;
        let plan = roadmap(text, 8);
        assert_eq!(plan.strategy, "headings");
        assert!(plan.count >= 3);
        assert!(plan.item_count >= 5);
        assert!(plan.phases.iter().any(|p| p.horizon == "now"));
        let md = roadmap_to_markdown(&plan);
        assert!(md.contains("## Roadmap"));
        assert!(md.contains("Ship logging bridge"));
    }

    #[test]
    fn falls_back_to_outline() {
        let text = r#"
# Spec

## Discovery
Research users and competitors carefully.

## Build
Implement the core editor pipeline.

## Launch
Ship beta to early adopters.
"#;
        let plan = roadmap(text, 8);
        assert!(plan.count >= 2, "strategy={}", plan.strategy);
    }

    #[test]
    fn empty_note_yields_empty_roadmap() {
        let plan = roadmap("hi", 4);
        assert_eq!(plan.count, 0);
        assert!(roadmap_to_markdown(&plan).is_empty());
    }
}
