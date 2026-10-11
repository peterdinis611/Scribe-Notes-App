//! Optional malware scan via an **external** antivirus engine.
//!
//! Scribe does **not** ship virus signatures or an in-process AV. The supported
//! path is the same pattern as OCR → Tesseract: detect a local CLI and shell out.
//!
//! ## How to add antivirus checking
//!
//! 1. **Install a scanner on the machine** (recommended: [ClamAV](https://www.clamav.net/)):
//!    - macOS: `brew install clamav` then `freshclam` (signature update)
//!    - Linux: distro package `clamav` / `clamav-daemon`
//! 2. **Call this module** before import / storage write:
//!    - `scanner_status()` → is ClamAV available?
//!    - `scan_path(&path)` / `scan_bytes(bytes, hint_name)` → verdict
//! 3. **Wire UI** (Settings → Storage / Capture): show status, run on demand,
//!    block or warn on `Infected`.
//! 4. **Keep integrity separate**: run `file_integrity::probe_*` for corruption;
//!    run this module for malware. Combine in the FE or a thin orchestrator.
//!
//! ## Security notes
//!
//! - Never download signatures into the app bundle; let the OS package manage them.
//! - Prefer scanning **temp copies** under the app temp dir, not arbitrary paths,
//!   when the caller is Tauri (use `PathAccessGate` at the command layer).
//! - `scan_bytes` writes a temp file next to the process temp dir, scans, deletes.

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

/// Default wall-clock budget for a single `clamscan` invocation.
pub const DEFAULT_SCAN_TIMEOUT_SECS: u64 = 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AntivirusEngine {
    /// No external scanner found.
    None,
    /// `clamscan` (on-demand CLI).
    Clamscan,
    /// `clamdscan` (talks to `clamd` daemon — faster for many files).
    Clamdscan,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScanVerdict {
    /// Scanner ran; no threat reported.
    Clean,
    /// Scanner reported malware / PUA.
    Infected,
    /// Scanner missing, timed out, or failed — caller should not treat as clean.
    Unavailable,
    /// Scan skipped by policy (e.g. file too large, engine disabled).
    Skipped,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreatHit {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AntivirusStatus {
    pub engine: AntivirusEngine,
    pub available: bool,
    pub binary_path: Option<String>,
    /// First line of `clamscan -V` / `clamdscan -V` when available.
    pub version: Option<String>,
    pub detail: String,
    /// Suggested install hint for the current OS.
    pub install_hint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub engine: AntivirusEngine,
    pub verdict: ScanVerdict,
    pub path: String,
    pub threats: Vec<ThreatHit>,
    pub raw_summary: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone)]
pub struct ScanOptions {
    pub timeout: Duration,
    /// Max bytes for `scan_bytes` (default 32 MiB).
    pub max_bytes: u64,
}

impl Default for ScanOptions {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(DEFAULT_SCAN_TIMEOUT_SECS),
            max_bytes: 32 * 1024 * 1024,
        }
    }
}

/// Locate a usable ClamAV frontend on `PATH`.
pub fn detect_engine() -> AntivirusStatus {
    let hint = install_hint();
    if let Some(path) = which("clamdscan") {
        let version = engine_version_line(&path);
        return AntivirusStatus {
            engine: AntivirusEngine::Clamdscan,
            available: true,
            binary_path: Some(path.display().to_string()),
            version,
            detail: "clamdscan found — prefer clamd for repeated scans".into(),
            install_hint: hint,
        };
    }
    if let Some(path) = which("clamscan") {
        let version = engine_version_line(&path);
        return AntivirusStatus {
            engine: AntivirusEngine::Clamscan,
            available: true,
            binary_path: Some(path.display().to_string()),
            version,
            detail: "clamscan found — run freshclam periodically for signatures".into(),
            install_hint: hint,
        };
    }
    AntivirusStatus {
        engine: AntivirusEngine::None,
        available: false,
        binary_path: None,
        version: None,
        detail: "No ClamAV CLI on PATH (install clamav, then freshclam)".into(),
        install_hint: hint,
    }
}

