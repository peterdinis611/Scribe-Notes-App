use rmcp::schemars::JsonSchema;
use serde::Deserialize;

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
#[serde(rename_all = "camelCase")]
pub struct CreateNamedRevisionParams {
    pub document_id: String,
    pub label: String,
    /// Default true (keeps the snapshot when unpinned ones are pruned).
    pub pinned: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RenameDocumentRevisionParams {
    pub revision_id: String,
    pub label: Option<String>,
    pub pinned: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportPathAsNoteParams {
    /// Relative path under the library `files/` sandbox (e.g. `inbox/report.pdf`).
    pub path: String,
    pub title: Option<String>,
    pub folder_id: Option<String>,
    /// When true (default), run antivirus gate before import when ClamAV is available.
    pub scan: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportFolderAsNotesParams {
    /// Relative directory under `files/` (e.g. `inbox/` or `projects/docs`). Empty = files root.
    pub path: Option<String>,
    /// Library folder id for all created notes.
    pub folder_id: Option<String>,
    pub scan: Option<bool>,
    /// Soft cap (default 500, max 500).
    pub limit: Option<i64>,
    /// Max directory depth (default 12).
    pub max_depth: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportBytesAsNoteParams {
    /// Filename with extension used for format detection (e.g. `notes.md`).
    pub file_name: String,
    /// Base64-encoded file bytes (max ~12 MB decoded).
    pub content_base64: String,
    pub title: Option<String>,
    pub folder_id: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportBackupParams {
    /// Absolute path to an unencrypted `scribe-backup-*.zip`.
    pub path: String,
    /// Must be `true` — replaces local `scribe.db` + documents tree.
    pub confirm: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScanImportPathParams {
    /// Relative path under `files/` sandbox.
    pub path: String,
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
