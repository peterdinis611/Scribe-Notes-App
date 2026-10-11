//! Lightweight corruption / integrity probes for library and storage files.
//!
//! Design goals:
//! - **Fast**: read at most a small header (and full body only when already in memory).
//! - **Deterministic**: no network, no OS file locks beyond the caller's read.
//! - **Conservative**: prefer `Suspect` over false `Corrupt` when a check is incomplete.
//! - **Composable**: `probe_bytes` is the core; path / storage helpers are thin wrappers.
//!
//! This is not a full antivirus or deep format validator — it catches truncated downloads,
//! wrong extensions, broken ZIP/Office packages, and obvious image/PDF header damage.

use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::Path;
use zip::ZipArchive;

/// Max bytes read when probing from disk (header + small body for JSON/text).
pub const MAX_PROBE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileKind {
    Text,
    Json,
    Zip,
    Docx,
    Xlsx,
    Png,
    Jpeg,
    Gif,
    Webp,
    Pdf,
    Svg,
    Binary,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum IntegrityStatus {
    /// No issues found with the checks that ran.
    Ok,
    /// Likely damaged or mismatched, but not proven truncated/unreadable.
    Suspect,
    /// Clearly unusable for the detected kind (empty, truncated magic, broken ZIP, …).
    Corrupt,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityIssue {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityReport {
    pub kind: FileKind,
    pub status: IntegrityStatus,
    pub size_bytes: u64,
    pub issues: Vec<IntegrityIssue>,
    /// Human-readable list of checks that ran (for UI / diagnostics).
    pub checks: Vec<String>,
}

impl IntegrityReport {
    fn push_issue(&mut self, code: &str, message: impl Into<String>, status: IntegrityStatus) {
        self.issues.push(IntegrityIssue {
            code: code.into(),
            message: message.into(),
        });
        self.status = worse(self.status, status);
    }

    fn ran(&mut self, check: &str) {
        self.checks.push(check.into());
    }
}

fn worse(a: IntegrityStatus, b: IntegrityStatus) -> IntegrityStatus {
    use IntegrityStatus::*;
    match (a, b) {
        (Corrupt, _) | (_, Corrupt) => Corrupt,
        (Suspect, _) | (_, Suspect) => Suspect,
        _ => Ok,
    }
}

fn issue_empty() -> IntegrityIssue {
    IntegrityIssue {
        code: "empty".into(),
        message: "file is empty".into(),
    }
}

/// Guess kind from magic bytes, falling back to filename extension.
pub fn detect_kind(bytes: &[u8], hint_name: Option<&str>) -> FileKind {
    if let Some(kind) = kind_from_magic(bytes) {
        return kind;
    }
    kind_from_extension(hint_name).unwrap_or(if looks_like_text(bytes) {
        FileKind::Text
    } else if bytes.is_empty() {
        FileKind::Unknown
    } else {
        FileKind::Binary
    })
}

fn kind_from_magic(bytes: &[u8]) -> Option<FileKind> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n']) {
        return Some(FileKind::Png);
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some(FileKind::Jpeg);
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some(FileKind::Gif);
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some(FileKind::Webp);
    }
    if bytes.starts_with(b"%PDF-") {
        return Some(FileKind::Pdf);
    }
    if bytes.starts_with(&[0x50, 0x4b, 0x03, 0x04])
        || bytes.starts_with(&[0x50, 0x4b, 0x05, 0x06])
        || bytes.starts_with(&[0x50, 0x4b, 0x07, 0x08])
    {
        return Some(FileKind::Zip);
    }
    if looks_like_svg(bytes) {
        return Some(FileKind::Svg);
    }
    None
}

fn kind_from_extension(hint_name: Option<&str>) -> Option<FileKind> {
    let name = hint_name?.to_ascii_lowercase();
    let ext = name.rsplit_once('.').map(|(_, e)| e)?;
    Some(match ext {
        "md" | "txt" | "csv" | "tsv" | "log" | "html" | "htm" | "css" | "js" | "ts" | "tsx"
        | "jsx" | "rs" | "py" | "toml" | "yaml" | "yml" => FileKind::Text,
        "json" | "jsonl" => FileKind::Json,
        "zip" => FileKind::Zip,
        "docx" => FileKind::Docx,
        "xlsx" => FileKind::Xlsx,
        "png" => FileKind::Png,
        "jpg" | "jpeg" => FileKind::Jpeg,
        "gif" => FileKind::Gif,
        "webp" => FileKind::Webp,
        "pdf" => FileKind::Pdf,
        "svg" => FileKind::Svg,
        _ => return None,
    })
}

fn looks_like_text(bytes: &[u8]) -> bool {
    if bytes.is_empty() {
        return false;
    }
    let sample = &bytes[..bytes.len().min(512)];
    if sample.contains(&0) {
        return false;
    }
    std::str::from_utf8(sample).is_ok()
}

fn looks_like_svg(bytes: &[u8]) -> bool {
    let sample = String::from_utf8_lossy(&bytes[..bytes.len().min(4096)]).to_ascii_lowercase();
    let trimmed = sample.trim_start();
    (trimmed.starts_with("<?xml") || trimmed.starts_with("<svg")) && sample.contains("<svg")
}

/// Probe in-memory bytes. `hint_name` (e.g. `report.docx`) refines ZIP → DOCX/XLSX and
/// flags extension vs magic mismatches.
pub fn probe_bytes(bytes: &[u8], hint_name: Option<&str>) -> IntegrityReport {
    let mut report = IntegrityReport {
        kind: detect_kind(bytes, hint_name),
        status: IntegrityStatus::Ok,
        size_bytes: bytes.len() as u64,
        issues: Vec::new(),
        checks: Vec::new(),
    };
    report.ran("size");

    if bytes.is_empty() {
        report.issues.push(issue_empty());
        report.status = IntegrityStatus::Corrupt;
        report.ran("empty");
        return report;
    }

    if let Some(ext_kind) = kind_from_extension(hint_name) {
        report.ran("extension");
        if let Some(magic_kind) = kind_from_magic(bytes) {
            let magic_family = family(magic_kind);
            let ext_family = family(ext_kind);
            if magic_family != ext_family {
                report.push_issue(
                    "extension_mismatch",
                    format!("extension suggests {ext_kind:?}, magic suggests {magic_kind:?}"),
                    IntegrityStatus::Suspect,
                );
            }
            // Prefer magic for ZIP containers; refine with extension for Office.
            report.kind = match (magic_kind, ext_kind) {
                (FileKind::Zip, FileKind::Docx) => FileKind::Docx,
                (FileKind::Zip, FileKind::Xlsx) => FileKind::Xlsx,
                (FileKind::Zip, _) => FileKind::Zip,
                (k, _) => k,
            };
        } else if matches!(
            ext_kind,
            FileKind::Png
                | FileKind::Jpeg
                | FileKind::Gif
                | FileKind::Webp
                | FileKind::Pdf
                | FileKind::Zip
                | FileKind::Docx
                | FileKind::Xlsx
        ) {
            report.kind = ext_kind;
            report.push_issue(
                "missing_magic",
                format!("expected {ext_kind:?} signature missing"),
                IntegrityStatus::Corrupt,
            );
        } else {
            report.kind = ext_kind;
        }
    }

    match report.kind {
        FileKind::Text => check_text(&mut report, bytes),
        FileKind::Json => check_json(&mut report, bytes),
        FileKind::Svg => check_svg(&mut report, bytes),
        FileKind::Png => check_png(&mut report, bytes),
        FileKind::Jpeg => check_jpeg(&mut report, bytes),
        FileKind::Gif => check_gif(&mut report, bytes),
        FileKind::Webp => check_webp(&mut report, bytes),
        FileKind::Pdf => check_pdf(&mut report, bytes),
        FileKind::Zip => check_zip(&mut report, bytes, None),
        FileKind::Docx => check_zip(&mut report, bytes, Some("word/document.xml")),
        FileKind::Xlsx => check_zip(&mut report, bytes, Some("xl/workbook.xml")),
        FileKind::Binary | FileKind::Unknown => {
            report.ran("binary_passthrough");
        }
    }

    report
}

fn family(kind: FileKind) -> &'static str {
    match kind {
        FileKind::Zip | FileKind::Docx | FileKind::Xlsx => "zip",
        FileKind::Png => "png",
        FileKind::Jpeg => "jpeg",
        FileKind::Gif => "gif",
        FileKind::Webp => "webp",
        FileKind::Pdf => "pdf",
        FileKind::Svg => "svg",
        FileKind::Json => "json",
        FileKind::Text => "text",
        FileKind::Binary | FileKind::Unknown => "other",
    }
}