fn install_hint() -> String {
    if cfg!(target_os = "macos") {
        "brew install clamav && freshclam".into()
    } else if cfg!(target_os = "windows") {
        "Install ClamAV for Windows and add clamscan to PATH".into()
    } else {
        "sudo apt install clamav clamav-daemon && sudo freshclam".into()
    }
}

fn engine_version_line(binary: &Path) -> Option<String> {
    let output = Command::new(binary)
        .arg("-V")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().next().unwrap_or("").trim();
    if line.is_empty() {
        None
    } else {
        Some(line.chars().take(200).collect())
    }
}

/// Alias used by settings / MCP catalogs.
pub fn scanner_status() -> AntivirusStatus {
    detect_engine()
}

/// Scan an on-disk file with the detected engine.
pub fn scan_path(path: &Path) -> ScanReport {
    scan_path_with(path, &ScanOptions::default())
}

pub fn scan_path_with(path: &Path, opts: &ScanOptions) -> ScanReport {
    let started = std::time::Instant::now();
    let path_str = path.display().to_string();
    let status = detect_engine();
    if !status.available {
        return ScanReport {
            engine: AntivirusEngine::None,
            verdict: ScanVerdict::Unavailable,
            path: path_str,
            threats: vec![],
            raw_summary: status.detail,
            duration_ms: elapsed_ms(started),
        };
    }
    if !path.is_file() {
        return ScanReport {
            engine: status.engine,
            verdict: ScanVerdict::Unavailable,
            path: path_str,
            threats: vec![],
            raw_summary: "path is not a regular file".into(),
            duration_ms: elapsed_ms(started),
        };
    }

    let binary = status.binary_path.as_deref().unwrap_or("clamscan");
    match run_clam(binary, status.engine, path, opts.timeout) {
        Ok(mut report) => {
            report.duration_ms = elapsed_ms(started);
            report
        }
        Err(msg) => ScanReport {
            engine: status.engine,
            verdict: ScanVerdict::Unavailable,
            path: path_str,
            threats: vec![],
            raw_summary: msg,
            duration_ms: elapsed_ms(started),
        },
    }
}

/// Write bytes to a temp file, scan, delete. Prefer `scan_path` when you already have a file.
pub fn scan_bytes(bytes: &[u8], hint_name: Option<&str>) -> ScanReport {
    scan_bytes_with(bytes, hint_name, &ScanOptions::default())
}

pub fn scan_bytes_with(bytes: &[u8], hint_name: Option<&str>, opts: &ScanOptions) -> ScanReport {
    let started = std::time::Instant::now();
    if bytes.len() as u64 > opts.max_bytes {
        return ScanReport {
            engine: detect_engine().engine,
            verdict: ScanVerdict::Skipped,
            path: hint_name.unwrap_or("<bytes>").into(),
            threats: vec![],
            raw_summary: format!("payload exceeds max_bytes ({})", opts.max_bytes),
            duration_ms: elapsed_ms(started),
        };
    }

    let status = detect_engine();
    if !status.available {
        return ScanReport {
            engine: AntivirusEngine::None,
            verdict: ScanVerdict::Unavailable,
            path: hint_name.unwrap_or("<bytes>").into(),
            threats: vec![],
            raw_summary: status.detail,
            duration_ms: elapsed_ms(started),
        };
    }

    let suffix = hint_name
        .and_then(|n| Path::new(n).extension())
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    let mut tmp = match tempfile_path(&suffix) {
        Ok(p) => p,
        Err(e) => {
            return ScanReport {
                engine: status.engine,
                verdict: ScanVerdict::Unavailable,
                path: hint_name.unwrap_or("<bytes>").into(),
                threats: vec![],
                raw_summary: e,
                duration_ms: elapsed_ms(started),
            };
        }
    };

    let write_ok = (|| -> Result<(), String> {
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(bytes).map_err(|e| e.to_string())?;
        f.flush().map_err(|e| e.to_string())?;
        Ok(())
    })();

    let report = match write_ok {
        Ok(()) => scan_path_with(&tmp, opts),
        Err(e) => ScanReport {
            engine: status.engine,
            verdict: ScanVerdict::Unavailable,
            path: hint_name.unwrap_or("<bytes>").into(),
            threats: vec![],
            raw_summary: e,
            duration_ms: elapsed_ms(started),
        },
    };

    let _ = std::fs::remove_file(&tmp);
    // Prefer the logical name in the report when scanning bytes.
    let mut report = report;
    if let Some(name) = hint_name {
        report.path = name.into();
    }
    let _ = &mut tmp;
    report
}

