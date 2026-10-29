use rmcp::schemars::JsonSchema;
use serde::Deserialize;

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]

pub struct UpsertManuscriptParams {
    pub id: Option<String>,
    pub title: String,
    pub chapter_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocumentChatCitationParams {
    pub document_id: String,
    pub title: String,
    pub snippet: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AppendDocumentChatParams {
    pub document_id: String,
    /// user | assistant
    pub role: String,
    pub text: String,
    pub action: Option<String>,
    pub citations: Option<Vec<DocumentChatCitationParams>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CompileManuscriptParams {
    pub id: Option<String>,
    pub chapter_ids: Option<Vec<String>>,
    pub title: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpsertSmartFolderParams {
    pub id: Option<String>,
    pub name: String,
    pub query_rule: String,
    pub icon: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EvaluateSmartFolderParams {
    pub id: Option<String>,
    pub query_rule: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ResolveSyncConflictParams {
    pub id: String,
    /// app | disk
    pub keep: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChunkTextParams {
    pub id: Option<String>,
    pub text: Option<String>,
    pub max_chars: Option<i64>,
    pub overlap: Option<i64>,
    pub max_chunks: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExtractOutlineNlpParams {
    pub id: Option<String>,
    pub text: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExtractAssetOcrParams {
    pub document_id: String,
    pub file_name: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFindReplaceParams {
    pub query: String,
    pub replacement: Option<String>,
    /// Defaults to true. Must pass false plus replacement to write.
    pub dry_run: Option<bool>,
    pub folder_id: Option<String>,
    pub document_ids: Option<Vec<String>>,
    pub match_case: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeThisNoteParams {
    pub id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SwitchAndSearchParams {
    pub library: Option<String>,
    pub query: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FuzzyRankItemParam {
    pub id: String,
    pub primary: String,
    pub secondary: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FuzzyRankParams {
    pub items: Vec<FuzzyRankItemParam>,
    pub query: String,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RandomThemeParams {
    /// `light` or `dark` (default light).
    pub scheme: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RenderUiSurfaceParams {
    /// `whats-new`, `welcome`, `about`, `docs`, or `privacy`.
    pub surface: String,
    pub strings: Option<std::collections::HashMap<String, String>>,
    pub version: Option<String>,
    pub short_version: Option<String>,
    pub recent: Option<serde_json::Value>,
    /// When true, return an HTML fragment (no full document chrome).
    pub fragment: Option<bool>,
    pub full_document: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PlanAgentGoalParams {
    pub goal: String,
    /// `document` (default) or `library`.
    pub scope: Option<String>,
    pub max_tools: Option<i64>,
    pub role: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentDocumentBriefParams {
    pub id: Option<String>,
    pub text: Option<String>,
    pub goal: Option<String>,
    pub tools: Option<Vec<String>>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NormalizeToastSettingsParams {
    /// Raw JSON object (partial toast settings OK).
    pub raw: String,
}
