use rmcp::schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ContradictionHintsParams {
    pub id_a: Option<String>,
    pub id_b: Option<String>,
    pub text_a: Option<String>,
    pub text_b: Option<String>,
    pub title_a: Option<String>,
    pub title_b: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PassageRerankItem {
    pub document_id: Option<String>,
    pub title: Option<String>,
    pub snippet: Option<String>,
    pub text: Option<String>,
    pub score: Option<f64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PassageRerankParams {
    pub query: String,
    pub passages: Vec<PassageRerankItem>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AnswerFollowupsParams {
    pub question: String,
    pub sentences: Option<Vec<String>>,
    pub passages: Option<Vec<PassageRerankItem>>,
    /// `library` (default) or `document`.
    pub scope: Option<String>,
    pub intent: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FilesPathParams {
    pub path: Option<String>,
    pub recursive: Option<bool>,
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FilesReadParams {
    pub path: String,
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FilesSearchParams {
    pub query: String,
    pub path: Option<String>,
    pub glob: Option<String>,
    pub limit: Option<i64>,
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FilesSummarizeParams {
    pub path: String,
    pub limit: Option<i64>,
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FilesAnswerParams {
    pub question: String,
    pub path: Option<String>,
    pub limit: Option<i64>,
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FilesIndexParams {
    pub path: Option<String>,
    pub limit_files: Option<i64>,
    pub force: Option<bool>,
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FilesIndexStatusParams {
    pub path: Option<String>,
    pub scan_limit: Option<i64>,
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FilesSimilarParams {
    pub path: String,
    pub scope: Option<String>,
    pub limit: Option<i64>,
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FilesIndexClearParams {
    pub path: Option<String>,
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]

pub struct AnalyzeRevisionDiffParams {
    pub old_text: String,
    pub new_text: String,
    pub max_bullets: Option<i64>,
    pub language: Option<String>,
    pub prefer_rust: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeRevisionDiffDocParams {
    pub id: String,
    pub revision_id: String,
    pub max_bullets: Option<i64>,
    pub language: Option<String>,
    pub prefer_rust: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SuggestContinuationParams {
    pub prefix: String,
    pub max_suggestions: Option<i64>,
    pub max_tokens: Option<i64>,
    pub exclude_document_id: Option<String>,
    pub prefer_rust: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WikiHealthParams {
    pub unresolved_limit: Option<i64>,
    pub stub_max_words: Option<i64>,
    pub stub_limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct StubDocumentsParams {
    pub max_words: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ResolveWikiLinkParams {
    pub document_id: String,
    pub label: String,
    pub target_id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateAndLinkWikiParams {
    /// Source note that contains the unresolved `[[label]]`.
    pub document_id: String,
    /// Wiki label / new note title.
    pub label: String,
    pub folder_id: Option<String>,
    /// Optional seed body for the new note.
    pub content: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutoResolveWikiParams {
    pub limit: Option<i64>,
    /// Minimum suggestion score to auto-link (default 0.72, range 0.4–0.95).
    pub min_score: Option<f64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SmartFilterParams {
    /// `none` | `unlinked` | `untagged` | `unread` | `canvas` | `stubs` | `tasks` | `media`
    pub filter: String,
    pub limit: Option<i64>,
    pub folder_id: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExpandStubParams {
    pub id: String,
    /// Optional heading for the outline block (default "Outline").
    pub heading: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WikiNeighborhoodParams {
    pub id: String,
    /// Outbound wiki-link hops (default 2, max 8).
    pub hops: Option<u32>,
    /// Cap on collected note ids (default 80, max 500).
    pub max_notes: Option<usize>,
}

#[derive(Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WikiGhostCandidateParam {
    pub id: String,
    pub title: String,
    pub phrase: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FindWikiGhostMatchParams {
    /// Paragraph (or any plain text) to scan for a title/alias phrase.
    pub paragraph: String,
    /// Optional explicit candidates; when omitted, titles (+ aliases) from the active library.
    pub candidates: Option<Vec<WikiGhostCandidateParam>>,
    /// Skip this document when auto-building candidates (usually the note being edited).
    pub exclude_document_id: Option<String>,
    pub min_length: Option<usize>,
    /// Max library docs to scan for auto-candidates (default 200, max 200).
    pub candidate_limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AddDocumentAliasParams {
    pub id: String,
    /// Alias value without the `alias:` prefix.
    pub alias: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ParseAliasesParams {
    /// Document id — reads its tags. Mutually preferred over `tags`.
    pub id: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExportDocumentSourceParams {
    pub id: String,
}
