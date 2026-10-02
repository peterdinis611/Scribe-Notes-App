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
    let root_canon = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let abs_canon = fs::canonicalize(abs).unwrap_or_else(|_| abs.to_path_buf());
    let rel = abs_canon
        .strip_prefix(&root_canon)
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistsResult {
    pub exists: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<StorageEntryKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

pub fn exists(documents_dir: &Path, path: &str) -> Result<ExistsResult, String> {
    let root = ensure_files_root(documents_dir)?;
    let abs = safe_join_under(&root, path)?;
    if !abs.exists() {
        return Ok(ExistsResult {
            exists: false,
            kind: None,
            path: None,
        });
    }
    let entry = entry_from_path(&root, &abs)?;
    Ok(ExistsResult {
        exists: true,
        kind: Some(entry.kind),
        path: Some(entry.path),
    })
}

pub fn touch(documents_dir: &Path, path: &str) -> Result<StorageEntry, String> {
    let root = ensure_files_root(documents_dir)?;
    let rel = normalize_relative(path)?;
    if rel.is_empty() {
        return Err(err("RootProtected:", "cannot touch files root"));
    }
    let abs = safe_join_under(&root, &rel)?;
    if abs.exists() {
        if abs.is_dir() {
            return Err(err("NotAFile:", format!("`{rel}` is a directory")));
        }
        let file = fs::OpenOptions::new()
            .write(true)
            .open(&abs)
            .map_err(|e| e.to_string())?;
        let times = fs::FileTimes::new().set_modified(SystemTime::now());
        file.set_times(times).map_err(|e| e.to_string())?;
        return entry_from_path(&root, &abs);
    }
    write_file(documents_dir, &rel, b"", true)
}

pub fn append_bytes(
    documents_dir: &Path,
    path: &str,
    bytes: &[u8],
) -> Result<StorageEntry, String> {
    if bytes.len() as u64 > MAX_WRITE_BYTES {
        return Err(err("TooLarge:", format!("max {MAX_WRITE_BYTES} bytes")));
    }
    let root = ensure_files_root(documents_dir)?;
    let rel = normalize_relative(path)?;
    if rel.is_empty() {
        return Err(err("RootProtected:", "cannot append to files root"));
    }
    let abs = safe_join_under(&root, &rel)?;
    if abs.exists() && abs.is_dir() {
        return Err(err("NotAFile:", format!("`{rel}` is a directory")));
    }
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if abs.exists() {
        let meta = fs::metadata(&abs).map_err(|e| e.to_string())?;
        if meta.len() + bytes.len() as u64 > MAX_WRITE_BYTES {
            return Err(err("TooLarge:", format!("max {MAX_WRITE_BYTES} bytes")));
        }
    }
    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&abs)
        .map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    entry_from_path(&root, &abs)
}

pub fn append_text(
    documents_dir: &Path,
    path: &str,
    text: &str,
) -> Result<StorageEntry, String> {
    append_bytes(documents_dir, path, text.as_bytes())
}

pub fn move_into(
    documents_dir: &Path,
    from: &str,
    dir: &str,
) -> Result<StorageEntry, String> {
    let from_rel = normalize_relative(from)?;
    if from_rel.is_empty() {
        return Err(err("RootProtected:", "cannot move files root"));
    }
    let name = Path::new(&from_rel)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or_else(|| err("InvalidPath:", "missing basename"))?;
    let dir_rel = normalize_relative(dir)?;
    let to = if dir_rel.is_empty() {
        name
    } else {
        format!("{dir_rel}/{name}")
    };
    rename(documents_dir, &from_rel, &to)
}

pub fn copy(
    documents_dir: &Path,
    from: &str,
    to: &str,
    overwrite: bool,
) -> Result<StorageEntry, String> {
    let bytes = read_file(documents_dir, from)?;
    write_file(documents_dir, to, &bytes, overwrite)
}

/// Simple glob: `*` any chars except `/`, `**` any including `/`, `?` one char.
pub fn glob_match(pattern: &str, value: &str) -> bool {
    fn match_rec(p: &[u8], v: &[u8]) -> bool {
        let mut i = 0;
        let mut j = 0;
        while i < p.len() {
            match p[i] {
                b'*' if i + 1 < p.len() && p[i + 1] == b'*' => {
                    // **
                    let rest = &p[i + 2..];
                    let rest = if rest.first() == Some(&b'/') {
                        &rest[1..]
                    } else {
                        rest
                    };
                    if rest.is_empty() {
                        return true;
                    }
                    for k in j..=v.len() {
                        if match_rec(rest, &v[k..]) {
                            return true;
                        }
                    }
                    return false;
                }
                b'*' => {
                    let rest = &p[i + 1..];
                    if rest.is_empty() {
                        return !v[j..].contains(&b'/');
                    }
                    for k in j..=v.len() {
                        if v[j..k].contains(&b'/') {
                            break;
                        }
                        if match_rec(rest, &v[k..]) {
                            return true;
                        }
                    }
                    return false;
                }
                b'?' => {
                    if j >= v.len() || v[j] == b'/' {
                        return false;
                    }
                    i += 1;
                    j += 1;
                }
                c => {
                    if j >= v.len() || v[j] != c {
                        return false;
                    }
                    i += 1;
                    j += 1;
                }
            }
        }
        j == v.len()
    }
    match_rec(pattern.as_bytes(), value.as_bytes())
}

