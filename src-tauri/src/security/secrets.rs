//! OS keychain / Secret Service for sensitive app secrets.

use keyring::Entry;

const SERVICE: &str = "com.scribe.app";
const AUTO_BACKUP_USER: &str = "auto-backup-password";

fn entry(user: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, user).map_err(|e| format!("Keychain unavailable: {e}"))
}

/// Read the auto-backup AES password from the OS keychain.
pub fn get_auto_backup_password() -> Option<String> {
    let entry = entry(AUTO_BACKUP_USER).ok()?;
    entry
        .get_password()
        .ok()
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
}

/// Store or clear the auto-backup AES password in the OS keychain.
pub fn set_auto_backup_password(password: Option<&str>) -> Result<(), String> {
    let entry = entry(AUTO_BACKUP_USER)?;
    match password.map(str::trim).filter(|p| !p.is_empty()) {
        Some(pw) => entry
            .set_password(pw)
            .map_err(|e| format!("Could not store backup password: {e}")),
        None => {
            // delete_credential fails if missing — ignore.
            let _ = entry.delete_credential();
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn service_constants_are_stable() {
        assert_eq!(super::SERVICE, "com.scribe.app");
        assert_eq!(super::AUTO_BACKUP_USER, "auto-backup-password");
    }
}
