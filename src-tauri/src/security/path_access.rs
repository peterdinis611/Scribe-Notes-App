use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::storage;

pub struct PathAccessGate {
    granted: Mutex<HashSet<PathBuf>>,
}

impl PathAccessGate {
    pub fn new() -> Self {
        Self {
            granted: Mutex::new(HashSet::new()),
        }
    }

    pub fn grant(&self, path: &Path) {
        let Ok(canonical) = canonicalize_path(path) else {
            return;
        };

        let mut guard = match self.granted.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };

        guard.insert(canonical.clone());
        if let Some(parent) = canonical.parent() {
            guard.insert(parent.to_path_buf());
        }
    }

    pub fn validate_read(
        &self,
        app: &AppHandle,
        conn: &Connection,
        path: &Path,
    ) -> Result<PathBuf, String> {
        let canonical = canonicalize_path(path)?;
        let roots = allowed_roots(app, conn)?;

        if is_within_allowed_roots(&canonical, &roots) || self.is_granted(&canonical) {
            return Ok(canonical);
        }

        Err(format!(
            "Prístup k súboru zamietnutý: {}",
            path.display()
        ))
    }

    pub fn validate_reveal(
        &self,
        app: &AppHandle,
        conn: &Connection,
        path: &Path,
    ) -> Result<PathBuf, String> {
        self.validate_read(app, conn, path)
    }

    pub fn validate_temp_file(path: &Path) -> Result<PathBuf, String> {
        let canonical = canonicalize_path(path)?;
        let temp_dir = canonicalize_path(&std::env::temp_dir())?;
        if canonical.starts_with(&temp_dir) {
            Ok(canonical)
        } else {
            Err("Dočasný import súbor mimo temp priečinka.".to_string())
        }
    }

    fn is_granted(&self, canonical: &Path) -> bool {
        let Ok(guard) = self.granted.lock() else {
            return false;
        };

        guard
            .iter()
            .any(|granted| canonical.starts_with(granted) || granted.starts_with(canonical))
    }
}

pub fn safe_join_under(base: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.is_empty() {
        return Err("Prázdna relatívna cesta v archíve.".to_string());
    }

    if relative.contains('\\') {
        return Err("Neplatná cesta v archíve.".to_string());
    }

    let rel_path = Path::new(relative);
    for component in rel_path.components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err("Neplatná cesta v archíve.".to_string()),
        }
    }

    let base = canonicalize_path(base)?;
    let mut target = base.clone();
    for component in rel_path.components() {
        if let Component::Normal(part) = component {
            target.push(part);
        }
    }

    if !target.starts_with(&base) {
        return Err("Cesta v archíve smeruje mimo povolený priečinok.".to_string());
    }

    Ok(target)
}

fn allowed_roots(app: &AppHandle, conn: &Connection) -> Result<Vec<PathBuf>, String> {
    let mut roots = Vec::new();

    roots.push(canonicalize_path(&std::env::temp_dir())?);

    if let Ok(app_data) = app.path().app_data_dir() {
        if app_data.exists() {
            roots.push(canonicalize_path(&app_data)?);
        } else {
            roots.push(app_data);
        }
    }

    if let Ok(documents_dir) = storage::get_documents_dir(app, conn) {
        if documents_dir.exists() {
            roots.push(canonicalize_path(&documents_dir)?);
        } else {
            roots.push(documents_dir);
        }
    }

    Ok(roots)
}

fn is_within_allowed_roots(path: &Path, roots: &[PathBuf]) -> bool {
    roots.iter().any(|root| path.starts_with(root))
}

fn canonicalize_path(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return path
            .canonicalize()
            .map_err(|error| format!("Nepodarilo sa rozpoznať cestu {}: {error}", path.display()));
    }

    let Some(parent) = path.parent() else {
        return Err(format!("Neplatná cesta: {}", path.display()));
    };

    if parent.as_os_str().is_empty() {
        return Ok(path.to_path_buf());
    }

    if !parent.exists() {
        return Err(format!("Cesta neexistuje: {}", path.display()));
    }

    let canonical_parent = parent
        .canonicalize()
        .map_err(|error| format!("Nepodarilo sa rozpoznať cestu {}: {error}", path.display()))?;

    let Some(file_name) = path.file_name() else {
        return Ok(canonical_parent);
    };

    Ok(canonical_parent.join(file_name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("scribe-path-access-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn safe_join_rejects_parent_traversal() {
        let base = temp_dir();
        assert!(safe_join_under(&base, "../escape.txt").is_err());
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn safe_join_allows_nested_file() {
        let base = temp_dir();
        let target = safe_join_under(&base, "notes/report.scribe").unwrap();
        assert!(target.starts_with(canonicalize_path(&base).unwrap()));
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn validate_temp_file_allows_temp_paths() {
        let file = temp_dir().join("import.docx");
        fs::write(&file, b"test").unwrap();
        let validated = PathAccessGate::validate_temp_file(&file).unwrap();
        assert_eq!(validated, canonicalize_path(&file).unwrap());
        let _ = fs::remove_dir_all(file.parent().unwrap());
    }
}
