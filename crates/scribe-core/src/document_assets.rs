//! Document-attached binary assets under `documents/assets/{document_id}/`.

use std::fs;
use std::path::{Path, PathBuf};

/// Rewrite TipTap asset URLs when a document id changes (duplicate / remap).
pub fn remap_document_asset_paths(content_json: &str, old_id: &str, new_id: &str) -> String {
    let marker_old = format!("/assets/{old_id}/");
    let marker_new = format!("/assets/{new_id}/");
    content_json.replace(&marker_old, &marker_new)
}

/// Copy `assets/{from_id}` → `assets/{to_id}` and rewrite paths inside TipTap JSON.
pub fn duplicate_document_assets(
    documents_dir: &Path,
    from_id: &str,
    to_id: &str,
    content_json: &str,
) -> Result<String, String> {
    let from_assets = documents_dir.join("assets").join(from_id);
    let to_assets = documents_dir.join("assets").join(to_id);

    if from_assets.is_dir() {
        copy_dir_all(&from_assets, &to_assets)?;
    }

    Ok(remap_document_asset_paths(content_json, from_id, to_id))
}

pub fn document_assets_dir(documents_dir: &Path, document_id: &str) -> PathBuf {
    documents_dir.join("assets").join(document_id)
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|error| {
        format!(
            "Could not create asset folder {}: {error}",
            dst.display()
        )
    })?;

    for entry in fs::read_dir(src).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let dest = dst.join(entry.file_name());

        if path.is_dir() {
            copy_dir_all(&path, &dest)?;
        } else {
            fs::copy(&path, &dest).map_err(|error| {
                format!("Could not copy {}: {error}", path.display())
            })?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn remap_rewrites_document_id_in_paths() {
        let old_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
        let new_id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
        let content = format!(r#"{{"src":"/assets/{old_id}/img.png"}}"#);
        let remapped = remap_document_asset_paths(&content, old_id, new_id);
        assert!(remapped.contains(&format!("/assets/{new_id}/")));
        assert!(!remapped.contains(&format!("/assets/{old_id}/")));
    }

    #[test]
    fn duplicate_copies_files_and_rewrites() {
        let temp = tempfile_dir();
        let old_id = "old-doc";
        let new_id = "new-doc";
        let assets = temp.join("assets").join(old_id);
        fs::create_dir_all(&assets).unwrap();
        let mut f = fs::File::create(assets.join("pic.png")).unwrap();
        f.write_all(b"png").unwrap();
        let content = format!(r#"{{"src":"/assets/{old_id}/pic.png"}}"#);
        let remapped = duplicate_document_assets(&temp, old_id, new_id, &content).unwrap();
        assert!(temp.join("assets").join(new_id).join("pic.png").is_file());
        assert!(remapped.contains(&format!("/assets/{new_id}/pic.png")));
    }

    fn tempfile_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("scribe-assets-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }
}
