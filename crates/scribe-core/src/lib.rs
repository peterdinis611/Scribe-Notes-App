pub mod compile;
pub mod dates;
pub mod db;
pub mod diff;
pub mod html;
pub mod manuscripts;
pub mod nlp;
pub mod office_import;
pub mod path;
pub mod plain_text;
pub mod store;
pub mod store_ext;
pub mod tasks;
pub mod vault;

pub use compile::merge_chapters;
pub use dates::{date_key_bounds, date_key_bounds_ms, extract_due_hint, parse_date_key};
pub use diff::{diff_lines, DiffLine, DiffLineType, DiffResult};
pub use html::tiptap_to_html;
pub use office_import::{docx_bytes_to_tiptap, xlsx_bytes_to_tiptap};
pub use store::{add_document_tag, remove_document_tag, search_library, sync_sidecar_backend};
pub use manuscripts::{list_manuscripts, upsert_manuscript, ManuscriptRecord};
pub use vault::{
    content_is_vault_cipher, document_is_vault, require_document_not_vault, vault_document_ids_among,
    McpVaultScope, ERR_VAULT_DENIED, ERR_VAULT_NLP, VAULT_CONTENT_MARKER,
};
