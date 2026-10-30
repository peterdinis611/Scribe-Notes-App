//! Agent role + recipe catalogs (canonical for FE + MCP).

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const AGENT_ROLE_IDS: &[&str] = &[
    "general",
    "proofreader",
    "librarian",
    "meeting",
    "study",
    "organizer",
    "developer",
    "researcher",
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
    "wiki_cleanup",
    "canvas_board",
    "files_learn",
    "files_to_library",
    "code_pass",
    "code_audit",
    "morning_brief",
    "polish_and_apply",
    "research_pass",
    "deep_research",
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRoleDef {
    pub id: String,
    pub label_key: String,
    pub hint_key: String,
    pub dock_label_key: String,
    pub dock_title_key: String,
    pub default_enabled: bool,
    pub panel: String,
    pub recipe_ids: Vec<String>,
    pub tools: Vec<String>,
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
        recipe(
            "weekly_review",
            "agent.recipes.weeklyReview",
            &["library_report", "terminology_library", "dates"],
            false,
        ),
        recipe(
            "meeting_wrap",
            "agent.recipes.meetingWrap",
            &["meeting", "decisions", "open_loops", "rank_tasks"],
            true,
        ),
        recipe(
            "note_to_template",
            "agent.recipes.noteToTemplate",
            &["template_hints", "outline", "save_template"],
            true,
        ),
        recipe(
            "study_pass",
            "agent.recipes.studyPass",
            &["outline", "reading_plan", "quiz"],
            true,
        ),
        recipe(
            "deep_read",
            "agent.recipes.deepRead",
            &["section_summaries", "tone", "takeaways", "flashcards"],
            true,
        ),
        recipe("files_digest", "agent.recipes.filesDigest", &["files_answer"], false),
        recipe("cleanup", "agent.recipes.cleanup", &["duplicates", "title", "organize"], false),
        recipe(
            "privacy_pass",
            "agent.recipes.privacyPass",
            &["pii", "duplicates", "organize"],
            false,
        ),
        recipe("spellcheck", "agent.recipes.spellcheck", &["spellcheck"], true),
        recipe("polish", "agent.recipes.polish", &["spellcheck", "grammar", "tone"], true),
        recipe(
            "wiki_cleanup",
            "agent.recipes.wikiCleanup",
            &["wiki_health", "wiki", "organize"],
            true,
        ),
        recipe(
            "canvas_board",
            "agent.recipes.canvasBoard",
            &["canvas_summarize", "canvas_to_note"],
            true,
        ),
        recipe(
            "files_learn",
            "agent.recipes.filesLearn",
            &["files_answer", "files_ingest"],
            false,
        ),
        recipe(
            "files_to_library",
            "agent.recipes.filesToLibrary",
            &["files_ingest", "brief", "organize"],
            false,
        ),
        recipe(
            "code_pass",
            "agent.recipes.codePass",
            &["code_brief", "explain", "outline", "keywords"],
            true,
        ),
        recipe(
            "code_audit",
            "agent.recipes.codeAudit",
            &["code_brief", "pii", "glossary"],
            true,
        ),
        recipe(
            "morning_brief",
            "agent.recipes.morningBrief",
            &["dates", "open_loops", "forward_plan"],
            true,
        ),
        recipe(
            "polish_and_apply",
            "agent.recipes.polishAndApply",
            &["grammar", "spellcheck", "rewrite"],
            true,
        ),
        recipe(
            "research_pass",
            "agent.recipes.researchPass",
            &["research_pack", "timeline"],
            true,
        ),
        recipe(
            "deep_research",
            "agent.recipes.deepResearch",
            &["research_pack", "citations", "similar", "timeline"],
            true,
        ),
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

fn role(
    id: &str,
    panel: &str,
    recipe_ids: &[&str],
    tools: &[&str],
) -> AgentRoleDef {
    AgentRoleDef {
        id: id.into(),
        label_key: format!("settings.agent.roles.{id}.label"),
        hint_key: format!("settings.agent.roles.{id}.hint"),
        dock_label_key: format!("agent.roles.{id}.dock"),
        dock_title_key: format!("agent.roles.{id}.dockTitle"),
        default_enabled: true,
        panel: panel.into(),
        recipe_ids: recipe_ids.iter().map(|s| (*s).to_string()).collect(),
        tools: tools.iter().map(|s| (*s).to_string()).collect(),
    }
}

pub fn agent_roles() -> Vec<AgentRoleDef> {
    vec![
        role(
            "general",
            "agent",
            &[],
            &[
                "library_answer",
                "document_answer",
                "summarize",
                "outline",
                "explain",
                "simplify",
                "rewrite",
                "brief",
                "tasks",
                "takeaways",
                "similar",
                "citations",
                "compare_notes",
                "contradictions",
                "note_pulse",
                "title",
                "tone",
                "continuation",
                "keywords",
                "translate",
                "export_snippet",
                "handoff",
            ],
        ),
        role(
            "proofreader",
            "spellcheck",
            &["spellcheck", "polish", "polish_and_apply"],
            &[
                "spellcheck",
                "grammar",
                "rewrite",
                "translate",
                "terminology",
                "terminology_library",
                "style",
                "tone",
                "handoff",
            ],
        ),
        role(
            "librarian",
            "agent",
            &[
                "daily_digest",
                "weekly_review",
                "files_digest",
                "files_learn",
                "files_to_library",
                "wiki_cleanup",
            ],
            &[
                "brief",
                "dates",
                "files_answer",
                "files_ingest",
                "tasks",
                "library_answer",
                "note_pulse",
                "library_report",
                "open_loops",
                "title",
                "wiki",
                "wiki_health",
                "organize",
                "similar",
                "duplicates",
                "citations",
                "canvas_summarize",
                "handoff",
            ],
        ),
        role(
            "meeting",
            "agent",
            &["meeting_wrap", "note_to_template"],
            &[
                "meeting",
                "tasks",
                "action_items",
                "decisions",
                "commitments",
                "forward_plan",
                "quotes",
                "mentions",
                "takeaways",
                "dates",
                "rank_tasks",
                "open_loops",
                "template_hints",
                "save_template",
                "outline",
                "handoff",
            ],
        ),
        role(
            "study",
            "agent",
            &["study_pass", "deep_read"],
            &[
                "outline",
                "glossary",
                "takeaways",
                "flashcards",
                "quiz",
                "section_summaries",
                "reading_plan",
                "tone",
                "revision",
                "explain",
                "simplify",
                "continuation",
                "handoff",
            ],
        ),
        role(
            "organizer",
            "agent",
            &["cleanup", "privacy_pass", "canvas_board", "morning_brief"],
            &[
                "organize",
                "wiki",
                "wiki_health",
                "duplicates",
                "pii",
                "similar",
                "terminology",
                "terminology_library",
                "mentions",
                "title",
                "template_hints",
                "open_loops",
                "forward_plan",
                "dates",
                "canvas_summarize",
                "canvas_to_note",
                "canvas_template",
                "keywords",
                "handoff",
            ],
        ),
        role(
            "developer",
            "agent",
            &["code_pass", "code_audit"],
            &[
                "code_brief",
                "explain",
                "outline",
                "keywords",
                "pii",
                "glossary",
                "files_answer",
                "files_ingest",
                "document_answer",
                "library_answer",
                "handoff",
            ],
        ),
        role(
            "researcher",
            "agent",
            &["deep_research", "research_pass"],
            &[
                "library_answer",
                "citations",
                "similar",
                "research_pack",
                "timeline",
                "translate",
                "compare_notes",
                "contradictions",
                "export_snippet",
                "handoff",
            ],
        ),
    ]
}

pub fn is_agent_role_id(value: &str) -> bool {
    AGENT_ROLE_IDS.contains(&value)
}

pub fn is_agent_recipe_id(value: &str) -> bool {
    AGENT_RECIPE_IDS.contains(&value)
}

pub fn get_agent_recipe(id: &str) -> Option<AgentRecipeDef> {
    agent_recipes().into_iter().find(|r| r.id == id)
}

pub fn get_agent_role(id: &str) -> Option<AgentRoleDef> {
    agent_roles().into_iter().find(|r| r.id == id)
}

pub fn recipe_owner_role(recipe_id: &str) -> Option<String> {
    for role in agent_roles() {
        if role.recipe_ids.iter().any(|id| id == recipe_id) {
            return Some(role.id);
        }
    }
    None
}

/// `enabled_roles`: role ids that are turned on. Empty = all enabled.
pub fn tools_allowed_by_agents(enabled_roles: &[String]) -> HashSet<String> {
    let roles = agent_roles();
    let enabled: HashSet<&str> = if enabled_roles.is_empty() {
        AGENT_ROLE_IDS.iter().copied().collect()
    } else {
        enabled_roles.iter().map(String::as_str).collect()
    };
    let mut allowed = HashSet::new();
    for role in roles {
        if enabled.contains(role.id.as_str()) {
            for tool in role.tools {
                allowed.insert(tool);
            }
        }
    }
    allowed
}

pub fn filter_tools_by_agents(tools: &[String], enabled_roles: &[String]) -> Vec<String> {
    if enabled_roles.is_empty() {
        return tools.to_vec();
    }
    if enabled_roles.len() == AGENT_ROLE_IDS.len() {
        return tools.to_vec();
    }
    let allowed = tools_allowed_by_agents(enabled_roles);
    tools
        .iter()
        .filter(|t| allowed.contains(t.as_str()))
        .cloned()
        .collect()
}

pub fn preferred_tools_for_role(role_id: &str) -> Vec<String> {
    get_agent_role(role_id)
        .map(|r| r.tools.into_iter().take(6).collect())
        .unwrap_or_default()
}

pub fn is_recipe_allowed_by_agents(recipe_id: &str, enabled_roles: &[String]) -> bool {
    let owner = recipe_owner_role(recipe_id).unwrap_or_else(|| "general".into());
    if enabled_roles.is_empty() {
        return true;
    }
    enabled_roles.iter().any(|id| id == &owner)
}

/// Map successful tools → next recipe ids (max 3).
pub fn suggest_followup_recipes(
    ok_tools: &[String],
    scope: &str,
    enabled_roles: &[String],
) -> Vec<String> {
    let ok: HashSet<&str> = ok_tools.iter().map(String::as_str).collect();
    let mut out: Vec<&str> = Vec::new();
    if ok.contains("dates") || ok.contains("tasks") || ok.contains("brief") {
        out.extend(["daily_digest", "weekly_review"]);
    }
    if ok.contains("meeting") || ok.contains("tasks") {
        out.push("meeting_wrap");
    }
    if ok.contains("outline") || ok.contains("meeting") {
        out.push("note_to_template");
    }
    if ok.contains("outline") || ok.contains("flashcards") {
        out.push("study_pass");
    }
    if ok.contains("glossary") || ok.contains("outline") {
        out.push("deep_read");
    }
    if ok.contains("duplicates") || ok.contains("wiki") || ok.contains("wiki_health") {
        out.extend(["cleanup", "wiki_cleanup"]);
    }
    if ok.contains("canvas_summarize") || ok.contains("canvas_to_note") {
        out.push("canvas_board");
    }
    if ok.contains("files_answer") || ok.contains("files_ingest") {
        out.extend(["files_learn", "files_to_library", "files_digest"]);
    }
    if ok.contains("code_brief") || ok.contains("explain") || ok.contains("outline") {
        out.push("code_pass");
    }
    if ok.contains("code_brief") || ok.contains("pii") || ok.contains("glossary") {
        out.push("code_audit");
    }
    if ok.contains("spellcheck") {
        out.extend(["spellcheck", "polish"]);
    }
    if ok.contains("style") || ok.contains("terminology") {
        out.push("polish");
    }
    if out.is_empty() {
        if scope == "document" {
            out.extend(["spellcheck", "polish", "study_pass"]);
        } else {
            out.extend(["daily_digest", "weekly_review", "cleanup", "files_learn"]);
        }
    }
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for id in out {
        if !seen.insert(id) {
            continue;
        }
        if !is_recipe_allowed_by_agents(id, enabled_roles) {
            continue;
        }
        result.push(id.to_string());
        if result.len() >= 3 {
            break;
        }
    }
    result
}

pub fn resolve_agent_recipe(
    id: &str,
    custom: &[(String, String, Vec<String>, bool)],
) -> Option<AgentRecipeDef> {
    if let Some(built) = agent_recipes().into_iter().find(|r| r.id == id) {
        return Some(built);
    }
    custom
        .iter()
        .find(|(cid, _, _, _)| cid == id)
        .map(|(cid, label, tools, doc)| AgentRecipeDef {
            id: cid.clone(),
            label_key: label.clone(),
            tools: tools.clone(),
            document_preferred: *doc,
        })
}

/// Pick canvas template id from a free-text goal.
pub fn pick_canvas_template_id(goal: &str) -> &'static str {
    let folded: String = goal
        .to_lowercase()
        .chars()
        .map(|ch| match ch {
            'á' | 'ä' | 'à' | 'â' | 'ã' => 'a',
            'é' | 'ě' | 'è' | 'ê' => 'e',
            'í' | 'ì' | 'î' => 'i',
            'ó' | 'ô' | 'ö' | 'ò' | 'õ' => 'o',
            'ú' | 'ů' | 'ü' | 'ù' | 'û' => 'u',
            'ý' | 'ỳ' => 'y',
            'č' | 'ć' => 'c',
            'ď' => 'd',
            'ň' | 'ń' => 'n',
            'ř' => 'r',
            'š' | 'ś' => 's',
            'ť' => 't',
            'ž' | 'ź' => 'z',
            'ľ' | 'ĺ' => 'l',
            other => other,
        })
        .collect();
    if folded.contains("roadmap") || folded.contains("cestovn") || folded.contains("roadmapa") {
        return "roadmap";
    }
    if folded.contains("blank") || folded.contains("prazdn") || folded.contains("empty") {
        return "blank";
    }
    "brainstorm"
}

/// Strip light markdown so callout body stays readable.
pub fn strip_answer_markdown(source: &str) -> String {
    let text = strip_based_on_prefix(source);
    let mut out = String::new();
    for line in text.lines() {
        let mut line = line.to_string();
        while line.starts_with('#') {
            let stripped = line.trim_start_matches('#').trim_start();
            if stripped.len() == line.len() {
                break;
            }
            line = stripped.to_string();
        }
        // Remove paired **bold** markers (same as FE replace).
        while let Some(start) = line.find("**") {
            if let Some(end_rel) = line[start + 2..].find("**") {
                let end = start + 2 + end_rel;
                let inner = line[start + 2..end].to_string();
                line.replace_range(start..end + 2, &inner);
            } else {
                break;
            }
        }
        let trimmed = line.trim_start();
        let bullet = trimmed
            .strip_prefix("• ")
            .or_else(|| trimmed.strip_prefix("* "))
            .or_else(|| trimmed.strip_prefix("- "))
            .unwrap_or(trimmed);
        out.push_str(bullet);
        out.push('\n');
    }
    let collapsed = collapse_blank_lines(&out);
    collapsed.trim().to_string()
}

fn strip_based_on_prefix(source: &str) -> String {
    let lower = source.to_ascii_lowercase();
    for prefix in [
        "based on this document:",
        "based on your notes:",
    ] {
        if lower.starts_with(prefix) {
            return source[prefix.len()..].trim_start().to_string();
        }
    }
    // Based on this document (…):
    if lower.starts_with("based on this document") || lower.starts_with("based on your notes") {
        if let Some(idx) = source.find(':') {
            return source[idx + 1..].trim_start().to_string();
        }
    }
    source.to_string()
}

fn collapse_blank_lines(text: &str) -> String {
    let mut out = String::new();
    let mut blank = 0;
    for line in text.lines() {
        if line.trim().is_empty() {
            blank += 1;
            if blank <= 2 {
                out.push('\n');
            }
        } else {
            blank = 0;
            out.push_str(line);
            out.push('\n');
        }
    }
    out
}

/// First `# heading` in markdown, else fallback.
pub fn title_from_markdown(markdown: &str, fallback: &str) -> String {
    for line in markdown.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("# ") {
            let title = rest.trim();
            if !title.is_empty() {
                return title.to_string();
            }
        }
    }
    fallback.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalogs_non_empty() {
        assert_eq!(agent_role_ids().len(), 8);
        assert_eq!(agent_recipes().len(), 21);
        assert_eq!(agent_roles().len(), 8);
        assert!(is_agent_role_id("researcher"));
        assert!(is_agent_recipe_id("deep_research"));
        assert!(is_agent_recipe_id("morning_brief"));
    }

    #[test]
    fn followup_from_meeting() {
        let ids = suggest_followup_recipes(&["meeting".into(), "tasks".into()], "document", &[]);
        assert!(ids.contains(&"meeting_wrap".into()));
    }

    #[test]
    fn canvas_template_pick() {
        assert_eq!(pick_canvas_template_id("make a roadmap"), "roadmap");
        assert_eq!(pick_canvas_template_id("blank board"), "blank");
        assert_eq!(pick_canvas_template_id("brainstorm ideas"), "brainstorm");
    }

    #[test]
    fn strip_and_title() {
        assert_eq!(
            strip_answer_markdown("Based on this document:\n## Hello\n- item"),
            "Hello\nitem"
        );
        assert_eq!(title_from_markdown("# My Note\n\nbody", "fallback"), "My Note");
    }

    #[test]
    fn code_pass_recipe_and_developer_role() {
        let recipe = agent_recipes()
            .into_iter()
            .find(|r| r.id == "code_pass")
            .expect("code_pass");
        assert_eq!(
            recipe.tools,
            vec!["code_brief", "explain", "outline", "keywords"]
        );
        assert!(recipe.document_preferred);
        assert_eq!(recipe_owner_role("code_pass").as_deref(), Some("developer"));
        let audit = get_agent_recipe("code_audit").expect("code_audit");
        assert_eq!(audit.tools, vec!["code_brief", "pii", "glossary"]);
        assert_eq!(recipe_owner_role("code_audit").as_deref(), Some("developer"));
        let developer = get_agent_role("developer").expect("developer");
        assert!(developer.recipe_ids.iter().any(|id| id == "code_pass"));
        assert!(developer.recipe_ids.iter().any(|id| id == "code_audit"));
        assert!(is_agent_recipe_id("code_pass"));
        assert!(is_agent_recipe_id("code_audit"));
    }

    #[test]
    fn followup_from_code_brief() {
        let ids = suggest_followup_recipes(
            &["code_brief".into(), "explain".into()],
            "document",
            &[],
        );
        assert!(ids.contains(&"code_pass".into()));
    }

    #[test]
    fn filter_tools_by_single_role() {
        let meeting = filter_tools_by_agents(
            &["meeting".into(), "quiz".into(), "handoff".into()],
            &["meeting".into()],
        );
        assert!(meeting.contains(&"meeting".into()));
        assert!(meeting.contains(&"handoff".into()));
        assert!(!meeting.contains(&"quiz".into()));
    }
}
