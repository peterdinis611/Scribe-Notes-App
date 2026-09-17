//! Vault access policy for encrypted notes (`scribe-vault-v1`).
//!
//! Ciphertext lives in SQLite; the unlock password never leaves the app UI.
//! NLP and MCP must treat vault notes as denied / metadata-only unless
//! `SCRIBE_MCP_SCOPE=full`.

use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashSet;
use std::env;

/// Marker embedded in TipTap `content_json` for AES-GCM vault payloads.
pub const VAULT_CONTENT_MARKER: &str = "\"type\":\"scribe-vault-v1\"";

pub const ERR_VAULT_DENIED: &str = "access.vaultDenied";
pub const ERR_VAULT_NLP: &str =
    "Encrypted vault notes are not available to Local AI from the database";

/// How MCP (and similar local agents) may touch vault documents.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpVaultScope {
    /// Exclude vault notes from body access and search hits (default).
    NoVault,
    /// Vault notes may appear as id/title/folder only — never body or ciphertext.
    MetaOnly,
    /// Allow raw vault payloads (titles + ciphertext JSON). Prefer not to use.
    Full,
}

impl McpVaultScope {
    pub fn from_env() -> Self {
        match env::var("SCRIBE_MCP_SCOPE")
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "full" => Self::Full,
            "meta-only" | "meta" | "metadata" => Self::MetaOnly,
            _ => Self::NoVault,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::NoVault => "no-vault",
            Self::MetaOnly => "meta-only",
            Self::Full => "full",
        }
    }

    pub fn allows_vault_body(self) -> bool {
        matches!(self, Self::Full)
    }

    pub fn allows_vault_meta(self) -> bool {
        matches!(self, Self::MetaOnly | Self::Full)
    }
}

pub fn content_is_vault_cipher(content_json: &str) -> bool {
    content_json.contains(VAULT_CONTENT_MARKER)
}

/// True when the note sits in a vault folder or its body is ciphertext.
pub fn document_is_vault(conn: &Connection, document_id: &str) -> Result<bool, String> {
    let row: Option<(i64, String)> = conn
        .query_row(
            "SELECT COALESCE(f.is_vault, 0), d.content_json
             FROM documents d
             LEFT JOIN folders f ON f.id = d.folder_id
             WHERE d.id = ?1 AND d.deleted_at IS NULL",
            params![document_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let Some((is_vault, content_json)) = row else {
        return Ok(false);
    };
    Ok(is_vault != 0 || content_is_vault_cipher(&content_json))
}

pub fn require_document_not_vault(conn: &Connection, document_id: &str) -> Result<(), String> {
    if document_is_vault(conn, document_id)? {
        return Err(ERR_VAULT_NLP.to_string());
    }
    Ok(())
}

/// IDs among `ids` that are vault / ciphertext notes.
pub fn vault_document_ids_among(
    conn: &Connection,
    ids: &[String],
) -> Result<HashSet<String>, String> {
    let mut out = HashSet::new();
    for id in ids {
        if document_is_vault(conn, id)? {
            out.insert(id.clone());
        }
    }
    Ok(out)
}

pub fn mcp_vault_denied_message(scope: McpVaultScope) -> String {
    format!(
        "Vault document access denied (SCRIBE_MCP_SCOPE={})",
        scope.as_str()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::{in_memory_conn, seed_document, seed_folder};

    #[test]
    fn detects_cipher_and_vault_folder() {
        let conn = in_memory_conn();
        seed_folder(&conn, "f1", "Vault", None);
        conn.execute("UPDATE folders SET is_vault = 1 WHERE id = 'f1'", [])
            .unwrap();
        seed_document(
            &conn,
            "d1",
            "Secret",
            r#"{"type":"scribe-vault-v1","iv":"x","salt":"y","ct":"z"}"#,
            Some("f1"),
        );
        seed_document(
            &conn,
            "d2",
            "Open",
            r#"{"type":"doc","content":[{"type":"paragraph"}]}"#,
            None,
        );

        assert!(document_is_vault(&conn, "d1").unwrap());
        assert!(!document_is_vault(&conn, "d2").unwrap());
        assert_eq!(McpVaultScope::from_env(), McpVaultScope::NoVault);
    }

    #[test]
    fn vault_ids_among_filters() {
        let conn = in_memory_conn();
        seed_folder(&conn, "f1", "Vault", None);
        conn.execute("UPDATE folders SET is_vault = 1 WHERE id = 'f1'", [])
            .unwrap();
        seed_document(
            &conn,
            "v1",
            "A",
            r#"{"type":"scribe-vault-v1","iv":"a","salt":"b","ct":"c"}"#,
            Some("f1"),
        );
        seed_document(
            &conn,
            "n1",
            "B",
            r#"{"type":"doc","content":[]}"#,
            None,
        );
        let ids = vault_document_ids_among(
            &conn,
            &["v1".into(), "n1".into(), "missing".into()],
        )
        .unwrap();
        assert!(ids.contains("v1"));
        assert!(!ids.contains("n1"));
    }
}
