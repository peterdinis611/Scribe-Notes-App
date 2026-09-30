//! Sandboxed file/folder store under `{documentsDir}/files/`.
//!
//! Paths in the public API are relative to that root (POSIX `/`), never `..`.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const FILES_DIR_NAME: &str = "files";
/// Soft cap for a single write (100 MiB). Raise later if needed.
pub const MAX_WRITE_BYTES: usize = 100 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StorageEntryKind {
    File,
    Dir,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageEntry {
    pub path: String,
    pub name: String,
    pub kind: StorageEntryKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<i64>,
}

#[derive(Debug, Clone, Default)]
pub struct ListOpts {
    pub path: Option<String>,
    pub recursive: bool,
    pub depth: Option<u32>,
}

fn normalize_rel(relative: &str) -> String {
    relative.trim().trim_start_matches('/').replace('\\', "/")
}

/// Ensure `{documentsDir}/files` exists and return it.
pub fn ensure_files_root(documents_dir: &Path) -> Result<PathBuf, String> {
    let root = documents_dir.join(FILES_DIR_NAME);
    fs::create_dir_all(&root).map_err(|e| format!("Cannot create files root: {e}"))?;
    Ok(root)
}

/// Join a relative path under `base`, rejecting `..` and absolute segments.
pub fn safe_join_under(base: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = normalize_rel(relative);
    if relative.is_empty() {
        return Err("Empty relative path".to_string());
    }
    if relative.contains('\\') {
        return Err("Invalid path".to_string());
    }

    let rel_path = Path::new(&relative);
    for component in rel_path.components() {
        match component {
            Component::Normal(part) => {
                let s = part.to_string_lossy();
                if s.is_empty() || s == "." || s == ".." {
                    return Err("Invalid path component".to_string());
                }
            }
            _ => return Err("Invalid path".to_string()),
        }
    }

    let base = canonicalize_existing(base)?;
    let mut target = base.clone();
    for component in rel_path.components() {
        if let Component::Normal(part) = component {
            target.push(part);
        }
    }

    if !target.starts_with(&base) {
        return Err("Path escapes files root".to_string());
    }
    Ok(target)
}

fn canonicalize_existing(path: &Path) -> Result<PathBuf, String> {
    fs::canonicalize(path).map_err(|e| format!("Cannot resolve path {}: {e}", path.display()))
}

/// Resolve `relative` under files root. Empty / `.` → root itself.
pub fn resolve_files_path(documents_dir: &Path, relative: &str) -> Result<PathBuf, String> {
    let root = ensure_files_root(documents_dir)?;
    let relative = normalize_rel(relative);
    if relative.is_empty() || relative == "." {
        return Ok(root);
    }
    safe_join_under(&root, &relative)
}

fn relative_from_root(root: &Path, absolute: &Path) -> Result<String, String> {
    let root = canonicalize_existing(root)?;
    let abs = if absolute.exists() {
        canonicalize_existing(absolute)?
    } else {
        absolute.to_path_buf()
    };
    let rel = abs
        .strip_prefix(&root)
        .map_err(|_| "Path outside files root".to_string())?;
    let s = rel.to_string_lossy().replace('\\', "/");
    Ok(s)
}

fn modified_at_secs(meta: &fs::Metadata) -> Option<i64> {
    meta.modified().ok().and_then(|t| {
        t.duration_since(UNIX_EPOCH)
            .ok()
            .map(|d| d.as_secs() as i64)
    })
}

fn entry_from_path(root: &Path, absolute: &Path) -> Result<StorageEntry, String> {
    let meta = fs::metadata(absolute).map_err(|e| e.to_string())?;
    let name = absolute
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let path = relative_from_root(root, absolute)?;
    let kind = if meta.is_dir() {
        StorageEntryKind::Dir
    } else {
        StorageEntryKind::File
    };
    Ok(StorageEntry {
        path,
        name,
        kind,
        size_bytes: if meta.is_file() {
            Some(meta.len())
        } else {
            None
        },
        modified_at: modified_at_secs(&meta),
    })
}

fn root_entry(root: &Path) -> StorageEntry {
    let meta = fs::metadata(root).ok();
    StorageEntry {
        path: String::new(),
        name: FILES_DIR_NAME.to_string(),
        kind: StorageEntryKind::Dir,
        size_bytes: None,
        modified_at: meta.as_ref().and_then(modified_at_secs),
    }
}

/// Stat a path relative to `files/` (empty = root).
pub fn stat(documents_dir: &Path, relative: &str) -> Result<StorageEntry, String> {
    let root = ensure_files_root(documents_dir)?;
    let relative = normalize_rel(relative);
    if relative.is_empty() || relative == "." {
        return Ok(root_entry(&root));
    }
    let abs = safe_join_under(&root, &relative)?;
    if !abs.exists() {
        return Err(format!("Not found: {relative}"));
    }
    entry_from_path(&root, &abs)
}

/// List directory entries. Non-recursive by default.
pub fn list(documents_dir: &Path, opts: ListOpts) -> Result<Vec<StorageEntry>, String> {
    let root = ensure_files_root(documents_dir)?;
    let rel = opts.path.as_deref().unwrap_or("");
    let abs = resolve_files_path(documents_dir, rel)?;
    if !abs.is_dir() {
        return Err(format!("Not a directory: {}", normalize_rel(rel)));
    }

    let max_depth = if opts.recursive {
        opts.depth.unwrap_or(64)
    } else {
        1
    };

    let mut out = Vec::new();
    list_dir_recursive(&root, &abs, 1, max_depth, &mut out)?;
    out.sort_by(|a, b| {
        match (&a.kind, &b.kind) {
            (StorageEntryKind::Dir, StorageEntryKind::File) => std::cmp::Ordering::Less,
            (StorageEntryKind::File, StorageEntryKind::Dir) => std::cmp::Ordering::Greater,
            _ => a.path.cmp(&b.path),
        }
    });
    Ok(out)
}

fn list_dir_recursive(
    root: &Path,
    dir: &Path,
    depth: u32,
    max_depth: u32,
    out: &mut Vec<StorageEntry>,
) -> Result<(), String> {
    if depth > max_depth {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        out.push(entry_from_path(root, &path)?);
        if meta.is_dir() && depth < max_depth {
            list_dir_recursive(root, &path, depth + 1, max_depth, out)?;
        }
    }
    Ok(())
}

/// Create a directory (and parents). Idempotent if it already exists as a dir.
pub fn mkdir(documents_dir: &Path, relative: &str) -> Result<StorageEntry, String> {
    let root = ensure_files_root(documents_dir)?;
    let relative = normalize_rel(relative);
    if relative.is_empty() {
        return Ok(root_entry(&root));
    }
    let abs = safe_join_under(&root, &relative)?;
    fs::create_dir_all(&abs).map_err(|e| format!("mkdir failed: {e}"))?;
    entry_from_path(&root, &abs)
}

/// Write file bytes. Creates parent directories.
pub fn write_file(
    documents_dir: &Path,
    relative: &str,
    data: &[u8],
    overwrite: bool,
) -> Result<StorageEntry, String> {
    if data.len() > MAX_WRITE_BYTES {
        return Err(format!(
            "File too large (max {} bytes)",
            MAX_WRITE_BYTES
        ));
    }
    let root = ensure_files_root(documents_dir)?;
    let relative = normalize_rel(relative);
    if relative.is_empty() {
        return Err("Cannot write to files root".to_string());
    }
    let abs = safe_join_under(&root, &relative)?;
    if abs.exists() {
        if abs.is_dir() {
            return Err("Path is a directory".to_string());
        }
        if !overwrite {
            return Err(format!("File exists: {relative}"));
        }
    }
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create parent: {e}"))?;
    }
    fs::write(&abs, data).map_err(|e| format!("Write failed: {e}"))?;
    entry_from_path(&root, &abs)
}

