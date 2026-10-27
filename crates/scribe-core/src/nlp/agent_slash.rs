//! Agent composer slash shortcuts (`/talk`, `/meeting`, …) — canonical for app + MCP.

use serde::Serialize;

use super::chat_intent::fold_intent;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentSlashScope {
    Document,
    Library,
    Folder,
    Any,
}

impl AgentSlashScope {
    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "document" => Some(Self::Document),
            "library" => Some(Self::Library),
            "folder" => Some(Self::Folder),
            "any" => Some(Self::Any),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Document => "document",
            Self::Library => "library",
            Self::Folder => "folder",
            Self::Any => "any",
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentSlashCommandDef {
    pub id: String,
    pub name: String,
    pub aliases: Vec<String>,
    pub label_key: String,
    pub hint_key: String,
    pub scopes: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tools: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recipe_id: Option<String>,
    #[serde(default)]
    pub pass_args: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_goal_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ParsedAgentSlash {
    /// Input does not start with `/`.
    #[serde(rename = "none")]
    None,
    /// Starts with `/` but token is unknown or out of scope.
    Unknown { token: String },
    /// Matched a slash command.
    Ok {
        command_id: String,
        name: String,
        args: String,
        force_tools: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        recipe_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        default_goal_key: Option<String>,
        pass_args: bool,
        label_key: String,
        hint_key: String,
    },
}

struct SlashDef {
    id: &'static str,
    name: &'static str,
    aliases: &'static [&'static str],
    label_key: &'static str,
    hint_key: &'static str,
    scopes: &'static [AgentSlashScope],
    tools: &'static [&'static str],
    recipe_id: Option<&'static str>,
    pass_args: bool,
    default_goal_key: Option<&'static str>,
}

