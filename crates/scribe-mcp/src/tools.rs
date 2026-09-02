use rmcp::schemars::JsonSchema;
use serde::Deserialize;

pub fn json<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|error| error.to_string())
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SearchParams {
    pub query: String,
    pub limit: Option<i64>,
    pub folder_id: Option<String>,
    pub tag: Option<String>,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct IdParams {
    pub id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct IdLimitParams {
    pub id: String,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DocumentLimitParams {
    pub document_id: String,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TitleParams {
    pub title: String,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GetDocumentParams {
    pub id: String,
    pub include_json: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ListDocumentsParams {
    pub folder_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateNoteParams {
    pub title: String,
    pub content: Option<String>,
    pub folder_id: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct AppendNoteParams {
    pub id: String,
    pub text: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct LimitParams {
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TagParams {
    pub tag: String,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct AddTagParams {
    pub id: String,
    pub tag: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SetTagsParams {
    pub id: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateFolderParams {
    pub name: String,
    pub parent_id: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RenameFolderParams {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct MoveDocumentParams {
    pub document_id: String,
    pub folder_id: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DocumentIdParams {
    pub document_id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RevisionParams {
    pub revision_id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SearchModeParams {
    pub query: String,
    pub limit: Option<i64>,
    /// hybrid | semantic | fts
    pub mode: Option<String>,
    pub folder_id: Option<String>,
    pub tag: Option<String>,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct JournalSummaryParams {
    pub from_date: String,
    pub to_date: String,
    pub journal_folder_id: Option<String>,
    pub document_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct JournalTasksParams {
    pub document_ids: Vec<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RenameDocumentParams {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ReplaceContentParams {
    pub id: String,
    pub content: String,
}

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
