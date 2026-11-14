//! Pure agent tool planning from intents + allowed tool ids (no DB).

use crate::chat_intent::match_agent_intents;

/// Map matched intent ids to preferred tools. Host filters by prefs / enablement.
pub fn plan_tools_from_question(
    question: &str,
    allowed_tools: &[String],
    limit: usize,
) -> Vec<String> {
    let limit = limit.clamp(1, 8);
    let intents = match_agent_intents(question);
    let mut out = Vec::new();
    for intent in intents {
        for tool in tools_for_intent(intent) {
            if allowed_tools.iter().any(|item| item == tool) && !out.iter().any(|item| item == tool)
            {
                out.push(tool.to_string());
            }
            if out.len() >= limit {
                return out;
            }
        }
    }
    // Soft fallback: first allowed research-ish tools.
    if out.is_empty() {
        for tool in ["library_search", "document_answer", "timeline", "tasks"] {
            if allowed_tools.iter().any(|item| item == tool) {
                out.push(tool.to_string());
            }
            if out.len() >= limit {
                break;
            }
        }
    }
    out
}

fn tools_for_intent(intent: &str) -> &'static [&'static str] {
    match intent {
        "summarize" | "summary" => &["summarize", "section_summaries", "document_answer"],
        "tasks" | "todo" => &["tasks", "task_rank", "open_loops"],
        "search" | "find" => &["library_search", "document_answer", "citation_pack"],
        "timeline" | "dates" => &["timeline", "dates", "forward_plan", "roadmap"],
        "roadmap" | "milestones" => &["roadmap", "forward_plan", "outline"],
        "rewrite" | "polish" => &["rewrite", "tone"],
        "research" => &["research_pack", "library_search", "citation_pack"],
        "meeting" => &["meeting_notes", "commitments", "tasks"],
        _ => &["library_search", "document_answer"],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plans_from_allowed_set() {
        let allowed = vec![
            "tasks".into(),
            "task_rank".into(),
            "library_search".into(),
        ];
        let plan = plan_tools_from_question("what tasks are open?", &allowed, 3);
        assert!(plan.iter().any(|tool| tool == "tasks" || tool == "task_rank"));
    }
}