/// Read file bytes.
pub fn read_file(documents_dir: &Path, relative: &str) -> Result<Vec<u8>, String> {
    let root = ensure_files_root(documents_dir)?;
    let relative = normalize_rel(relative);
    if relative.is_empty() {
        return Err("Cannot read files root".to_string());
    }
    let abs = safe_join_under(&root, &relative)?;
    if !abs.is_file() {
        return Err(format!("Not a file: {relative}"));
    }
    fs::read(&abs).map_err(|e| format!("Read failed: {e}"))
}

/// Delete a file, or a directory when `recursive` is true.
pub fn delete(documents_dir: &Path, relative: &str, recursive: bool) -> Result<(), String> {
    let root = ensure_files_root(documents_dir)?;
    let relative = normalize_rel(relative);
    if relative.is_empty() {
        return Err("Cannot delete files root".to_string());
    }
    let abs = safe_join_under(&root, &relative)?;
    if !abs.exists() {
        return Err(format!("Not found: {relative}"));
    }
    if abs.is_dir() {
        if !recursive {
            return Err("Directory delete requires recursive=true".to_string());
        }
        fs::remove_dir_all(&abs).map_err(|e| format!("Delete failed: {e}"))?;
    } else {
        fs::remove_file(&abs).map_err(|e| format!("Delete failed: {e}"))?;
    }
    Ok(())
}

