//! Local admin gate for viewing audit logs (password hash in meta).

use rusqlite::Connection;
use sha2::{Digest, Sha256};

const ADMIN_SALT_KEY: &str = "admin_salt";
const ADMIN_HASH_KEY: &str = "admin_password_hash";

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

fn hash_password(salt: &str, password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(salt.as_bytes());
    hasher.update(b"|");
    hasher.update(password.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn admin_is_configured(conn: &Connection) -> Result<bool, String> {
    Ok(meta_get(conn, ADMIN_HASH_KEY)?.is_some())
}

pub fn setup_admin_password(conn: &Connection, password: &str) -> Result<(), String> {
    let trimmed = password.trim();
    if trimmed.chars().count() < 4 {
        return Err("admin password must be at least 4 characters".into());
    }
    if admin_is_configured(conn)? {
        return Err("admin password already configured".into());
    }
    let salt = uuid::Uuid::new_v4().to_string();
    let hash = hash_password(&salt, trimmed);
    meta_set(conn, ADMIN_SALT_KEY, &salt)?;
    meta_set(conn, ADMIN_HASH_KEY, &hash)?;
    Ok(())
}

pub fn verify_admin_password(conn: &Connection, password: &str) -> Result<bool, String> {
    let Some(salt) = meta_get(conn, ADMIN_SALT_KEY)? else {
        return Ok(false);
    };
    let Some(expected) = meta_get(conn, ADMIN_HASH_KEY)? else {
        return Ok(false);
    };
    let actual = hash_password(&salt, password.trim());
    // Constant-time-ish compare for equal length hex.
    Ok(actual.len() == expected.len()
        && actual
            .bytes()
            .zip(expected.bytes())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0)
}

pub fn change_admin_password(
    conn: &Connection,
    current: &str,
    next: &str,
) -> Result<(), String> {
    if !verify_admin_password(conn, current)? {
        return Err("current admin password is incorrect".into());
    }
    let trimmed = next.trim();
    if trimmed.chars().count() < 4 {
        return Err("admin password must be at least 4 characters".into());
    }
    let salt = uuid::Uuid::new_v4().to_string();
    let hash = hash_password(&salt, trimmed);
    meta_set(conn, ADMIN_SALT_KEY, &salt)?;
    meta_set(conn, ADMIN_HASH_KEY, &hash)?;
    Ok(())
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
        change_admin_password(&db.conn, "scribe-admin", "new-pass").unwrap();
        assert!(verify_admin_password(&db.conn, "new-pass").unwrap());
    }
}
