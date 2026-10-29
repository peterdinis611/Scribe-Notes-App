//! Path filters for documents-folder FS watchers (Tauri / MCP adapters).

use std::path::Path;

pub fn should_ignore_path(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return true;
    };
    if name.starts_with('.') || name == "pdf" || name == "assets" || name == "Backups" {
        return true;
    }
    // Temp write artifacts from Scribe / cloud providers.
    if name.ends_with(".tmp") || name.ends_with(".part") || name.ends_with('~') {
        return true;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::should_ignore_path;
    use std::path::Path;

    #[test]
    fn ignores_dotfiles_and_sidecar_dirs() {
        assert!(should_ignore_path(Path::new("/docs/.DS_Store")));
        assert!(should_ignore_path(Path::new("/docs/pdf")));
        assert!(should_ignore_path(Path::new("/docs/assets")));
        assert!(should_ignore_path(Path::new("/docs/Backups")));
    }

    #[test]
    fn ignores_temp_write_artifacts() {
        assert!(should_ignore_path(Path::new("/docs/note.scribe.tmp")));
        assert!(should_ignore_path(Path::new("/docs/note.scribe.part")));
        assert!(should_ignore_path(Path::new("/docs/note~")));
    }

    #[test]
    fn keeps_real_scribe_files() {
        assert!(!should_ignore_path(Path::new("/docs/Meeting.scribe")));
        assert!(!should_ignore_path(Path::new(
            "/docs/folder/note.scribe.json"
        )));
    }
}
