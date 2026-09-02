pub mod db;
pub mod nlp;
pub mod path;
pub mod plain_text;
pub mod store;
pub mod tasks;

pub use store::{add_document_tag, remove_document_tag, search_library, sync_sidecar_backend};
