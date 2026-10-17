use rmcp::schemars::JsonSchema;
use serde::Deserialize;

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
pub struct SetLlmPrefsParams {
    pub enabled: Option<bool>,
    pub provider: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub use_rewrite: Option<bool>,
    pub use_answer: Option<bool>,
    pub use_plan: Option<bool>,
    pub enhance_heuristics: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LlmCompleteParams {
    pub prompt: String,
    pub system: Option<String>,
    pub temperature: Option<f64>,
    pub max_tokens: Option<i64>,
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
pub struct GrammarCheckParams {
    pub id: Option<String>,
    pub text: Option<String>,
    /// Standing grammar rules. When omitted, loads grammar teachings from scribe-agent.db.
    pub rules: Option<Vec<String>>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CompareNotesParams {
    pub id_a: Option<String>,
    pub id_b: Option<String>,
    pub text_a: Option<String>,
    pub text_b: Option<String>,
    pub title_a: Option<String>,
    pub title_b: Option<String>,
}
