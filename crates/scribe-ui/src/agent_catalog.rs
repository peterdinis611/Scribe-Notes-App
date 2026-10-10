//! Agent role + recipe id catalogs (definitions / gating live partly in FE).

use serde::{Deserialize, Serialize};

pub const AGENT_ROLE_IDS: &[&str] = &[
    "general",
    "proofreader",
    "librarian",
    "meeting",
    "study",
    "organizer",
];

pub const AGENT_RECIPE_IDS: &[&str] = &[
    "daily_digest",
    "weekly_review",
    "meeting_wrap",
    "study_pass",
    "cleanup",
    "privacy_pass",
    "polish",
    "deep_read",
    "files_digest",
    "note_to_template",
    "spellcheck",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecipeDef {
    pub id: String,
    pub label_key: String,
    pub tools: Vec<String>,
    #[serde(default)]
    pub document_preferred: bool,
}

pub fn agent_role_ids() -> Vec<String> {
    AGENT_ROLE_IDS.iter().map(|s| (*s).to_string()).collect()
}

pub fn agent_recipe_ids() -> Vec<String> {
    AGENT_RECIPE_IDS.iter().map(|s| (*s).to_string()).collect()
}

pub fn agent_recipes() -> Vec<AgentRecipeDef> {
    vec![
        recipe("daily_digest", "agent.recipes.dailyDigest", &["brief"], false),
        recipe("weekly_review", "agent.recipes.weeklyReview", &["library_report", "terminology_library", "dates"], false),
        recipe("meeting_wrap", "agent.recipes.meetingWrap", &["meeting", "decisions", "open_loops", "rank_tasks"], true),
        recipe("note_to_template", "agent.recipes.noteToTemplate", &["template_hints", "outline", "save_template"], true),
        recipe("study_pass", "agent.recipes.studyPass", &["outline", "reading_plan", "quiz"], true),
        recipe("deep_read", "agent.recipes.deepRead", &["section_summaries", "tone", "takeaways", "flashcards"], true),
        recipe("files_digest", "agent.recipes.filesDigest", &["files_answer"], false),
        recipe("cleanup", "agent.recipes.cleanup", &["duplicates", "title", "organize"], false),
        recipe("privacy_pass", "agent.recipes.privacyPass", &["pii", "duplicates", "organize"], false),
        recipe("spellcheck", "agent.recipes.spellcheck", &["spellcheck"], true),
        recipe("polish", "agent.recipes.polish", &["spellcheck", "grammar", "tone"], true),
    ]
}

fn recipe(id: &str, label_key: &str, tools: &[&str], document_preferred: bool) -> AgentRecipeDef {
    AgentRecipeDef {
        id: id.into(),
        label_key: label_key.into(),
        tools: tools.iter().map(|t| (*t).to_string()).collect(),
        document_preferred,
    }
}

pub fn is_agent_role_id(value: &str) -> bool {
    AGENT_ROLE_IDS.contains(&value)
}

pub fn is_agent_recipe_id(value: &str) -> bool {
    AGENT_RECIPE_IDS.contains(&value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalogs_non_empty() {
        assert_eq!(agent_role_ids().len(), 6);
        assert_eq!(agent_recipes().len(), 11);
    }
}
