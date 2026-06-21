use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn textutil_convert(input: &Path, format: &str, output: &Path) -> Result<(), String> {
    let status = Command::new("/usr/bin/textutil")
        .arg("-convert")
        .arg(format)
        .arg("-output")
        .arg(output)
        .arg(input)
        .status()
        .map_err(|e| format!("textutil zlyhal: {e}"))?;

    if !status.success() {
        return Err(format!("Konverzia do {format} zlyhala"));
    }

    Ok(())
}

pub fn textutil_to_stdout(input: &Path, format: &str) -> Result<String, String> {
    let output = Command::new("/usr/bin/textutil")
        .arg("-convert")
        .arg(format)
        .arg("-stdout")
        .arg(input)
        .output()
        .map_err(|e| format!("textutil zlyhal: {e}"))?;

    if !output.status.success() {
        return Err("Nepodarilo sa prečítať súbor cez textutil".to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn export_html_to_pdf(html: &str, output: &Path) -> Result<(), String> {
    let temp_dir = std::env::temp_dir().join(format!("scribe-export-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let html_path = temp_dir.join("export.html");
    std::fs::write(&html_path, html).map_err(|e| e.to_string())?;
    let result = textutil_convert(&html_path, "pdf", output);
    let _ = std::fs::remove_dir_all(temp_dir);
    result
}

pub fn export_html_to_docx(html: &str, output: &Path) -> Result<(), String> {
    let temp_dir = std::env::temp_dir().join(format!("scribe-export-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let html_path = temp_dir.join("export.html");
    std::fs::write(&html_path, html).map_err(|e| e.to_string())?;
    let result = textutil_convert(&html_path, "docx", output);
    let _ = std::fs::remove_dir_all(temp_dir);
    result
}

pub fn export_plain_text(text: &str, output: &Path) -> Result<(), String> {
    std::fs::write(output, text).map_err(|e| e.to_string())
}

pub fn export_markdown(text: &str, output: &Path) -> Result<(), String> {
    std::fs::write(output, text).map_err(|e| e.to_string())
}

pub fn pages_app_installed() -> bool {
    Path::new("/Applications/Pages.app").exists()
}

fn escape_applescript_string(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
}

fn applescript_text_literal(text: &str) -> String {
    let normalized = text.replace("\r\n", "\n");
    let lines: Vec<&str> = normalized.split('\n').collect();

    if lines.is_empty() {
        return "\"\"".to_string();
    }

    lines
        .iter()
        .map(|line| format!("\"{}\"", escape_applescript_string(line)))
        .collect::<Vec<_>>()
        .join(" & return & ")
}

pub fn export_text_to_pages(text: &str, output: &Path) -> Result<(), String> {
    if !pages_app_installed() {
        return Err(
            "Na export .pages je potrebná aplikácia Apple Pages (nainštalujte z App Store)."
                .to_string(),
        );
    }

    let output_str = output.to_string_lossy();
    let escaped_path = escape_applescript_string(&output_str);
    let doc_text_expr = applescript_text_literal(text);

    let script = format!(
        r#"set docText to {doc_text_expr}
set outPath to POSIX file "{escaped_path}"
tell application "Pages"
    set newDoc to make new document
    tell newDoc
        set body text to docText
    end tell
    save newDoc in outPath
    close newDoc saving no
end tell"#
    );

    let temp_script = std::env::temp_dir().join(format!("scribe-pages-{}.scpt", uuid::Uuid::new_v4()));
    std::fs::write(&temp_script, script).map_err(|e| e.to_string())?;

    let output_cmd = Command::new("/usr/bin/osascript")
        .arg(&temp_script)
        .output()
        .map_err(|e| format!("osascript zlyhal: {e}"))?;

    let _ = std::fs::remove_file(&temp_script);

    if !output_cmd.status.success() {
        let stderr = String::from_utf8_lossy(&output_cmd.stderr);
        return Err(format!(
            "Export do .pages zlyhal. Skontrolujte, či je Apple Pages nainštalovaný. {stderr}"
        ));
    }

    if !output.exists() {
        return Err("Súbor .pages sa nepodarilo vytvoriť.".to_string());
    }

    Ok(())
}

pub fn extract_pages_text(path: &Path) -> Result<String, String> {
    // 1) macOS textutil (works for many .pages versions, including bundles)
    if let Ok(text) = textutil_to_stdout(path, "txt") {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    // 2) Apple Pages.app — najspoľahlivejšie pre moderné .pages balíčky
    if pages_app_installed() {
        if let Ok(text) = extract_pages_text_via_pages_app(path) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }

    // 3) Legacy index.xml inside zip alebo bundle priečinok
    if path.is_dir() {
        if let Ok(text) = extract_from_pages_package(path) {
            if !text.trim().is_empty() {
                return Ok(text);
            }
        }
    } else if let Ok(text) = extract_from_pages_zip(path) {
        if !text.trim().is_empty() {
            return Ok(text);
        }
    }

    Err(if pages_app_installed() {
        "Tento .pages súbor sa nepodarilo načítať. Skúste ho otvoriť v Pages a exportovať do .docx alebo .txt."
            .to_string()
    } else {
        "Na import .pages je potrebná aplikácia Apple Pages (App Store), alebo exportujte dokument do .docx / .txt."
            .to_string()
    })
}

pub fn extract_pages_text_via_pages_app(path: &Path) -> Result<String, String> {
    let path_str = path.to_string_lossy();
    let escaped_path = escape_applescript_string(&path_str);

    let script = format!(
        r#"set inPath to POSIX file "{escaped_path}"
tell application "Pages"
    set openedDoc to open inPath
    try
        tell openedDoc
            if document body is false then
                error "Dokument Pages neobsahuje textový obsah."
            end if
            set docText to body text
        end tell
        close openedDoc saving no
        return docText
    on error errMsg number errNum
        try
            close openedDoc saving no
        end try
        error errMsg number errNum
    end try
end tell"#
    );

    let temp_script =
        std::env::temp_dir().join(format!("scribe-pages-import-{}.scpt", uuid::Uuid::new_v4()));
    std::fs::write(&temp_script, script).map_err(|e| e.to_string())?;

    let output = Command::new("/usr/bin/osascript")
        .arg(&temp_script)
        .output()
        .map_err(|e| format!("osascript zlyhal: {e}"))?;

    let _ = std::fs::remove_file(&temp_script);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Pages import zlyhal: {stderr}"));
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return Err("Pages dokument neobsahuje žiadny text.".to_string());
    }

    Ok(text)
}

fn extract_from_pages_package(path: &Path) -> Result<String, String> {
    let xml_candidates = [
        path.join("index.xml"),
        path.join("Index.xml"),
        path.join("Index").join("index.xml"),
        path.join("Index").join("Index.xml"),
    ];

    for candidate in xml_candidates {
        if candidate.is_file() {
            let xml = std::fs::read_to_string(&candidate).map_err(|e| e.to_string())?;
            let text = extract_text_from_pages_xml(&xml);
            if !text.trim().is_empty() {
                return Ok(text);
            }
        }
    }

    let index_zip = path.join("Index.zip");
    if index_zip.is_file() {
        return extract_from_pages_zip(&index_zip);
    }

    Err("index.xml v .pages balíku nenájdený".to_string())
}

fn extract_from_pages_zip(path: &Path) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name.ends_with("index.xml") || name.ends_with("Index.xml") {
            let mut xml = String::new();
            entry.read_to_string(&mut xml).map_err(|e| e.to_string())?;
            return Ok(extract_text_from_pages_xml(&xml));
        }
    }

    Err("index.xml v .pages balíku nenájdený".to_string())
}

fn extract_text_from_pages_xml(xml: &str) -> String {
    let re = regex::Regex::new(r#"(?s)<text[^>]*>(.*?)</text>"#).unwrap();
    let mut parts = Vec::new();
    for cap in re.captures_iter(xml) {
        if let Some(text) = cap.get(1) {
            let value = text
                .as_str()
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'");
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                parts.push(trimmed.to_string());
            }
        }
    }
    parts.join("\n\n")
}

pub fn read_text_file(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("Nepodarilo sa prečítať súbor: {e}"))
}

pub fn import_text_from_file(path: &Path) -> Result<String, String> {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "txt" | "md" | "markdown" => read_text_file(path),
        "docx" | "doc" | "rtf" => textutil_to_stdout(path, "txt"),
        _ => read_text_file(path),
    }
}

pub fn text_to_tiptap_json(text: &str) -> String {
    let paragraphs: Vec<_> = text
        .split("\n\n")
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(|p| {
            serde_json::json!({
                "type": "paragraph",
                "content": [{ "type": "text", "text": p }]
            })
        })
        .collect();

    let content = if paragraphs.is_empty() {
        vec![serde_json::json!({ "type": "paragraph" })]
    } else {
        paragraphs
    };

    serde_json::json!({ "type": "doc", "content": content }).to_string()
}

pub fn sanitize_export_name(title: &str, ext: &str) -> String {
    let base = crate::storage::sanitize_filename(title);
    format!("{base}.{ext}")
}

pub fn default_export_path(dir: &Path, title: &str, ext: &str) -> PathBuf {
    dir.join(sanitize_export_name(title, ext))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_to_tiptap_json_splits_paragraphs() {
        let json = text_to_tiptap_json("Prvý odsek\n\nDruhý odsek");
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["type"], "doc");
        assert_eq!(value["content"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn sanitize_export_name_strips_unsafe_characters() {
        assert_eq!(sanitize_export_name("Môj dokument / test", "pdf"), "Môj dokument test.pdf");
    }
}
