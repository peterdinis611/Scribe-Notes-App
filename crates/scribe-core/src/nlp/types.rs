use serde::{Deserialize, Serialize};

pub const DEFAULT_REWRITE_MODE: &str = "rephrase_professional";

pub const REWRITE_MODES: &[&str] = &[
    "rephrase_professional",
    "summarize_bullets",
    "translate_sk",
    "translate_en",
    "custom_prompt",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpKeyword {
    pub term: String,
    pub score: f64,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpOutlineItem {
    pub title: String,
    pub level: i64,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpDateEvent {
    pub text: String,
    pub kind: String,
    pub resolved_date: Option<String>,
}

/// Flattened document analysis — same shape as the app insights panel.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpDocumentAnalysis {
    pub language: String,
    pub language_confidence: f64,
    pub keywords: Vec<NlpKeyword>,
    pub keyphrases: Vec<String>,
    pub outline: Vec<NlpOutlineItem>,
    pub summary: Option<String>,
    pub suggested_title: Option<String>,
    pub readability_label: Option<String>,
    pub reading_time_minutes: Option<f64>,
    pub flesch: Option<f64>,
    pub tone: Option<String>,
    pub tone_score: Option<f64>,
    pub wiki_links: Vec<String>,
    pub mentions: Vec<String>,
    pub hosts: Vec<String>,
    pub dates: Vec<NlpDateEvent>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub summary_bullets: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suggested_slug: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub open_task_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpRewriteResult {
    pub output: String,
    pub mode: String,
    pub original: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpKeywordsResult {
    pub keywords: Vec<NlpKeyword>,
    pub keyphrases: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpSentiment {
    pub label: String,
    pub score: f64,
    #[serde(default)]
    pub positive_hits: i64,
    #[serde(default)]
    pub negative_hits: i64,
    #[serde(default)]
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpLanguage {
    pub language: String,
    #[serde(default)]
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpReadingStats {
    pub readability_label: String,
    pub reading_time_minutes: f64,
    pub flesch: f64,
    #[serde(default)]
    pub word_count: i64,
    #[serde(default)]
    pub sentence_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpTitleSuggestion {
    pub title: String,
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpQueryRewrite {
    pub query: String,
    pub rewritten: String,
    #[serde(default)]
    pub expansions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpSpellIssue {
    pub word: String,
    #[serde(default)]
    pub offset: i64,
    #[serde(default)]
    pub suggestions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpSpellcheck {
    pub language: String,
    #[serde(default)]
    pub issues: Vec<NlpSpellIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpEntity {
    pub text: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpEntities {
    pub entities: Vec<NlpEntity>,
    #[serde(default)]
    pub tag_suggestions: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpMentionLink {
    pub label: String,
    pub href: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpMentionEdge {
    pub kind: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpMentions {
    #[serde(default)]
    pub wiki_links: Vec<String>,
    #[serde(default)]
    pub mentions: Vec<String>,
    #[serde(default)]
    pub hosts: Vec<String>,
    #[serde(default)]
    pub markdown_links: Vec<NlpMentionLink>,
    #[serde(default)]
    pub edges: Vec<NlpMentionEdge>,
    #[serde(default)]
    pub edge_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpExtractedTask {
    pub text: String,
    pub checked: bool,
    pub source: String,
    pub due_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpTasks {
    pub tasks: Vec<NlpExtractedTask>,
    pub open_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpOutline {
    pub items: Vec<NlpOutlineItem>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpDates {
    pub events: Vec<NlpDateEvent>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpSummary {
    pub summary: String,
    #[serde(default)]
    pub bullets: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpDiffSummary {
    pub summary: String,
    #[serde(default)]
    pub added_sentences: Vec<String>,
    #[serde(default)]
    pub removed_sentences: Vec<String>,
    #[serde(default)]
    pub gained_terms: Vec<String>,
    #[serde(default)]
    pub lost_terms: Vec<String>,
    #[serde(default)]
    pub change_ratio: f64,
    #[serde(default)]
    pub old_word_count: i64,
    #[serde(default)]
    pub new_word_count: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub document_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revision_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpCitation {
    pub document_id: String,
    pub title: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpAnswer {
    pub answer: String,
    #[serde(default)]
    pub citations: Vec<NlpCitation>,
    #[serde(default)]
    pub sentences: Vec<String>,
    #[serde(default)]
    pub followups: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hit_count: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub document_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpWikiSuggestion {
    pub phrase: String,
    pub document_id: String,
    pub title: String,
    #[serde(default)]
    pub score: f64,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpWikiSuggestions {
    pub suggestions: Vec<NlpWikiSuggestion>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpOrganizeSuggestion {
    pub folder_id: String,
    pub name: String,
    #[serde(default)]
    pub score: f64,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpOrganize {
    #[serde(default)]
    pub suggestions: Vec<NlpOrganizeSuggestion>,
    #[serde(default)]
    pub count: i64,
    pub best_folder_id: Option<String>,
    pub best_folder_name: Option<String>,
    #[serde(default)]
    pub create_new: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub document_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_folder_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub current_tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpDuplicatePair {
    pub left_id: String,
    pub left_title: String,
    pub right_id: String,
    pub right_title: String,
    #[serde(default)]
    pub score: f64,
    #[serde(default)]
    pub jaccard: f64,
    #[serde(default)]
    pub embed_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpDuplicates {
    #[serde(default)]
    pub pairs: Vec<NlpDuplicatePair>,
    #[serde(default)]
    pub compared: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpTemplateHints {
    #[serde(default)]
    pub expected: Vec<String>,
    #[serde(default)]
    pub present: Vec<String>,
    #[serde(default)]
    pub missing: Vec<String>,
    #[serde(default)]
    pub coverage: f64,
    #[serde(default)]
    pub complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpLibraryReport {
    pub markdown: String,
    #[serde(default)]
    pub stats: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpChunks {
    #[serde(default)]
    pub chunks: Vec<String>,
    #[serde(default)]
    pub count: i64,
}

pub fn normalize_rewrite_mode(mode: Option<&str>) -> String {
    match mode
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_REWRITE_MODE)
        .to_ascii_lowercase()
        .as_str()
    {
        "rephrase" | "professional" | "rephrase_professional" => {
            "rephrase_professional".to_string()
        }
        "summarize" | "shorten" | "summarize_bullets" => "summarize_bullets".to_string(),
        "sk" | "translate_sk" => "translate_sk".to_string(),
        "en" | "translate_en" => "translate_en".to_string(),
        "custom" | "custom_prompt" => "custom_prompt".to_string(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrite_mode_aliases_match_sidecar() {
        assert_eq!(normalize_rewrite_mode(None), "rephrase_professional");
        assert_eq!(normalize_rewrite_mode(Some("shorten")), "summarize_bullets");
        assert_eq!(normalize_rewrite_mode(Some("custom")), "custom_prompt");
        assert_eq!(normalize_rewrite_mode(Some("sk")), "translate_sk");
        assert_eq!(
            normalize_rewrite_mode(Some("rephrase_professional")),
            "rephrase_professional"
        );
    }
}