fn run_clam(
    binary: &str,
    engine: AntivirusEngine,
    path: &Path,
    timeout: Duration,
) -> Result<ScanReport, String> {
    let path_str = path.display().to_string();
    let mut cmd = Command::new(binary);
    match engine {
        AntivirusEngine::Clamdscan => {
            cmd.arg("--fdpass").arg("--no-summary").arg(path);
        }
        AntivirusEngine::Clamscan => {
            cmd.arg("--no-summary")
                .arg("--infected")
                .arg("--stdout")
                .arg(path);
        }
        AntivirusEngine::None => return Err("no engine".into()),
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn {binary}: {e}"))?;
    let deadline = std::time::Instant::now() + timeout;

    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if std::time::Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("scan timed out after {}s", timeout.as_secs()));
                }
                std::thread::sleep(Duration::from_millis(40));
            }
            Err(e) => return Err(format!("wait error: {e}")),
        }
    }

    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    if let Some(mut out) = child.stdout.take() {
        let _ = std::io::Read::read_to_end(&mut out, &mut stdout);
    }
    if let Some(mut err) = child.stderr.take() {
        let _ = std::io::Read::read_to_end(&mut err, &mut stderr);
    }
    let status = child.wait().map_err(|e| format!("wait failed: {e}"))?;

    let stdout = String::from_utf8_lossy(&stdout).to_string();
    let stderr = String::from_utf8_lossy(&stderr).to_string();
    let combined = if stderr.trim().is_empty() {
        stdout
    } else if stdout.trim().is_empty() {
        stderr
    } else {
        format!("{stdout}\n{stderr}")
    };

    // ClamAV: 0 clean, 1 infected, >=2 error
    let code = status.code().unwrap_or(2);
    let threats = parse_clam_hits(&combined, &path_str);
    let verdict = match code {
        0 => ScanVerdict::Clean,
        1 => ScanVerdict::Infected,
        _ if !threats.is_empty() => ScanVerdict::Infected,
        _ => ScanVerdict::Unavailable,
    };

    Ok(ScanReport {
        engine,
        verdict,
        path: path_str,
        threats,
        raw_summary: combined.trim().chars().take(2_000).collect(),
        duration_ms: 0,
    })
}

fn parse_clam_hits(output: &str, fallback_path: &str) -> Vec<ThreatHit> {
    let mut hits = Vec::new();
    for line in output.lines() {
        // Typical: `/tmp/x: Eicar-Test-Signature FOUND`
        let line = line.trim();
        if let Some(rest) = line.strip_suffix(" FOUND") {
            if let Some((path, name)) = rest.rsplit_once(':') {
                hits.push(ThreatHit {
                    name: name.trim().to_string(),
                    path: path.trim().to_string(),
                });
            } else {
                hits.push(ThreatHit {
                    name: rest.trim().to_string(),
                    path: fallback_path.into(),
                });
            }
        }
    }
    hits
}

fn which(bin: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(bin);
        if candidate.is_file() {
            return Some(candidate);
        }
        #[cfg(windows)]
        {
            let exe = dir.join(format!("{bin}.exe"));
            if exe.is_file() {
                return Some(exe);
            }
        }
    }
    None
}

fn tempfile_path(suffix: &str) -> Result<PathBuf, String> {
    let mut dir = std::env::temp_dir();
    dir.push("scribe-av");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = format!(
        "scan-{}{}{}",
        std::process::id(),
        uuid::Uuid::new_v4().simple(),
        suffix
    );
    Ok(dir.join(name))
}

