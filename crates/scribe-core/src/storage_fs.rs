//! Sandboxed file store under `{documentsDir}/files/`.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::SystemTime;

pub const MAX_WRITE_BYTES: u64 = 100 * 1024 * 1024;
pub const DEFAULT_FOLDERS: &[&str] = &["inbox", "exports", "scratch", "attachments"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extension: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ListOpts {
    pub path: Option<String>,
    pub recursive: bool,
    pub depth: Option<u32>,
}

fn err(prefix: &str, msg: impl Into<String>) -> String {
    format!("{prefix}{}", msg.into())
}

pub fn ensure_files_root(documents_dir: &Path) -> Result<PathBuf, String> {
    let root = documents_dir.join("files");
    fs::create_dir_all(&root).map_err(|e| err("NotFound:", e.to_string()))?;
    Ok(root)
}

pub fn normalize_relative(path: &str) -> Result<String, String> {
    let trimmed = path.trim().trim_matches('/');
    if trimmed.is_empty() || trimmed == "." {
        return Ok(String::new());
    }
    if trimmed.contains('\\') || trimmed.contains('\0') {
        return Err(err("InvalidPath:", "backslash or NUL not allowed"));
    }
    if Path::new(trimmed).is_absolute() {
        return Err(err("InvalidPath:", "absolute paths not allowed"));
    }
    let mut parts = Vec::new();
    for comp in Path::new(trimmed).components() {
        match comp {
            Component::Normal(s) => {
                let s = s.to_string_lossy();
                if s == ".." {
                    return Err(err("InvalidPath:", ".. not allowed"));
                }
                parts.push(s.into_owned());
            }
            Component::CurDir => {}
            _ => return Err(err("InvalidPath:", "invalid path component")),
        }
    }
    Ok(parts.join("/"))
}

pub fn safe_join_under(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = normalize_relative(relative)?;
    if rel.is_empty() {
        return Ok(root.to_path_buf());
    }
    let joined = root.join(Path::new(&rel));
    let root_canon = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    if let Ok(canon) = fs::canonicalize(&joined) {
        if !canon.starts_with(&root_canon) {
            return Err(err("InvalidPath:", "path escapes files root"));
        }
        return Ok(canon);
    }
    // Parent must stay under root for create ops
    if let Some(parent) = joined.parent() {
        if parent.exists() {
            let parent_canon = fs::canonicalize(parent).map_err(|e| e.to_string())?;
            if !parent_canon.starts_with(&root_canon) {
                return Err(err("InvalidPath:", "path escapes files root"));
            }
        }
    }
    Ok(joined)
}

fn to_unix_secs(time: SystemTime) -> Option<i64> {
    time.duration_since(SystemTime::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs() as i64)
}

fn entry_from_path(root: &Path, abs: &Path) -> Result<StorageEntry, String> {
    let meta = fs::metadata(abs).map_err(|e| err("NotFound:", e.to_string()))?;
    let rel = abs
        .strip_prefix(root)
        .map_err(|_| err("InvalidPath:", "not under files root"))?;
    let path = rel.to_string_lossy().replace('\\', "/");
    let name = abs
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| if path.is_empty() { "files".into() } else { path.clone() });
    let kind = if meta.is_dir() {
        StorageEntryKind::Dir
    } else {
        StorageEntryKind::File
    };
    let extension = if meta.is_file() {
        abs.extension()
            .map(|e| e.to_string_lossy().to_lowercase())
    } else {
        None
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
        modified_at: meta.modified().ok().and_then(to_unix_secs),
        extension,
    })
}

pub fn list(documents_dir: &Path, opts: ListOpts) -> Result<Vec<StorageEntry>, String> {
    let root = ensure_files_root(documents_dir)?;
    let rel = opts.path.as_deref().unwrap_or("");
    let dir = safe_join_under(&root, rel)?;
    if !dir.exists() {
        return Err(err("NotFound:", format!("missing path `{rel}`")));
    }
    if !dir.is_dir() {
        return Err(err("NotADirectory:", format!("`{rel}` is not a directory")));
    }

    let mut out = Vec::new();
    let max_depth = if opts.recursive {
        opts.depth.unwrap_or(32)
    } else {
        0
    };
    walk(&root, &dir, 0, max_depth, opts.recursive, &mut out)?;
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

fn walk(
    root: &Path,
    dir: &Path,
    depth: u32,
    max_depth: u32,
    recursive: bool,
    out: &mut Vec<StorageEntry>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        out.push(entry_from_path(root, &path)?);
        if recursive && path.is_dir() && depth < max_depth {
            walk(root, &path, depth + 1, max_depth, true, out)?;
        }
    }
    Ok(())
}

pub fn stat(documents_dir: &Path, path: &str) -> Result<StorageEntry, String> {
    let root = ensure_files_root(documents_dir)?;
    let abs = safe_join_under(&root, path)?;
    if !abs.exists() {
        if normalize_relative(path)?.is_empty() {
            return entry_from_path(&root, &root);
        }
        return Err(err("NotFound:", format!("missing path `{path}`")));
    }
    entry_from_path(&root, &abs)
}