fn check_text(report: &mut IntegrityReport, bytes: &[u8]) {
    report.ran("utf8");
    if bytes.contains(&0) {
        report.push_issue(
            "nul_byte",
            "NUL byte in text payload",
            IntegrityStatus::Suspect,
        );
    }
    if let Err(e) = std::str::from_utf8(bytes) {
        report.push_issue(
            "bad_utf8",
            format!("invalid UTF-8 at byte {}", e.valid_up_to()),
            IntegrityStatus::Corrupt,
        );
    }
}

fn check_json(report: &mut IntegrityReport, bytes: &[u8]) {
    check_text(report, bytes);
    if report.status == IntegrityStatus::Corrupt {
        return;
    }
    report.ran("json_parse");
    match serde_json::from_slice::<serde_json::Value>(bytes) {
        Ok(_) => {}
        Err(e) => report.push_issue(
            "invalid_json",
            e.to_string(),
            IntegrityStatus::Corrupt,
        ),
    }
}

fn check_svg(report: &mut IntegrityReport, bytes: &[u8]) {
    check_text(report, bytes);
    report.ran("svg_root");
    let sample = String::from_utf8_lossy(bytes).to_ascii_lowercase();
    if !sample.contains("<svg") {
        report.push_issue(
            "missing_svg_root",
            "no <svg> element found",
            IntegrityStatus::Corrupt,
        );
    }
}