pub fn search(
    documents_dir: &Path,
    query: &str,
    path: Option<&str>,
    glob: Option<&str>,
    limit: Option<usize>,
) -> Result<Vec<StorageEntry>, String> {
    let under = path.unwrap_or("").to_string();
    let entries = list(
        documents_dir,
        ListOpts {
            path: Some(under),
            recursive: true,
            depth: Some(16),
        },
    )?;
    let q = query.trim().to_ascii_lowercase();
    let limit = limit.unwrap_or(100).max(1);
    let filtered: Vec<_> = entries
        .into_iter()
        .filter(|e| {
            let name_ok = q.is_empty()
                || e.name.to_ascii_lowercase().contains(&q)
                || e.path.to_ascii_lowercase().contains(&q);
            let glob_ok = match glob {
                Some(g) if !g.is_empty() => glob_match(g, &e.path) || glob_match(g, &e.name),
                _ => true,
            };
            name_ok && glob_ok
        })
        .take(limit)
        .collect();
    Ok(filtered)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskUsage {
    pub path: String,
    pub total_bytes: u64,
    pub file_count: u64,
    pub dir_count: u64,
}

pub fn disk_usage(documents_dir: &Path, path: &str) -> Result<DiskUsage, String> {
    let entries = list(
        documents_dir,
        ListOpts {
            path: Some(path.to_string()),
            recursive: true,
            depth: Some(32),
        },
    )?;
    let mut total = 0u64;
    let mut files = 0u64;
    let mut dirs = 0u64;
    for e in &entries {
        match e.kind {
            StorageEntryKind::File => {
                files += 1;
                total += e.size_bytes.unwrap_or(0);
            }
            StorageEntryKind::Dir => dirs += 1,
        }
    }
    Ok(DiskUsage {
        path: normalize_relative(path)?,
        total_bytes: total,
        file_count: files,
        dir_count: dirs,
    })
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    #[serde(flatten)]
    pub entry: StorageEntry,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<TreeNode>>,
}

pub fn tree(
    documents_dir: &Path,
    path: &str,
    depth: Option<u32>,
) -> Result<TreeNode, String> {
    let root = ensure_files_root(documents_dir)?;
    let abs = safe_join_under(&root, path)?;
    if !abs.exists() {
        return Err(err("NotFound:", format!("missing path `{path}`")));
    }
    let max_depth = depth.unwrap_or(4).min(16);
    build_tree(&root, &abs, 0, max_depth)
}

fn build_tree(
    root: &Path,
    abs: &Path,
    depth: u32,
    max_depth: u32,
) -> Result<TreeNode, String> {
    let entry = entry_from_path(root, abs)?;
    if entry.kind != StorageEntryKind::Dir || depth >= max_depth {
        return Ok(TreeNode {
            entry,
            children: None,
        });
    }
    let mut children = Vec::new();
    let mut dirs = Vec::new();
    for item in fs::read_dir(abs).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?;
        let child_path = item.path();
        if child_path.is_dir() {
            dirs.push(child_path);
        } else {
            children.push(TreeNode {
                entry: entry_from_path(root, &child_path)?,
                children: None,
            });
        }
    }
    dirs.sort();
    for dir in dirs {
        children.push(build_tree(root, &dir, depth + 1, max_depth)?);
    }
    children.sort_by(|a, b| a.entry.path.cmp(&b.entry.path));
    Ok(TreeNode {
        entry,
        children: Some(children),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResult {
    pub path: String,
    pub text: String,
    pub truncated: bool,
    pub size_bytes: u64,
}

pub fn preview(
    documents_dir: &Path,
    path: &str,
    max_chars: Option<usize>,
) -> Result<PreviewResult, String> {
    let limit = max_chars.unwrap_or(2_000).clamp(1, 100_000);
    let bytes = read_file(documents_dir, path)?;
    let size_bytes = bytes.len() as u64;
    let full = String::from_utf8_lossy(&bytes);
    let truncated = full.chars().count() > limit;
    let text: String = full.chars().take(limit).collect();
    Ok(PreviewResult {
        path: normalize_relative(path)?,
        text,
        truncated,
        size_bytes,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecksumResult {
    pub path: String,
    pub algo: String,
    pub hex: String,
    pub size_bytes: u64,
}

pub fn checksum_sha256(documents_dir: &Path, path: &str) -> Result<ChecksumResult, String> {
    use sha2::{Digest, Sha256};
    let bytes = read_file(documents_dir, path)?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let digest = hasher.finalize();
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    Ok(ChecksumResult {
        path: normalize_relative(path)?,
        algo: "sha256".into(),
        hex,
        size_bytes: bytes.len() as u64,
    })
}

pub fn recent(
    documents_dir: &Path,
    path: Option<&str>,
    limit: Option<usize>,
    files_only: bool,
) -> Result<Vec<StorageEntry>, String> {
    let under = path.unwrap_or("").to_string();
    let mut entries = list(
        documents_dir,
        ListOpts {
            path: Some(under),
            recursive: true,
            depth: Some(16),
        },
    )?;
    if files_only {
        entries.retain(|e| e.kind == StorageEntryKind::File);
    }
    entries.sort_by(|a, b| {
        b.modified_at
            .cmp(&a.modified_at)
            .then_with(|| a.path.cmp(&b.path))
    });
    let limit = limit.unwrap_or(50).max(1);
    entries.truncate(limit);
    Ok(entries)
}

pub fn clear_dir(documents_dir: &Path, path: &str) -> Result<StorageEntry, String> {
    let root = ensure_files_root(documents_dir)?;
    let rel = normalize_relative(path)?;
    let abs = safe_join_under(&root, &rel)?;
    if !abs.exists() {
        return Err(err("NotFound:", format!("missing path `{rel}`")));
    }
    if !abs.is_dir() {
        return Err(err("NotADirectory:", format!("`{rel}` is not a directory")));
    }
    for item in fs::read_dir(&abs).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?;
        let child = item.path();
        let child_rel = child
            .strip_prefix(&root)
            .map_err(|_| err("InvalidPath:", "escape"))?
            .to_string_lossy()
            .replace('\\', "/");
        delete(documents_dir, &child_rel, true)?;
    }
    entry_from_path(&root, &abs)
}

pub fn write_json(
    documents_dir: &Path,
    path: &str,
    value: &serde_json::Value,
    overwrite: bool,
    pretty: bool,
) -> Result<StorageEntry, String> {
    let text = if pretty {
        serde_json::to_string_pretty(value).map_err(|e| e.to_string())?
    } else {
        serde_json::to_string(value).map_err(|e| e.to_string())?
    };
    write_text(documents_dir, path, &text, overwrite)
}

pub fn read_json(documents_dir: &Path, path: &str) -> Result<serde_json::Value, String> {
    let text = read_text(documents_dir, path, None)?;
    serde_json::from_str(&text).map_err(|e| err("NotAFile:", format!("invalid JSON ({e})")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_docs() -> PathBuf {
        let dir = env::temp_dir().join(format!("scribe-fs-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn glob_and_roundtrip() {
        let docs = temp_docs();
        ensure_defaults(&docs).unwrap();
        write_text(&docs, "scratch/a.md", "# hi\n", true).unwrap();
        write_text(&docs, "scratch/b.txt", "x", true).unwrap();
        let hits = search(&docs, "", Some("scratch"), Some("*.md"), Some(10)).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].name, "a.md");
        let prev = preview(&docs, "scratch/a.md", Some(10)).unwrap();
        assert!(prev.text.starts_with("# hi"));
        let sum = checksum_sha256(&docs, "scratch/a.md").unwrap();
        assert_eq!(sum.algo, "sha256");
        assert_eq!(sum.hex.len(), 64);
        let tree = tree(&docs, "scratch", Some(2)).unwrap();
        assert!(tree.children.as_ref().unwrap().len() >= 2);
        let _ = fs::remove_dir_all(&docs);
    }

    #[test]
    fn exists_touch_append_json() {
        let docs = temp_docs();
        assert!(!exists(&docs, "inbox/note.json").unwrap().exists);
        touch(&docs, "inbox/note.json").unwrap();
        assert!(exists(&docs, "inbox/note.json").unwrap().exists);
        append_text(&docs, "inbox/log.txt", "a\n").unwrap();
        append_text(&docs, "inbox/log.txt", "b\n").unwrap();
        assert_eq!(read_text(&docs, "inbox/log.txt", None).unwrap(), "a\nb\n");
        write_json(
            &docs,
            "inbox/note.json",
            &serde_json::json!({"ok": true}),
            true,
            true,
        )
        .unwrap();
        let v = read_json(&docs, "inbox/note.json").unwrap();
        assert_eq!(v["ok"], true);
        let _ = fs::remove_dir_all(&docs);
    }
}
