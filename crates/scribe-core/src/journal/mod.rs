//! Journal notes: slots, folder, get-or-create, document loading for summaries.

mod load;
mod notes;
mod types;

pub use load::load_journal_documents;
pub use notes::{create_journal_note, find_journal_note, resolve_journal_date};
pub use types::{JournalNote, JournalSlot, JournalSummary, JournalSummaryInput};
