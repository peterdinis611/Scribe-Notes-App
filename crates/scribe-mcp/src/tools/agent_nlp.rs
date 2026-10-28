use rmcp::schemars::JsonSchema;
use serde::Deserialize;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SetFlagParams {
    pub id: String,
    pub value: bool,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SummarizeDocumentParams {
    pub id: String,
    pub max_sentences: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListOpenTasksParams {
    pub folder_id: Option<String>,
    pub limit: Option<i64>,
    pub include_phrases: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetOrCreateJournalParams {
    /// day (default) | morning | evening
    pub slot: Option<String>,
    /// YYYY-MM-DD (default: today, local timezone)
    pub date: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListArtifactsParams {
    pub kind: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateDocumentParams {
    pub id: String,
    pub title: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MoveFolderParams {
    pub id: String,
    pub parent_id: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateCommentThreadParams {
    pub document_id: String,
    pub quote: Option<String>,
    pub body: String,
    pub author: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AddCommentReplyParams {
    pub thread_id: String,
    pub body: String,
    pub author: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExportDocumentParams {
    pub id: String,
    /// markdown | plain
    pub format: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ToggleTaskParams {
    pub id: String,
    pub text: String,
    pub checked: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]

pub struct DateRangePromptParams {
    pub from_date: Option<String>,
    pub to_date: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAnswerParams {
    pub question: String,
    pub limit: Option<i64>,
    pub folder_id: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentParams {
    /// Natural-language goal for the local agent (same planner as the Scribe app).
    /// Optional when `recipeId` or `forceTools` is set (defaults to the recipe id / "run").
    pub goal: Option<String>,
    /// library | document
    pub scope: Option<String>,
    /// Required for most document tools.
    pub document_id: Option<String>,
    /// Second note for compare_notes / contradictions.
    pub document_id_b: Option<String>,
    /// Saved revision id for the `revision` tool.
    pub revision_id: Option<String>,
    /// Cap tool steps (1–6). Default 3 (or agent prefs maxSteps).
    pub max_tools: Option<i64>,
    /// Agent persona: `general` (default), `spellcheck`/`proofreader`, or any role id
    /// (`librarian`, `meeting`, `study`, `organizer`, `developer`).
    pub persona: Option<String>,
    /// Built-in or known recipe id (`code_pass`, `meeting_wrap`, …) — skips the planner.
    pub recipe_id: Option<String>,
    /// Explicit tool ids to run in order (overrides planner; applied before recipeId).
    pub force_tools: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RunSpellcheckAgentParams {
    /// Document to spellcheck (required).
    pub document_id: String,
    /// Optional focus (e.g. “only proper nouns”). Defaults to a full-note check.
    pub goal: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KeywordLimitParams {
    pub id: String,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEventsParams {
    pub limit: Option<i64>,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateFromTemplateParams {
    pub template_id: String,
    pub folder_id: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BackupDirParams {
    /// Optional backup folder; default ~/Documents/Scribe/Backups
    pub directory: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChatContextMessage {
    pub role: String,
    pub text: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocumentAnswerParams {
    pub id: String,
    pub question: String,
    /// Optional prior turns `{ role, text }` for follow-ups (last 6 used).
    pub context: Option<Vec<ChatContextMessage>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SummarizeDiffParams {
    pub old_text: String,
    pub new_text: String,
    pub max_bullets: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SummarizeRevisionDiffParams {
    pub id: String,
    pub revision_id: String,
    pub max_bullets: Option<i64>,
}