pub fn mkdir(documents_dir: &Path, path: &str) -> Result<StorageEntry, String> {
    let root = ensure_files_root(documents_dir)?;
    let rel = normalize_relative(path)?;
    if rel.is_empty() {
        return Err(err("RootProtected:", "cannot mkdir files root"));
    }
    let abs = safe_join_under(&root, &rel)?;
    fs::create_dir_all(&abs).map_err(|e| e.to_string())?;
    entry_from_path(&root, &abs)
}

pub fn write_file(
    documents_dir: &Path,
    path: &str,
    bytes: &[u8],
    overwrite: bool,
) -> Result<StorageEntry, String> {
    if bytes.len() as u64 > MAX_WRITE_BYTES {
        return Err(err("TooLarge:", format!("max {MAX_WRITE_BYTES} bytes")));
    }
    let root = ensure_files_root(documents_dir)?;
    let rel = normalize_relative(path)?;
    if rel.is_empty() {
        return Err(err("RootProtected:", "cannot write files root"));
    }
    let abs = safe_join_under(&root, &rel)?;
    if abs.exists() && !overwrite {
        return Err(err("AlreadyExists:", rel));
    }
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&abs, bytes).map_err(|e| e.to_string())?;
    entry_from_path(&root, &abs)
}

pub fn write_text(
    documents_dir: &Path,
    path: &str,
    text: &str,
    overwrite: bool,
) -> Result<StorageEntry, String> {
    write_file(documents_dir, path, text.as_bytes(), overwrite)
}

pub fn read_file(documents_dir: &Path, path: &str) -> Result<Vec<u8>, String> {
    let root = ensure_files_root(documents_dir)?;
    let abs = safe_join_under(&root, path)?;
    if !abs.is_file() {
        return Err(err("NotAFile:", format!("`{path}`")));
    }
    let meta = fs::metadata(&abs).map_err(|e| e.to_string())?;
    if meta.len() > MAX_WRITE_BYTES {
        return Err(err("TooLarge:", format!("max {MAX_WRITE_BYTES} bytes")));
    }
    fs::read(&abs).map_err(|e| err("NotFound:", e.to_string()))
}

pub fn read_text(
    documents_dir: &Path,
    path: &str,
    max_bytes: Option<u64>,
) -> Result<String, String> {
    let bytes = read_file(documents_dir, path)?;
    let limit = max_bytes.unwrap_or(MAX_WRITE_BYTES) as usize;
    if bytes.len() > limit {
        return Err(err("TooLarge:", format!("max {limit} bytes")));
    }
    String::from_utf8(bytes).map_err(|_| err("NotAFile:", "not valid UTF-8"))
}

pub fn delete(documents_dir: &Path, path: &str, recursive: bool) -> Result<(), String> {
    let root = ensure_files_root(documents_dir)?;
    let rel = normalize_relative(path)?;
    if rel.is_empty() {
        return Err(err("RootProtected:", "cannot delete files root"));
    }
    let abs = safe_join_under(&root, &rel)?;
    if !abs.exists() {
        return Err(err("NotFound:", rel));
    }
    if abs.is_dir() {
        if recursive {
            fs::remove_dir_all(&abs).map_err(|e| e.to_string())?;
        } else {
            fs::remove_dir(&abs).map_err(|e| {
                if e.kind() == std::io::ErrorKind::DirectoryNotEmpty {
                    err("NotEmpty:", rel.clone())
                } else {
                    e.to_string()
                }
            })?;
        }
    } else {
        fs::remove_file(&abs).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn rename(documents_dir: &Path, from: &str, to: &str) -> Result<StorageEntry, String> {
    let root = ensure_files_root(documents_dir)?;
    let from_rel = normalize_relative(from)?;
    let to_rel = normalize_relative(to)?;
    if from_rel.is_empty() || to_rel.is_empty() {
        return Err(err("RootProtected:", "cannot rename files root"));
    }
    let from_abs = safe_join_under(&root, &from_rel)?;
    let to_abs = safe_join_under(&root, &to_rel)?;
    if !from_abs.exists() {
        return Err(err("NotFound:", from_rel));
    }
    if to_abs.exists() {
        return Err(err("AlreadyExists:", to_rel));
    }
    if let Some(parent) = to_abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&from_abs, &to_abs).map_err(|e| e.to_string())?;
    entry_from_path(&root, &to_abs)
}

pub fn ensure_defaults(documents_dir: &Path) -> Result<Vec<String>, String> {
    let root = ensure_files_root(documents_dir)?;
    let mut created = Vec::new();
    for name in DEFAULT_FOLDERS {
        let path = root.join(name);
        if !path.exists() {
            fs::create_dir_all(&path).map_err(|e| e.to_string())?;
            created.push((*name).to_string());
        }
    }
    Ok(created)
}
