//! User-configurable toast preferences and stacking logic for Scribe.
//!
//! Pure domain crate — no Tauri / DOM. FE mirrors settings in
//! `src/lib/toast/settings.ts`; hosts call [`normalize_toast_settings`] /
//! [`apply_stack`] so behavior stays consistent across app and MCP.

mod logic;
mod settings;

pub use logic::{
    apply_stack, position_class, resolve_duration, should_show_variant, ToastRecord, ToastVariant,
};
pub use settings::{
    default_toast_settings, normalize_toast_settings, toast_settings_from_json, ToastPosition,
    ToastSettings, ToastStackBehavior,
};
