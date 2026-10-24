//! macOS Seatbelt wrapper for the NLP Python sidecar.
//!
//! Opt-in: set `SCRIBE_NLP_SEATBELT=1` to wrap the spawn with `sandbox-exec`.
//! Set `SCRIBE_NLP_NO_SEATBELT=1` to force-disable. On non-macOS this module is
//! a no-op.

use std::path::Path;
use std::process::Command;

#[cfg(target_os = "macos")]
fn seatbelt_enabled() -> bool {
    if matches!(
        std::env::var("SCRIBE_NLP_NO_SEATBELT")
            .ok()
            .as_deref()
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("1" | "true" | "yes" | "on")
    ) {
        return false;
    }
    matches!(
        std::env::var("SCRIBE_NLP_SEATBELT")
            .ok()
            .as_deref()
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("1" | "true" | "yes" | "on")
    )
}

/// Build a seatbelt profile that allows Python + script tree + temp HF cache,
/// while denying Scribe DB files under Application Support.
#[cfg(target_os = "macos")]
fn seatbelt_profile(script_dir: &Path, tmpdir: &str, python_bin: &str) -> String {
    let script = script_dir.display();
    let python = Path::new(python_bin)
        .parent()
        .unwrap_or_else(|| Path::new("/usr/bin"))
        .display();
    format!(
        r#"(version 1)
(deny default)
(allow process*)
(allow signal)
(allow sysctl-read)
(allow mach*)
(allow file-read-metadata)
(allow file-read*
  (subpath "/usr")
  (subpath "/System")
  (subpath "/Library")
  (subpath "/opt")
  (subpath "/private/var")
  (subpath "/private/tmp")
  (subpath "/tmp")
  (subpath "{python}")
  (subpath "{script}")
  (subpath "{tmpdir}")
  (literal "/dev/null")
  (literal "/dev/urandom")
  (literal "/dev/random")
)
(deny file-read*
  (regex #"(?i)Application Support/com\.scribe\.app/.*\.db$")
  (regex #"(?i)/\.ssh/")
  (regex #"(?i)/\.gnupg/")
  (regex #"(?i)/Library/Keychains/")
)
(allow file-write*
  (subpath "{tmpdir}")
  (subpath "/private/var/folders")
  (subpath "/private/tmp")
  (subpath "/tmp")
)
(allow network-outbound)
(allow network-inbound)
(allow system-socket)
"#
    )
}

/// Wrap `base` so the process runs under `sandbox-exec` when available.
/// Falls back to the original command if seatbelt is disabled or unavailable.
pub fn apply_seatbelt(
    base: Command,
    python_bin: &str,
    script_path: &Path,
    script_dir: &Path,
    tmpdir: &str,
) -> Result<Command, String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (python_bin, script_path, script_dir, tmpdir);
        return Ok(base);
    }

    #[cfg(target_os = "macos")]
    {
        if !seatbelt_enabled() {
            return Ok(base);
        }
        if which_sandbox_exec().is_none() {
            log::warn!("sandbox-exec not found; NLP seatbelt skipped");
            return Ok(base);
        }

        let profile = seatbelt_profile(script_dir, tmpdir, python_bin);
        let profile_path = std::env::temp_dir().join(format!(
            "scribe-nlp-seatbelt-{}.sb",
            std::process::id()
        ));
        std::fs::write(&profile_path, profile)
            .map_err(|e| format!("Failed to write seatbelt profile: {e}"))?;

        // sandbox-exec -f profile -- python script
        let mut wrapped = Command::new("sandbox-exec");
        wrapped
            .arg("-f")
            .arg(&profile_path)
            .arg("--")
            .arg(python_bin)
            .arg(script_path)
            .current_dir(script_dir);

        // Carry over stdio wiring from the original builder by transferring
        // is not possible; caller sets stdin/stdout/stderr/env after this returns.
        // We only fix program + args + cwd here; env is applied by the caller on `wrapped`.
        let _ = base; // unused when wrapping
        Ok(wrapped)
    }
}

#[cfg(target_os = "macos")]
fn which_sandbox_exec() -> Option<&'static str> {
    for candidate in ["/usr/bin/sandbox-exec", "/usr/sbin/sandbox-exec"] {
        if Path::new(candidate).is_file() {
            return Some(candidate);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "macos")]
    #[test]
    fn profile_mentions_db_deny() {
        let profile = super::seatbelt_profile(
            std::path::Path::new("/tmp/nlp"),
            "/tmp",
            "/usr/bin/python3",
        );
        assert!(profile.contains("com\\.scribe\\.app"));
        assert!(profile.contains("deny file-read"));
    }
}
