//! Reusable Dioxus chrome primitives for `scribe-ui` surfaces.
//!
//! Gated behind the `dioxus` feature — domain modules stay framework-free.
//! Surfaces compose these instead of raw markup so chrome stays consistent.

mod actions;
mod button;
mod folio;
mod panel;

pub use actions::SuiActions;
pub use button::{SuiButton, SuiButtonVariant};
pub use folio::{
    FolioCount, FolioFoot, FolioHead, FolioKicker, FolioLead, FolioMargin, FolioNumeral, FolioPage,
    FolioRoot, FolioShell, FolioTags, FolioTitle,
};
pub use panel::{SuiCard, SuiLinkButton, SuiMetaRow, SuiPanel};