fn elapsed_ms(started: std::time::Instant) -> u64 {
    started.elapsed().as_millis() as u64
}

/// Combined health pipeline: integrity first, then optional AV.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHealthReport {
    pub integrity: crate::file_integrity::IntegrityReport,
    pub antivirus: ScanReport,
}

pub fn probe_and_scan_path(path: &Path) -> Result<FileHealthReport, String> {
    let integrity = crate::file_integrity::probe_path(path)?;
    let antivirus = scan_path(path);
    Ok(FileHealthReport {
        integrity,
        antivirus,
    })
}

// --- Policy / import gate ----------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AntivirusPolicy {
    /// Master switch — when false, scans return Skipped.
    pub enabled: bool,
    pub scan_on_import: bool,
    pub block_infected: bool,
    pub quarantine_infected: bool,
    pub warn_if_unavailable: bool,
}

impl Default for AntivirusPolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            scan_on_import: true,
            block_infected: true,
            quarantine_infected: true,
            warn_if_unavailable: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportGateAction {
    Allow,
    Block,
    WarnUnavailable,
    Quarantine,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportGateDecision {
    pub action: ImportGateAction,
    pub report: ScanReport,
}

/// Decide what to do with a scan result before accepting an import.
pub fn decide_import_gate(report: &ScanReport, policy: &AntivirusPolicy) -> ImportGateDecision {
    let report = report.clone();
    if !policy.enabled {
        return ImportGateDecision {
            action: ImportGateAction::Allow,
            report,
        };
    }
    match report.verdict {
        ScanVerdict::Clean | ScanVerdict::Skipped => ImportGateDecision {
            action: ImportGateAction::Allow,
            report,
        },
        ScanVerdict::Infected => ImportGateDecision {
            action: if policy.quarantine_infected {
                ImportGateAction::Quarantine
            } else if policy.block_infected {
                ImportGateAction::Block
            } else {
                ImportGateAction::Allow
            },
            report,
        },
        ScanVerdict::Unavailable => ImportGateDecision {
            action: if policy.warn_if_unavailable {
                ImportGateAction::WarnUnavailable
            } else {
                ImportGateAction::Allow
            },
            report,
        },
    }
}

// --- Batch -------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchScanReport {
    pub scanned: u32,
    pub clean: u32,
    pub infected: u32,
    pub unavailable: u32,
    pub skipped: u32,
    pub reports: Vec<ScanReport>,
    pub duration_ms: u64,
}

/// Scan many files; stops collecting infected details after `max_reports` (default 200).
pub fn scan_paths(paths: &[PathBuf], opts: &ScanOptions, max_reports: usize) -> BatchScanReport {
    let started = std::time::Instant::now();
    let limit = max_reports.max(1);
    let mut batch = BatchScanReport {
        scanned: 0,
        clean: 0,
        infected: 0,
        unavailable: 0,
        skipped: 0,
        reports: Vec::new(),
        duration_ms: 0,
    };
    for path in paths {
        let report = scan_path_with(path, opts);
        batch.scanned += 1;
        match report.verdict {
            ScanVerdict::Clean => batch.clean += 1,
            ScanVerdict::Infected => batch.infected += 1,
            ScanVerdict::Unavailable => batch.unavailable += 1,
            ScanVerdict::Skipped => batch.skipped += 1,
        }
        if batch.reports.len() < limit
            && matches!(
                report.verdict,
                ScanVerdict::Infected | ScanVerdict::Unavailable
            )
        {
            batch.reports.push(report);
        } else if batch.reports.len() < limit && report.verdict == ScanVerdict::Clean {
            // keep a short sample of clean paths for UI feedback
            if batch.clean <= 5 {
                batch.reports.push(report);
            }
        }
    }
    batch.duration_ms = elapsed_ms(started);
    batch
}

/// Walk a directory (non-recursive symlink follow off) and scan regular files.
pub fn scan_directory(
    dir: &Path,
    recursive: bool,
    opts: &ScanOptions,
    max_files: usize,
) -> Result<BatchScanReport, String> {
    let mut paths = Vec::new();
    collect_files(dir, recursive, max_files.max(1), &mut paths)?;
    Ok(scan_paths(&paths, opts, 200))
}

