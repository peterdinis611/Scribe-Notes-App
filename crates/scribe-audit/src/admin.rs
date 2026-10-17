//! Local admin gate for viewing audit logs (password hash in meta).
//!
//! Hash scheme v2: 120_000× SHA-256 (salted). Legacy v1 (single SHA-256) still verifies
//! once, then re-hashes to v2 on successful unlock / password change.

use rusqlite::Connection;
use sha2::{Digest, Sha256};

const ADMIN_SALT_KEY: &str = "admin_salt";
const ADMIN_HASH_KEY: &str = "admin_password_hash";
const ADMIN_HASH_VERSION_KEY: &str = "admin_hash_version";
const HASH_VERSION_V1: &str = "1";
const HASH_VERSION_V2: &str = "2";
const PBKDF_ITERS: u32 = 120_000;
pub const MIN_PASSWORD_CHARS: usize = 8;

fn meta_get(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare("SELECT value FROM meta WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([key]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(Some(row.get(0).map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}

fn meta_set(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
        [key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn hash_password_v1(salt: &str, password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(salt.as_bytes());
    hasher.update(b"|");
    hasher.update(password.as_bytes());
    hex::encode(hasher.finalize())
}

/// Iterated salted SHA-256 (no extra crates; stronger than single-pass v1).
fn hash_password_v2(salt: &str, password: &str) -> String {
    let mut dig = {
        let mut hasher = Sha256::new();
        hasher.update(salt.as_bytes());
        hasher.update(b"|v2|");
        hasher.update(password.as_bytes());
        hasher.finalize()
    };
    for _ in 1..PBKDF_ITERS {
        let mut hasher = Sha256::new();
        hasher.update(dig);
        hasher.update(password.as_bytes());
        dig = hasher.finalize();
    }
    hex::encode(dig)
}

fn ct_eq_hex(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.bytes()
            .zip(b.bytes())
            .fold(0u8, |acc, (x, y)| acc | (x ^ y))
            == 0
}

pub fn admin_is_configured(conn: &Connection) -> Result<bool, String> {
    Ok(meta_get(conn, ADMIN_HASH_KEY)?.is_some())
}

fn validate_password(password: &str) -> Result<&str, String> {
    let trimmed = password.trim();
    if trimmed.chars().count() < MIN_PASSWORD_CHARS {
        return Err(format!(
            "admin password must be at least {MIN_PASSWORD_CHARS} characters"
        ));
    }
    Ok(trimmed)
}

fn store_password(conn: &Connection, password: &str) -> Result<(), String> {
    let salt = uuid::Uuid::new_v4().to_string();
    let hash = hash_password_v2(&salt, password);
    meta_set(conn, ADMIN_SALT_KEY, &salt)?;
    meta_set(conn, ADMIN_HASH_KEY, &hash)?;
    meta_set(conn, ADMIN_HASH_VERSION_KEY, HASH_VERSION_V2)?;
    Ok(())
}

pub fn setup_admin_password(conn: &Connection, password: &str) -> Result<(), String> {
    let trimmed = validate_password(password)?;
    if admin_is_configured(conn)? {
        return Err("admin password already configured".into());
    }
    store_password(conn, trimmed)
}

pub fn verify_admin_password(conn: &Connection, password: &str) -> Result<bool, String> {
    let Some(salt) = meta_get(conn, ADMIN_SALT_KEY)? else {
        return Ok(false);
    };
    let Some(expected) = meta_get(conn, ADMIN_HASH_KEY)? else {
        return Ok(false);
    };
    let version = meta_get(conn, ADMIN_HASH_VERSION_KEY)?.unwrap_or_else(|| HASH_VERSION_V1.into());
    let trimmed = password.trim();
    let ok = match version.as_str() {
        HASH_VERSION_V2 => ct_eq_hex(&hash_password_v2(&salt, trimmed), &expected),
        _ => ct_eq_hex(&hash_password_v1(&salt, trimmed), &expected),
    };
    if ok && version != HASH_VERSION_V2 {
        // Upgrade legacy hash after successful unlock.
        let _ = store_password(conn, trimmed);
    }
    Ok(ok)
}

pub fn change_admin_password(
    conn: &Connection,
    current: &str,
    next: &str,
) -> Result<(), String> {
    if !verify_admin_password(conn, current)? {
        return Err("current admin password is incorrect".into());
    }
    let trimmed = validate_password(next)?;
    store_password(conn, trimmed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_audit_db_memory;

    #[test]
    fn setup_and_verify_admin() {
        let db = open_audit_db_memory().unwrap();
        assert!(!admin_is_configured(&db.conn).unwrap());
        setup_admin_password(&db.conn, "scribe-admin").unwrap();
        assert!(admin_is_configured(&db.conn).unwrap());
        assert!(verify_admin_password(&db.conn, "scribe-admin").unwrap());
        assert!(!verify_admin_password(&db.conn, "wrong").unwrap());
        change_admin_password(&db.conn, "scribe-admin", "new-pass-ok").unwrap();
        assert!(verify_admin_password(&db.conn, "new-pass-ok").unwrap());
    }

    #[test]
    fn rejects_short_password() {
        let db = open_audit_db_memory().unwrap();
        assert!(setup_admin_password(&db.conn, "short").is_err());
    }

    #[test]
    fn upgrades_v1_hash_on_verify() {
        let db = open_audit_db_memory().unwrap();
        let salt = "test-salt";
        let password = "legacy-password";
        meta_set(&db.conn, ADMIN_SALT_KEY, salt).unwrap();
        meta_set(
            &db.conn,
            ADMIN_HASH_KEY,
            &hash_password_v1(salt, password),
        )
        .unwrap();
        meta_set(&db.conn, ADMIN_HASH_VERSION_KEY, HASH_VERSION_V1).unwrap();
        assert!(verify_admin_password(&db.conn, password).unwrap());
        assert_eq!(
            meta_get(&db.conn, ADMIN_HASH_VERSION_KEY).unwrap().as_deref(),
            Some(HASH_VERSION_V2)
        );
        assert!(verify_admin_password(&db.conn, password).unwrap());
    }
}
