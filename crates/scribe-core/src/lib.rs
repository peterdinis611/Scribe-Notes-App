pub mod compile;
pub mod dates;
pub mod db;
pub mod diff;
pub mod enhance;
pub mod html;
pub mod journal;
pub mod manuscripts;
pub mod nlp;
pub mod office_import;
pub mod path;
pub mod plain_text;
pub mod store;
pub mod store_ext;
pub mod tags;
pub mod tasks;
pub mod vault;
pub mod wiki;

pub use compile::merge_chapters;
pub use dates::{date_key_bounds, date_key_bounds_ms, extract_due_hint, parse_date_key};
pub use enhance::{decode_bytes, enhance_status, fuzzy_extract, fuzzy_ratio, EnhanceStatus};
pub use diff::{diff_lines, DiffLine, DiffLineType, DiffResult};
pub use html::{escape_html, tiptap_to_html};
pub use journal::{JournalNote, JournalSlot, JournalSummary, JournalSummaryInput};
pub use office_import::{docx_bytes_to_tiptap, xlsx_bytes_to_tiptap};
pub use plain_text::{tiptap_to_markdown, tiptap_to_plain_text};
pub use store::{search_library, sync_sidecar_backend};
pub use tags::{add_document_tag, remove_document_tag, IdTags};
pub use wiki::{
    list_stub_documents, list_unresolved_wiki_links, wiki_health, OrphanDocument, StubDocument,
    UnresolvedWikiLink, WikiHealth,
};
pub use manuscripts::{list_manuscripts, upsert_manuscript, ManuscriptRecord};
pub use vault::{
    content_is_vault_cipher, document_is_vault, require_document_not_vault, vault_document_ids_among,
    McpVaultScope, ERR_VAULT_DENIED, ERR_VAULT_NLP, VAULT_CONTENT_MARKER,
};
