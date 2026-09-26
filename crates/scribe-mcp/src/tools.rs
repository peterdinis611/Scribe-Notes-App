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
    pub library_id: Option<String>,
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
    pub library_id: Option<String>,
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

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAnswerParams {
    pub question: String,
    pub limit: Option<i64>,
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

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TemplateFillHintsParams {
    pub id: String,
    pub expected_sections: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetNlpEnabledParams {
    pub enabled: bool,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetEmbedBackendParams {
    /// `hash` (default), `fast` (model2vec), or `quality` (MiniLM when installed)
    pub backend: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetAnswerBackendParams {
    /// `auto` (default), `index`, or `quality`
    pub backend: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GeneratePlaceholderParams {
    /// paragraphs | sentences | words
    pub unit: Option<String>,
    pub count: Option<i64>,
    pub language: Option<String>,
    pub start_with_classic: Option<bool>,
    pub seed: Option<u64>,
    pub prefer_rust: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeleteIdParams {
    pub id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CitationPackParams {
    pub claim: String,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct QuestionParams {
    pub question: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConvertTiptapParams {
    pub content_json: String,
    /// `plain` or `markdown`
    pub format: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiffPlainTextsParams {
    pub old_text: String,
    pub new_text: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MetaFiltersParams {
    pub tags: Vec<String>,
    pub status: Option<String>,
    pub project: Option<String>,
    pub year: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TerminologyLibraryParams {
    pub limit: Option<i64>,
    pub document_limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RewriteQueryParams {
    pub query: String,
    pub max_expansions: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RewriteSelectionParams {
    pub text: String,
    /// rephrase_professional | summarize_bullets | translate_sk | translate_en | custom_prompt
    pub mode: Option<String>,
    pub custom_instruction: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzePlaintextParams {
    pub text: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateLibraryParams {
    pub name: String,
    pub root_path: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TextOrDocumentParams {
    pub id: Option<String>,
    pub text: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExtractFlashcardsParams {
    pub id: Option<String>,
    pub text: Option<String>,
    pub limit: Option<i64>,
    pub include_cloze: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct StudyLimitParams {
    pub id: Option<String>,
    pub text: Option<String>,
    pub limit: Option<i64>,
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