fn collect_files(
    dir: &Path,
    recursive: bool,
    max_files: usize,
    out: &mut Vec<PathBuf>,
) -> Result<(), String> {
    if out.len() >= max_files {
        return Ok(());
    }
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
        if out.len() >= max_files {
            break;
        }
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        if meta.is_file() {
            out.push(path);
        } else if recursive && meta.is_dir() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name == ".quarantine" || name.starts_with('.') {
                continue;
            }
            collect_files(&path, true, max_files, out)?;
        }
    }
    Ok(())
}

// --- Self-test (EICAR) -------------------------------------------------------

/// Standard EICAR test string (harmless; every AV should flag it).
pub const EICAR_TEST_STRING: &str =
    r"X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfTestReport {
    pub engine: AntivirusEngine,
    pub passed: bool,
    pub detail: String,
    pub scan: ScanReport,
}

/// Write EICAR to a temp file, scan, expect [`ScanVerdict::Infected`] when ClamAV works.
pub fn self_test() -> SelfTestReport {
    let status = detect_engine();
    if !status.available {
        let scan = scan_bytes(EICAR_TEST_STRING.as_bytes(), Some("eicar.com.txt"));
        return SelfTestReport {
            engine: AntivirusEngine::None,
            passed: false,
            detail: status.detail,
            scan,
        };
    }
    let scan = scan_bytes(EICAR_TEST_STRING.as_bytes(), Some("eicar.com.txt"));
    let passed = scan.verdict == ScanVerdict::Infected;
    SelfTestReport {
        engine: status.engine,
        passed,
        detail: if passed {
            "ClamAV correctly flagged the EICAR test file".into()
        } else {
            format!(
                "expected Infected, got {:?} — run freshclam or check clamd",
                scan.verdict
            )
        },
        scan,
    }
}

// --- Quarantine under files/.quarantine --------------------------------------

pub const QUARANTINE_DIR: &str = ".quarantine";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuarantineEntry {
    pub id: String,
    pub original_path: String,
    pub quarantined_path: String,
    pub threat_name: Option<String>,
    pub reason: String,
    pub quarantined_at: i64,
    pub size_bytes: u64,
}

fn quarantine_root(files_root: &Path) -> PathBuf {
    files_root.join(QUARANTINE_DIR)
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn safe_file_stem(name: &str) -> String {
    let stem = Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");
    stem.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .take(80)
        .collect()
}

/// Move `abs_file` into `{files_root}/.quarantine/` and write a `.json` sidecar.
pub fn quarantine_file(
    files_root: &Path,
    abs_file: &Path,
    original_relative: &str,
    reason: &str,
    threat_name: Option<&str>,
) -> Result<QuarantineEntry, String> {
    if !abs_file.is_file() {
        return Err(format!("NotAFile:{}", abs_file.display()));
    }
    let qroot = quarantine_root(files_root);
    std::fs::create_dir_all(&qroot).map_err(|e| e.to_string())?;
    let id = format!("{}-{}", now_unix(), uuid::Uuid::new_v4().simple());
    let base = safe_file_stem(
        abs_file
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file"),
    );
    let dest = qroot.join(format!("{id}_{base}"));
    let meta_path = qroot.join(format!("{id}.json"));
    let size_bytes = std::fs::metadata(abs_file)
        .map(|m| m.len())
        .unwrap_or(0);
    std::fs::rename(abs_file, &dest)
        .or_else(|_| {
            std::fs::copy(abs_file, &dest)?;
            std::fs::remove_file(abs_file)?;
            Ok(())
        })
        .map_err(|e: std::io::Error| e.to_string())?;

    let entry = QuarantineEntry {
        id: id.clone(),
        original_path: original_relative.into(),
        quarantined_path: dest
            .strip_prefix(files_root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| dest.display().to_string()),
        threat_name: threat_name.map(|s| s.to_string()),
        reason: reason.into(),
        quarantined_at: now_unix(),
        size_bytes,
    };
    let json = serde_json::to_vec_pretty(&entry).map_err(|e| e.to_string())?;
    std::fs::write(&meta_path, json).map_err(|e| e.to_string())?;
    Ok(entry)
}

pub fn list_quarantine(files_root: &Path) -> Result<Vec<QuarantineEntry>, String> {
    let qroot = quarantine_root(files_root);
    if !qroot.is_dir() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&qroot).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        if let Ok(item) = serde_json::from_str::<QuarantineEntry>(&text) {
            out.push(item);
        }
    }
    out.sort_by(|a, b| b.quarantined_at.cmp(&a.quarantined_at));
    Ok(out)
}