fn check_png(report: &mut IntegrityReport, bytes: &[u8]) {
    report.ran("png_signature");
    const SIG: &[u8] = &[0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];
    if !bytes.starts_with(SIG) {
        report.push_issue(
            "bad_png_signature",
            "PNG signature missing",
            IntegrityStatus::Corrupt,
        );
        return;
    }
    report.ran("png_ihdr");
    // IHDR: length(4) + type(4) + data(13) + crc(4) after signature
    if bytes.len() < 8 + 8 + 13 + 4 {
        report.push_issue(
            "truncated_png",
            "PNG shorter than IHDR chunk",
            IntegrityStatus::Corrupt,
        );
        return;
    }
    let len = u32::from_be_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]);
    let ty = &bytes[12..16];
    if ty != b"IHDR" || len != 13 {
        report.push_issue(
            "bad_png_ihdr",
            "first chunk is not a valid IHDR",
            IntegrityStatus::Corrupt,
        );
    }
}

fn check_jpeg(report: &mut IntegrityReport, bytes: &[u8]) {
    report.ran("jpeg_soi");
    if !bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        report.push_issue(
            "bad_jpeg_soi",
            "JPEG SOI marker missing",
            IntegrityStatus::Corrupt,
        );
        return;
    }
    report.ran("jpeg_eoi");
    let has_eoi = bytes.windows(2).rev().take(64).any(|w| w == [0xff, 0xd9]);
    if !has_eoi {
        report.push_issue(
            "missing_jpeg_eoi",
            "JPEG EOI marker not found near end (truncated?)",
            IntegrityStatus::Suspect,
        );
    }
}

fn check_gif(report: &mut IntegrityReport, bytes: &[u8]) {
    report.ran("gif_signature");
    if !(bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a")) {
        report.push_issue(
            "bad_gif_signature",
            "GIF signature missing",
            IntegrityStatus::Corrupt,
        );
        return;
    }
    if bytes.len() < 13 {
        report.push_issue(
            "truncated_gif",
            "GIF shorter than logical screen descriptor",
            IntegrityStatus::Corrupt,
        );
    }
}

fn check_webp(report: &mut IntegrityReport, bytes: &[u8]) {
    report.ran("webp_riff");
    if bytes.len() < 12 || !bytes.starts_with(b"RIFF") || &bytes[8..12] != b"WEBP" {
        report.push_issue(
            "bad_webp_riff",
            "RIFF/WEBP header missing",
            IntegrityStatus::Corrupt,
        );
        return;
    }
    let declared = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as u64;
    // RIFF size counts bytes after the size field; on-disk size should be declared + 8.
    if declared.saturating_add(8) > report.size_bytes {
        report.push_issue(
            "truncated_webp",
            format!("RIFF size {declared} exceeds file length {}", report.size_bytes),
            IntegrityStatus::Suspect,
        );
    }
}

fn check_pdf(report: &mut IntegrityReport, bytes: &[u8]) {
    report.ran("pdf_header");
    if !bytes.starts_with(b"%PDF-") {
        report.push_issue(
            "bad_pdf_header",
            "%PDF- header missing",
            IntegrityStatus::Corrupt,
        );
        return;
    }
    report.ran("pdf_eof");
    let tail = &bytes[bytes.len().saturating_sub(2048)..];
    if !tail.windows(5).any(|w| w == b"%%EOF") {
        report.push_issue(
            "missing_pdf_eof",
            "%%EOF not found near end (truncated?)",
            IntegrityStatus::Suspect,
        );
    }
}

fn check_zip(report: &mut IntegrityReport, bytes: &[u8], required_entry: Option<&str>) {
    report.ran("zip_open");
    let cursor = Cursor::new(bytes);
    let mut archive = match ZipArchive::new(cursor) {
        Ok(a) => a,
        Err(e) => {
            report.push_issue(
                "zip_broken",
                format!("cannot open ZIP archive: {e}"),
                IntegrityStatus::Corrupt,
            );
            return;
        }
    };
    report.ran("zip_entries");
    if archive.is_empty() {
        report.push_issue(
            "zip_empty",
            "ZIP archive has no entries",
            IntegrityStatus::Suspect,
        );
    }
    if let Some(required) = required_entry {
        report.ran("zip_required_entry");
        match archive.by_name(required) {
            Ok(_) => {}
            Err(_) => report.push_issue(
                "zip_missing_entry",
                format!("required entry `{required}` missing"),
                IntegrityStatus::Corrupt,
            ),
        }
    }
}