/// Rename or move within `files/`.
pub fn rename(documents_dir: &Path, from: &str, to: &str) -> Result<StorageEntry, String> {
    let root = ensure_files_root(documents_dir)?;
    let from = normalize_rel(from);
    let to = normalize_rel(to);
    if from.is_empty() || to.is_empty() {
        return Err("Invalid rename paths".to_string());
    }
    let from_abs = safe_join_under(&root, &from)?;
    let to_abs = safe_join_under(&root, &to)?;
    if !from_abs.exists() {
        return Err(format!("Not found: {from}"));
    }
    if to_abs.exists() {
        return Err(format!("Target exists: {to}"));
    }
    if let Some(parent) = to_abs.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create parent: {e}"))?;
    }
    fs::rename(&from_abs, &to_abs).map_err(|e| format!("Rename failed: {e}"))?;
    entry_from_path(&root, &to_abs)
}

/// Absolute path for reveal/open (must stay under files root).
pub fn absolute_path(documents_dir: &Path, relative: &str) -> Result<PathBuf, String> {
    resolve_files_path(documents_dir, relative)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_docs() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("scribe-storage-fs-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn rejects_path_escape() {
        let docs = temp_docs();
        let root = ensure_files_root(&docs).unwrap();
        assert!(safe_join_under(&root, "../escape.txt").is_err());
        assert!(safe_join_under(&root, "a/../../x").is_err());
        let _ = fs::remove_dir_all(&docs);
    }

    #[test]
    fn mkdir_write_list_read_delete() {
        let docs = temp_docs();
        mkdir(&docs, "inbox").unwrap();
        write_file(&docs, "inbox/hello.txt", b"hi", false).unwrap();
        let listed = list(
            &docs,
            ListOpts {
                path: Some("inbox".into()),
                recursive: false,
                depth: None,
            },
        )
        .unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].path, "inbox/hello.txt");
        assert_eq!(read_file(&docs, "inbox/hello.txt").unwrap(), b"hi");
        rename(&docs, "inbox/hello.txt", "inbox/hola.txt").unwrap();
        delete(&docs, "inbox/hola.txt", false).unwrap();
        delete(&docs, "inbox", true).unwrap();
        let _ = fs::remove_dir_all(&docs);
    }

    #[test]
    fn write_no_overwrite() {
        let docs = temp_docs();
        write_file(&docs, "a.txt", b"1", false).unwrap();
        assert!(write_file(&docs, "a.txt", b"2", false).is_err());
        write_file(&docs, "a.txt", b"2", true).unwrap();
        assert_eq!(read_file(&docs, "a.txt").unwrap(), b"2");
        let _ = fs::remove_dir_all(&docs);
    }
}