pub fn restore_quarantine(files_root: &Path, id: &str) -> Result<String, String> {
    let qroot = quarantine_root(files_root);
    let meta_path = qroot.join(format!("{id}.json"));
    let text = std::fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
    let entry: QuarantineEntry =
        serde_json::from_str(&text).map_err(|e| format!("InvalidPath: bad quarantine meta ({e})"))?;
    let src = files_root.join(&entry.quarantined_path);
    if !src.is_file() {
        return Err(format!("NotFound:quarantined file missing for {id}"));
    }
    let dest_rel = entry.original_path.clone();
    let dest = crate::storage_fs::safe_join_under(files_root, &dest_rel)?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if dest.exists() {
        return Err(format!("AlreadyExists:`{dest_rel}`"));
    }
    std::fs::rename(&src, &dest)
        .or_else(|_| {
            std::fs::copy(&src, &dest)?;
            std::fs::remove_file(&src)?;
            Ok(())
        })
        .map_err(|e: std::io::Error| e.to_string())?;
    let _ = std::fs::remove_file(meta_path);
    Ok(dest_rel)
}

pub fn purge_quarantine(files_root: &Path, id: &str) -> Result<(), String> {
    let qroot = quarantine_root(files_root);
    let meta_path = qroot.join(format!("{id}.json"));
    if meta_path.is_file() {
        let text = std::fs::read_to_string(&meta_path).unwrap_or_default();
        if let Ok(entry) = serde_json::from_str::<QuarantineEntry>(&text) {
            let src = files_root.join(&entry.quarantined_path);
            let _ = std::fs::remove_file(src);
        }
        std::fs::remove_file(meta_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_found_line() {
        let hits = parse_clam_hits(
            "/tmp/eicar.com: Win.Test.EICAR_HDB-1 FOUND\n",
            "/tmp/eicar.com",
        );
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].name, "Win.Test.EICAR_HDB-1");
        assert!(hits[0].path.contains("eicar"));
    }

    #[test]
    fn status_does_not_panic() {
        let s = scanner_status();
        assert!(!s.detail.is_empty());
        assert!(!s.install_hint.is_empty());
        if !s.available {
            assert_eq!(s.engine, AntivirusEngine::None);
            let report = scan_bytes(b"hello", Some("note.txt"));
            assert_eq!(report.verdict, ScanVerdict::Unavailable);
        }
    }

    #[test]
    fn skips_oversized_bytes() {
        let opts = ScanOptions {
            max_bytes: 4,
            ..Default::default()
        };
        let report = scan_bytes_with(b"12345", Some("big.bin"), &opts);
        assert_eq!(report.verdict, ScanVerdict::Skipped);
    }

    #[test]
    fn import_gate_blocks_infected() {
        let report = ScanReport {
            engine: AntivirusEngine::Clamscan,
            verdict: ScanVerdict::Infected,
            path: "x".into(),
            threats: vec![],
            raw_summary: String::new(),
            duration_ms: 1,
        };
        let decision = decide_import_gate(&report, &AntivirusPolicy::default());
        assert_eq!(decision.action, ImportGateAction::Quarantine);
    }

    #[test]
    fn eicar_constant_is_standard_length() {
        assert!(EICAR_TEST_STRING.contains("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"));
        assert_eq!(EICAR_TEST_STRING.len(), 68);
    }
}