/// Read up to [`MAX_PROBE_BYTES`] from disk and probe.
pub fn probe_path(path: &Path) -> Result<IntegrityReport, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("NotFound:{e}"))?;
    if !meta.is_file() {
        return Err(format!("NotAFile:{}", path.display()));
    }
    if meta.len() > MAX_PROBE_BYTES {
        // Still check the header of large files.
        let mut file = std::fs::File::open(path).map_err(|e| format!("NotFound:{e}"))?;
        let mut buf = vec![0u8; MAX_PROBE_BYTES as usize];
        let n = std::io::Read::read(&mut file, &mut buf).map_err(|e| e.to_string())?;
        buf.truncate(n);
        let hint = path.file_name().and_then(|n| n.to_str());
        let mut report = probe_bytes(&buf, hint);
        report.size_bytes = meta.len();
        report.ran("partial_read");
        if report.status == IntegrityStatus::Ok {
            report.push_issue(
                "partial_probe",
                format!("only first {MAX_PROBE_BYTES} bytes checked"),
                IntegrityStatus::Suspect,
            );
        }
        return Ok(report);
    }
    let bytes = std::fs::read(path).map_err(|e| format!("NotFound:{e}"))?;
    let hint = path.file_name().and_then(|n| n.to_str());
    Ok(probe_bytes(&bytes, hint))
}

/// Convenience: `true` when status is [`IntegrityStatus::Ok`].
pub fn is_healthy(report: &IntegrityReport) -> bool {
    report.status == IntegrityStatus::Ok
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_is_corrupt() {
        let r = probe_bytes(b"", Some("a.txt"));
        assert_eq!(r.status, IntegrityStatus::Corrupt);
        assert!(r.issues.iter().any(|i| i.code == "empty"));
    }

    #[test]
    fn png_ok_and_truncated() {
        let mut png = vec![0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];
        png.extend_from_slice(&13u32.to_be_bytes());
        png.extend_from_slice(b"IHDR");
        png.extend(std::iter::repeat_n(0u8, 13 + 4));
        let ok = probe_bytes(&png, Some("x.png"));
        assert_eq!(ok.kind, FileKind::Png);
        assert_eq!(ok.status, IntegrityStatus::Ok);

        let bad = probe_bytes(&[0x89, b'P', b'N', b'G'], Some("x.png"));
        assert_eq!(bad.status, IntegrityStatus::Corrupt);
    }

    #[test]
    fn jpeg_missing_eoi_is_suspect() {
        let r = probe_bytes(&[0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], Some("a.jpg"));
        assert_eq!(r.kind, FileKind::Jpeg);
        assert_eq!(r.status, IntegrityStatus::Suspect);
    }

    #[test]
    fn json_invalid_is_corrupt() {
        let r = probe_bytes(b"{not json", Some("a.json"));
        assert_eq!(r.status, IntegrityStatus::Corrupt);
        assert!(r.issues.iter().any(|i| i.code == "invalid_json"));
    }

    #[test]
    fn extension_mismatch_is_suspect() {
        let mut png = vec![0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];
        png.extend_from_slice(&13u32.to_be_bytes());
        png.extend_from_slice(b"IHDR");
        png.extend(std::iter::repeat_n(0u8, 13 + 4));
        let r = probe_bytes(&png, Some("notes.pdf"));
        assert_eq!(r.kind, FileKind::Png);
        assert_eq!(r.status, IntegrityStatus::Suspect);
        assert!(r.issues.iter().any(|i| i.code == "extension_mismatch"));
    }

    #[test]
    fn docx_requires_document_xml() {
        // Minimal empty ZIP (EOCD only) — opens but has no word/document.xml
        let empty_zip: &[u8] = &[
            0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        let r = probe_bytes(empty_zip, Some("essay.docx"));
        assert_eq!(r.kind, FileKind::Docx);
        assert_eq!(r.status, IntegrityStatus::Corrupt);
        assert!(r.issues.iter().any(|i| i.code == "zip_missing_entry"));
    }

    #[test]
    fn pdf_header_and_eof() {
        let mut pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\n".to_vec();
        pdf.extend_from_slice(b"%%EOF\n");
        let ok = probe_bytes(&pdf, Some("a.pdf"));
        assert_eq!(ok.status, IntegrityStatus::Ok);

        let trunc = probe_bytes(b"%PDF-1.4\ntrailer", Some("a.pdf"));
        assert_eq!(trunc.status, IntegrityStatus::Suspect);
    }
}
