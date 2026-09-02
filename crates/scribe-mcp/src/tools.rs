use schemars::JsonSchema;
use serde::Deserialize;

pub fn json<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|error| error.to_string())
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SearchParams {
    pub query: String,
    pub limit: Option<i64>,
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