fn slash_catalog() -> &'static [SlashDef] {
    use AgentSlashScope::{Any, Document, Folder, Library};
    &[
        SlashDef {
            id: "talk",
            name: "talk",
            aliases: &["ask", "q", "hovor", "otazka"],
            label_key: "agent.slash.talk.label",
            hint_key: "agent.slash.talk.hint",
            scopes: &[Any],
            tools: &["document_answer"],
            recipe_id: None,
            pass_args: true,
            default_goal_key: Some("agent.slash.talk.defaultGoal"),
        },
        SlashDef {
            id: "library",
            name: "library",
            aliases: &["lib", "kniznica"],
            label_key: "agent.slash.library.label",
            hint_key: "agent.slash.library.hint",
            scopes: &[Library, Folder, Any],
            tools: &["library_answer"],
            recipe_id: None,
            pass_args: true,
            default_goal_key: Some("agent.slash.library.defaultGoal"),
        },
        SlashDef {
            id: "summary",
            name: "summary",
            aliases: &["sum", "zhrnutie", "tldr"],
            label_key: "agent.slash.summary.label",
            hint_key: "agent.slash.summary.hint",
            scopes: &[Document, Any],
            tools: &["summarize"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.summarize"),
        },
        SlashDef {
            id: "outline",
            name: "outline",
            aliases: &["osnova"],
            label_key: "agent.slash.outline.label",
            hint_key: "agent.slash.outline.hint",
            scopes: &[Document, Any],
            tools: &["outline"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.outline"),
        },
        SlashDef {
            id: "brief",
            name: "brief",
            aliases: &["pulse"],
            label_key: "agent.slash.brief.label",
            hint_key: "agent.slash.brief.hint",
            scopes: &[Document, Any],
            tools: &["brief", "note_pulse"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.brief"),
        },
        SlashDef {
            id: "meeting",
            name: "meeting",
            aliases: &["meet", "porada"],
            label_key: "agent.slash.meeting.label",
            hint_key: "agent.slash.meeting.hint",
            scopes: &[Document, Any],
            tools: &["meeting"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.meeting"),
        },
        SlashDef {
            id: "wrap",
            name: "wrap",
            aliases: &["meetingwrap"],
            label_key: "agent.slash.wrap.label",
            hint_key: "agent.slash.wrap.hint",
            scopes: &[Document, Any],
            tools: &[],
            recipe_id: Some("meeting_wrap"),
            pass_args: false,
            default_goal_key: None,
        },
        SlashDef {
            id: "plan",
            name: "plan",
            aliases: &["ahead", "planuj"],
            label_key: "agent.slash.plan.label",
            hint_key: "agent.slash.plan.hint",
            scopes: &[Document, Any],
            tools: &["forward_plan"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.forward_plan"),
        },
        SlashDef {
            id: "tasks",
            name: "tasks",
            aliases: &["todo", "ulohy"],
            label_key: "agent.slash.tasks.label",
            hint_key: "agent.slash.tasks.hint",
            scopes: &[Document, Any],
            tools: &["tasks", "action_items"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.tasks"),
        },
        SlashDef {
            id: "actions",
            name: "actions",
            aliases: &["action"],
            label_key: "agent.slash.actions.label",
            hint_key: "agent.slash.actions.hint",
            scopes: &[Document, Any],
            tools: &["action_items", "rank_tasks"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.action_items"),
        },
        SlashDef {
            id: "decisions",
            name: "decisions",
            aliases: &["decide", "rozhodnutia"],
            label_key: "agent.slash.decisions.label",
            hint_key: "agent.slash.decisions.hint",
            scopes: &[Document, Any],
            tools: &["decisions"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.decisions"),
        },
        SlashDef {
            id: "loops",
            name: "loops",
            aliases: &["open", "slucky"],
            label_key: "agent.slash.loops.label",
            hint_key: "agent.slash.loops.hint",
            scopes: &[Document, Any],
            tools: &["open_loops"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.open_loops"),
        },
        SlashDef {
            id: "commitments",
            name: "commitments",
            aliases: &["promises", "zavazky"],
            label_key: "agent.slash.commitments.label",
            hint_key: "agent.slash.commitments.hint",
            scopes: &[Document, Any],
            tools: &["commitments"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.commitments"),
        },
        SlashDef {
            id: "dates",
            name: "dates",
            aliases: &["deadlines", "terminy"],
            label_key: "agent.slash.dates.label",
            hint_key: "agent.slash.dates.hint",
            scopes: &[Any],
            tools: &["dates"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.dates"),
        },
        SlashDef {
            id: "spell",
            name: "spell",
            aliases: &["typo", "pravopis"],
            label_key: "agent.slash.spell.label",
            hint_key: "agent.slash.spell.hint",
            scopes: &[Document, Any],
            tools: &["spellcheck"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.spellcheck"),
        },
        SlashDef {
            id: "grammar",
            name: "grammar",
            aliases: &["gramatika"],
            label_key: "agent.slash.grammar.label",
            hint_key: "agent.slash.grammar.hint",
            scopes: &[Document, Any],
            tools: &["grammar"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.grammar"),
        },
        SlashDef {
            id: "polish",
            name: "polish",
            aliases: &["vylepsi"],
            label_key: "agent.slash.polish.label",
            hint_key: "agent.slash.polish.hint",
            scopes: &[Document, Any],
            tools: &[],
            recipe_id: Some("polish"),
            pass_args: false,
            default_goal_key: None,
        },
        SlashDef {
            id: "rewrite",
            name: "rewrite",
            aliases: &["prepis"],
            label_key: "agent.slash.rewrite.label",
            hint_key: "agent.slash.rewrite.hint",
            scopes: &[Document, Any],
            tools: &["rewrite"],
            recipe_id: None,
            pass_args: true,
            default_goal_key: Some("agent.tools.rewrite"),
        },
        SlashDef {
            id: "tone",
            name: "tone",
            aliases: &["ton"],
            label_key: "agent.slash.tone.label",
            hint_key: "agent.slash.tone.hint",
            scopes: &[Document, Any],
            tools: &["tone"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.tone"),
        },
        SlashDef {
            id: "style",
            name: "style",
            aliases: &["coach"],
            label_key: "agent.slash.style.label",
            hint_key: "agent.slash.style.hint",
            scopes: &[Document, Any],
            tools: &["style"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.style"),
        },
        SlashDef {
            id: "explain",
            name: "explain",
            aliases: &["vysvetli"],
            label_key: "agent.slash.explain.label",
            hint_key: "agent.slash.explain.hint",
            scopes: &[Document, Any],
            tools: &["explain"],
            recipe_id: None,
            pass_args: true,
            default_goal_key: Some("agent.quickPrompts.explain"),
        },
        SlashDef {
            id: "simplify",
            name: "simplify",
            aliases: &["eli5", "zjednodus"],
            label_key: "agent.slash.simplify.label",
            hint_key: "agent.slash.simplify.hint",
            scopes: &[Document, Any],
            tools: &["simplify"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.simplify"),
        },
        SlashDef {
            id: "takeaways",
            name: "takeaways",
            aliases: &["key", "zavery"],
            label_key: "agent.slash.takeaways.label",
            hint_key: "agent.slash.takeaways.hint",
            scopes: &[Document, Any],
            tools: &["takeaways"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.takeaways"),
        },
        SlashDef {
            id: "study",
            name: "study",
            aliases: &["ucenie"],
            label_key: "agent.slash.study.label",
            hint_key: "agent.slash.study.hint",
            scopes: &[Document, Any],
            tools: &[],
            recipe_id: Some("study_pass"),
            pass_args: false,
            default_goal_key: None,
        },
        SlashDef {
            id: "deep",
            name: "deep",
            aliases: &["deepread"],
            label_key: "agent.slash.deep.label",
            hint_key: "agent.slash.deep.hint",
            scopes: &[Document, Any],
            tools: &[],
            recipe_id: Some("deep_read"),
            pass_args: false,
            default_goal_key: None,
        },
        SlashDef {
            id: "cards",
            name: "cards",
            aliases: &["flashcards", "karticky"],
            label_key: "agent.slash.cards.label",
            hint_key: "agent.slash.cards.hint",
            scopes: &[Document, Any],
            tools: &["flashcards"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.flashcards"),
        },
        SlashDef {
            id: "quiz",
            name: "quiz",
            aliases: &["kviz"],
            label_key: "agent.slash.quiz.label",
            hint_key: "agent.slash.quiz.hint",
            scopes: &[Document, Any],
            tools: &["quiz"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.quiz"),
        },
        SlashDef {
            id: "glossary",
            name: "glossary",
            aliases: &["slovnik"],
            label_key: "agent.slash.glossary.label",
            hint_key: "agent.slash.glossary.hint",
            scopes: &[Document, Any],
            tools: &["glossary"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.glossary"),
        },
        SlashDef {
            id: "read",
            name: "read",
            aliases: &["reading"],
            label_key: "agent.slash.read.label",
            hint_key: "agent.slash.read.hint",
            scopes: &[Document, Any],
            tools: &["reading_plan"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.reading_plan"),
        },
        SlashDef {
            id: "sections",
            name: "sections",
            aliases: &["sekcie"],
            label_key: "agent.slash.sections.label",
            hint_key: "agent.slash.sections.hint",
            scopes: &[Document, Any],
            tools: &["section_summaries"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.section_summaries"),
        },
        SlashDef {
            id: "wiki",
            name: "wiki",
            aliases: &["links"],
            label_key: "agent.slash.wiki.label",
            hint_key: "agent.slash.wiki.hint",
            scopes: &[Document, Any],
            tools: &["wiki"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.wiki"),
        },
        SlashDef {
            id: "similar",
            name: "similar",
            aliases: &["related", "podobne"],
            label_key: "agent.slash.similar.label",
            hint_key: "agent.slash.similar.hint",
            scopes: &[Document, Any],
            tools: &["similar"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.similar"),
        },
        SlashDef {
            id: "compare",
            name: "compare",
            aliases: &["diff", "porovnaj"],
            label_key: "agent.slash.compare.label",
            hint_key: "agent.slash.compare.hint",
            scopes: &[Document, Any],
            tools: &["compare_notes"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.compare_notes"),
        },
        SlashDef {
            id: "pii",
            name: "pii",
            aliases: &["privacy", "sukromie"],
            label_key: "agent.slash.pii.label",
            hint_key: "agent.slash.pii.hint",
            scopes: &[Document, Any],
            tools: &["pii"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.pii"),
        },
        SlashDef {
            id: "title",
            name: "title",
            aliases: &["nazov"],
            label_key: "agent.slash.title.label",
            hint_key: "agent.slash.title.hint",
            scopes: &[Document, Any],
            tools: &["title"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.title"),
        },
        SlashDef {
            id: "continue",
            name: "continue",
            aliases: &["cont", "pokracuj"],
            label_key: "agent.slash.continue.label",
            hint_key: "agent.slash.continue.hint",
            scopes: &[Document, Any],
            tools: &["continuation"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.continuation"),
        },
        SlashDef {
            id: "keywords",
            name: "keywords",
            aliases: &["tags", "klucove"],
            label_key: "agent.slash.keywords.label",
            hint_key: "agent.slash.keywords.hint",
            scopes: &[Document, Any],
            tools: &["keywords"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.keywords"),
        },
        SlashDef {
            id: "quotes",
            name: "quotes",
            aliases: &["citacie"],
            label_key: "agent.slash.quotes.label",
            hint_key: "agent.slash.quotes.hint",
            scopes: &[Document, Any],
            tools: &["quotes"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.quotes"),
        },
        SlashDef {
            id: "mentions",
            name: "mentions",
            aliases: &["people", "ludia"],
            label_key: "agent.slash.mentions.label",
            hint_key: "agent.slash.mentions.hint",
            scopes: &[Document, Any],
            tools: &["mentions"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.mentions"),
        },
        SlashDef {
            id: "organize",
            name: "organize",
            aliases: &["org", "usporiadaj"],
            label_key: "agent.slash.organize.label",
            hint_key: "agent.slash.organize.hint",
            scopes: &[Document, Library, Any],
            tools: &["organize"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.organize"),
        },
        SlashDef {
            id: "cleanup",
            name: "cleanup",
            aliases: &["upratanie"],
            label_key: "agent.slash.cleanup.label",
            hint_key: "agent.slash.cleanup.hint",
            scopes: &[Library, Any],
            tools: &[],
            recipe_id: Some("cleanup"),
            pass_args: false,
            default_goal_key: None,
        },
        SlashDef {
            id: "digest",
            name: "digest",
            aliases: &["daily"],
            label_key: "agent.slash.digest.label",
            hint_key: "agent.slash.digest.hint",
            scopes: &[Library, Any],
            tools: &[],
            recipe_id: Some("daily_digest"),
            pass_args: false,
            default_goal_key: None,
        },
        SlashDef {
            id: "report",
            name: "report",
            aliases: &["weekly"],
            label_key: "agent.slash.report.label",
            hint_key: "agent.slash.report.hint",
            scopes: &[Library, Any],
            tools: &[],
            recipe_id: Some("weekly_review"),
            pass_args: false,
            default_goal_key: None,
        },
        SlashDef {
            id: "files",
            name: "files",
            aliases: &["sandbox"],
            label_key: "agent.slash.files.label",
            hint_key: "agent.slash.files.hint",
            scopes: &[Library, Any],
            tools: &["files_answer"],
            recipe_id: None,
            pass_args: true,
            default_goal_key: Some("agent.quickPrompts.askFiles"),
        },
        SlashDef {
            id: "code",
            name: "code",
            aliases: &["codebrief"],
            label_key: "agent.slash.code.label",
            hint_key: "agent.slash.code.hint",
            scopes: &[Document, Any],
            tools: &["code_brief"],
            recipe_id: None,
            pass_args: false,
            default_goal_key: Some("agent.tools.code_brief"),
        },
        SlashDef {
            id: "canvas",
            name: "canvas",
            aliases: &["board"],
            label_key: "agent.slash.canvas.label",
            hint_key: "agent.slash.canvas.hint",
            scopes: &[Document, Any],
            tools: &[],
            recipe_id: Some("canvas_board"),
            pass_args: false,
            default_goal_key: None,
        },
        SlashDef {
            id: "privacy",
            name: "privacy",
            aliases: &["privacypass"],
            label_key: "agent.slash.privacy.label",
            hint_key: "agent.slash.privacy.hint",
            scopes: &[Library, Document, Any],
            tools: &[],
            recipe_id: Some("privacy_pass"),
            pass_args: false,
            default_goal_key: None,
        },
    ]
}

fn to_def(cmd: &SlashDef) -> AgentSlashCommandDef {
    AgentSlashCommandDef {
        id: cmd.id.into(),
        name: cmd.name.into(),
        aliases: cmd.aliases.iter().map(|s| (*s).to_string()).collect(),
        label_key: cmd.label_key.into(),
        hint_key: cmd.hint_key.into(),
        scopes: cmd.scopes.iter().map(|s| s.as_str().to_string()).collect(),
        tools: cmd.tools.iter().map(|s| (*s).to_string()).collect(),
        recipe_id: cmd.recipe_id.map(str::to_string),
        pass_args: cmd.pass_args,
        default_goal_key: cmd.default_goal_key.map(str::to_string),
    }
}

fn scope_allowed(cmd: &SlashDef, scope: AgentSlashScope) -> bool {
    cmd.scopes.contains(&AgentSlashScope::Any) || cmd.scopes.contains(&scope)
}

fn find_by_token(token: &str) -> Option<&'static SlashDef> {
    let folded = fold_intent(token);
    slash_catalog().iter().find(|cmd| {
        fold_intent(cmd.name) == folded
            || cmd.aliases.iter().any(|alias| fold_intent(alias) == folded)
    })
}

fn tools_for(cmd: &SlashDef, scope: AgentSlashScope) -> Vec<String> {
    if cmd.id == "talk" {
        return if scope == AgentSlashScope::Document {
            vec!["document_answer".into()]
        } else {
            vec!["library_answer".into()]
        };
    }
    cmd.tools.iter().map(|s| (*s).to_string()).collect()
}

/// Full slash catalog (for FE cache / MCP).
pub fn list_agent_slash_commands(scope: Option<&str>) -> Vec<AgentSlashCommandDef> {
    let scope = scope.and_then(AgentSlashScope::parse);
    slash_catalog()
        .iter()
        .filter(|cmd| match scope {
            Some(s) => scope_allowed(cmd, s),
            None => true,
        })
        .map(to_def)
        .collect()
}

/// Autocomplete filter for the composer.
pub fn filter_agent_slash_commands(query: &str, scope: &str, limit: usize) -> Vec<AgentSlashCommandDef> {
    let Some(scope) = AgentSlashScope::parse(scope) else {
        return Vec::new();
    };
    let q = fold_intent(query.trim_start_matches('/'));
    let limit = if limit == 0 { 10 } else { limit };
    let mut out = Vec::new();
    for cmd in slash_catalog() {
        if !scope_allowed(cmd, scope) {
            continue;
        }
        if q.is_empty() {
            out.push(to_def(cmd));
        } else {
            let hay: Vec<String> = std::iter::once(cmd.name)
                .chain(cmd.aliases.iter().copied())
                .map(fold_intent)
                .collect();
            if hay.iter().any(|item| item.starts_with(&q) || item.contains(&q)) {
                out.push(to_def(cmd));
            }
        }
        if out.len() >= limit {
            break;
        }
    }
    out
}

/// Parse a composer goal that may start with `/`.
pub fn parse_agent_slash(raw: &str, scope: &str) -> ParsedAgentSlash {
    let trimmed = raw.trim();
    if !trimmed.starts_with('/') {
        return ParsedAgentSlash::None;
    }
    let Some(scope) = AgentSlashScope::parse(scope) else {
        return ParsedAgentSlash::Unknown {
            token: trimmed.trim_start_matches('/').to_string(),
        };
    };

    let body = &trimmed[1..];
    if body.is_empty() {
        return ParsedAgentSlash::Unknown {
            token: String::new(),
        };
    }

    let mut parts = body.splitn(2, char::is_whitespace);
    let token_raw = parts.next().unwrap_or("").trim();
    let args = parts.next().unwrap_or("").trim().to_string();
    if token_raw.is_empty() || token_raw.contains('/') {
        return ParsedAgentSlash::Unknown {
            token: token_raw.to_string(),
        };
    }

    let Some(cmd) = find_by_token(token_raw) else {
        return ParsedAgentSlash::Unknown {
            token: token_raw.to_string(),
        };
    };
    if !scope_allowed(cmd, scope) {
        return ParsedAgentSlash::Unknown {
            token: token_raw.to_string(),
        };
    }

    ParsedAgentSlash::Ok {
        command_id: cmd.id.into(),
        name: cmd.name.into(),
        args,
        force_tools: tools_for(cmd, scope),
        recipe_id: cmd.recipe_id.map(str::to_string),
        default_goal_key: cmd.default_goal_key.map(str::to_string),
        pass_args: cmd.pass_args,
        label_key: cmd.label_key.into(),
        hint_key: cmd.hint_key.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_talk_with_question() {
        let parsed = parse_agent_slash("/talk What is the deadline?", "document");
        match parsed {
            ParsedAgentSlash::Ok {
                command_id,
                force_tools,
                args,
                ..
            } => {
                assert_eq!(command_id, "talk");
                assert_eq!(force_tools, vec!["document_answer"]);
                assert_eq!(args, "What is the deadline?");
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn talk_maps_to_library_outside_document() {
        let parsed = parse_agent_slash("/talk themes?", "library");
        match parsed {
            ParsedAgentSlash::Ok { force_tools, .. } => {
                assert_eq!(force_tools, vec!["library_answer"]);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn aliases_and_recipes() {
        match parse_agent_slash("/porada", "document") {
            ParsedAgentSlash::Ok { force_tools, .. } => {
                assert_eq!(force_tools, vec!["meeting"]);
            }
            other => panic!("unexpected {other:?}"),
        }
        match parse_agent_slash("/wrap", "document") {
            ParsedAgentSlash::Ok { recipe_id, .. } => {
                assert_eq!(recipe_id.as_deref(), Some("meeting_wrap"));
            }
            other => panic!("unexpected {other:?}"),
        }
        match parse_agent_slash("/planuj", "document") {
            ParsedAgentSlash::Ok { force_tools, .. } => {
                assert_eq!(force_tools, vec!["forward_plan"]);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn unknown_and_non_slash() {
        assert!(matches!(
            parse_agent_slash("/nope", "document"),
            ParsedAgentSlash::Unknown { .. }
        ));
        assert!(matches!(
            parse_agent_slash("summarize this", "document"),
            ParsedAgentSlash::None
        ));
    }

    #[test]
    fn filters_autocomplete() {
        let hits = filter_agent_slash_commands("mee", "document", 10);
        assert!(hits.iter().any(|c| c.id == "meeting"));
        assert!(!list_agent_slash_commands(Some("document")).is_empty());
    }
}
