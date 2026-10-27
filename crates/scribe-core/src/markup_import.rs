//! Lightweight markup / calendar / mail → TipTap (lossy by design).
//!
//! Covers: Org, reStructuredText, AsciiDoc, Fountain, MediaWiki-ish,
//! iCalendar (.ics), and basic .eml.

use serde_json::{json, Value};

const EMPTY_DOC_JSON: &str = r#"{"type":"doc","content":[{"type":"paragraph"}]}"#;
const MAX_CHARS: usize = 800_000;
const MAX_EVENTS: usize = 200;

pub fn markup_bytes_to_tiptap(ext: &str, bytes: &[u8]) -> Result<String, String> {
    let text = decode_text(bytes);
    match ext.to_ascii_lowercase().as_str() {
        "org" => Ok(org_text_to_tiptap(&text)),
        "rst" | "rest" => Ok(rst_text_to_tiptap(&text)),
        "adoc" | "asciidoc" | "asc" => Ok(adoc_text_to_tiptap(&text)),
        "fountain" | "spmd" => Ok(fountain_text_to_tiptap(&text)),
        "wiki" | "mediawiki" => Ok(wiki_text_to_tiptap(&text)),
        "ics" | "ical" | "ifb" => Ok(ics_text_to_tiptap(&text)),
        "eml" => Ok(eml_text_to_tiptap(&text)),
        _ => Err(format!("Unsupported markup extension: .{ext}")),
    }
}

pub fn is_markup_extension(ext: &str) -> bool {
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "org"
            | "rst"
            | "rest"
            | "adoc"
            | "asciidoc"
            | "asc"
            | "fountain"
            | "spmd"
            | "wiki"
            | "mediawiki"
            | "ics"
            | "ical"
            | "ifb"
            | "eml"
    )
}

fn decode_text(bytes: &[u8]) -> String {
    let raw = String::from_utf8_lossy(bytes);
    let truncated = if raw.len() > MAX_CHARS {
        format!("{}\n…", &raw[..MAX_CHARS])
    } else {
        raw.into_owned()
    };
    truncated.replace("\r\n", "\n").replace('\r', "\n")
}

fn paragraph(text: &str) -> Value {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        json!({ "type": "paragraph" })
    } else {
        json!({
            "type": "paragraph",
            "content": [{ "type": "text", "text": trimmed }]
        })
    }
}

fn heading(level: u8, text: &str) -> Value {
    json!({
        "type": "heading",
        "attrs": { "level": level.clamp(1, 6) },
        "content": [{ "type": "text", "text": text.trim() }]
    })
}

fn bullet_list(items: &[String]) -> Value {
    let content: Vec<Value> = items
        .iter()
        .filter(|item| !item.trim().is_empty())
        .map(|item| {
            json!({
                "type": "listItem",
                "content": [paragraph(item)]
            })
        })
        .collect();
    json!({ "type": "bulletList", "content": content })
}

fn finish(nodes: Vec<Value>) -> String {
    let content = if nodes.is_empty() {
        vec![json!({ "type": "paragraph" })]
    } else {
        nodes
    };
    serde_json::to_string(&json!({ "type": "doc", "content": content }))
        .unwrap_or_else(|_| EMPTY_DOC_JSON.to_string())
}

fn flush_list(nodes: &mut Vec<Value>, items: &mut Vec<String>) {
    if !items.is_empty() {
        nodes.push(bullet_list(items));
        items.clear();
    }
}

// ---------------------------------------------------------------- Org

pub fn org_text_to_tiptap(text: &str) -> String {
    let mut nodes = Vec::new();
    let mut list: Vec<String> = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            flush_list(&mut nodes, &mut list);
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("*") {
            let stars = 1 + rest.chars().take_while(|c| *c == '*').count();
            let title = rest.trim_start_matches('*').trim_start();
            if !title.is_empty() && stars <= 6 {
                flush_list(&mut nodes, &mut list);
                nodes.push(heading(stars as u8, title));
                continue;
            }
        }
        if let Some(item) = trimmed
            .strip_prefix("- ")
            .or_else(|| trimmed.strip_prefix("+ "))
            .or_else(|| trimmed.strip_prefix("* "))
        {
            list.push(item.to_string());
            continue;
        }
        flush_list(&mut nodes, &mut list);
        nodes.push(paragraph(trimmed));
    }
    flush_list(&mut nodes, &mut list);
    finish(nodes)
}

// ---------------------------------------------------------------- RST

pub fn rst_text_to_tiptap(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let mut nodes = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i].trim_end();
        if line.is_empty() {
            i += 1;
            continue;
        }
        if i + 1 < lines.len() {
            let underline = lines[i + 1].trim_end();
            if is_rst_underline(underline) && underline.chars().count() >= line.chars().count() {
                let level = match underline.chars().next() {
                    Some('=') => 1,
                    Some('-') => 2,
                    Some('~') | Some('^') => 3,
                    Some('"') | Some('\'') => 4,
                    _ => 2,
                };
                nodes.push(heading(level, line));
                i += 2;
                continue;
            }
        }
        if let Some(item) = line.strip_prefix("- ").or_else(|| line.strip_prefix("* ")) {
            let mut items = vec![item.to_string()];
            i += 1;
            while i < lines.len() {
                let next = lines[i].trim_end();
                if let Some(more) = next.strip_prefix("- ").or_else(|| next.strip_prefix("* ")) {
                    items.push(more.to_string());
                    i += 1;
                } else {
                    break;
                }
            }
            nodes.push(bullet_list(&items));
            continue;
        }
        nodes.push(paragraph(line));
        i += 1;
    }
    finish(nodes)
}

fn is_rst_underline(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.len() < 2 {
        return false;
    }
    let first = trimmed.chars().next().unwrap();
    matches!(first, '=' | '-' | '~' | '^' | '"' | '\'' | '`')
        && trimmed.chars().all(|c| c == first)
}

// ---------------------------------------------------------------- AsciiDoc

pub fn adoc_text_to_tiptap(text: &str) -> String {
    let mut nodes = Vec::new();
    let mut list: Vec<String> = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            flush_list(&mut nodes, &mut list);
            continue;
        }
        if trimmed.starts_with('=') {
            let level = trimmed.chars().take_while(|c| *c == '=').count().clamp(1, 6);
            let title = trimmed.trim_start_matches('=').trim();
            if !title.is_empty() {
                flush_list(&mut nodes, &mut list);
                nodes.push(heading(level as u8, title));
                continue;
            }
        }
        if let Some(item) = trimmed.strip_prefix("* ").or_else(|| trimmed.strip_prefix("- ")) {
            list.push(item.to_string());
            continue;
        }
        flush_list(&mut nodes, &mut list);
        nodes.push(paragraph(trimmed));
    }
    flush_list(&mut nodes, &mut list);
    finish(nodes)
}

// ---------------------------------------------------------------- Fountain

pub fn fountain_text_to_tiptap(text: &str) -> String {
    let mut nodes = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            continue;
        }
        let upper = trimmed.to_ascii_uppercase();
        if upper.starts_with("INT.")
            || upper.starts_with("EXT.")
            || upper.starts_with("INT/EXT")
            || upper.starts_with("I/E")
            || trimmed.starts_with('.')
        {
            let title = trimmed.trim_start_matches('.').trim();
            nodes.push(heading(2, title));
            continue;
        }
        if is_fountain_character(trimmed) {
            nodes.push(json!({
                "type": "paragraph",
                "content": [{
                    "type": "text",
                    "marks": [{ "type": "bold" }],
                    "text": trimmed.trim()
                }]
            }));
            continue;
        }
        nodes.push(paragraph(trimmed));
    }
    finish(nodes)
}

fn is_fountain_character(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.contains('.') {
        return false;
    }
    let letters: String = trimmed
        .chars()
        .filter(|c| c.is_alphabetic())
        .collect();
    !letters.is_empty() && letters.chars().all(|c| c.is_uppercase())
}

// ---------------------------------------------------------------- Wiki

pub fn wiki_text_to_tiptap(text: &str) -> String {
    let mut nodes = Vec::new();
    let mut list: Vec<String> = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            flush_list(&mut nodes, &mut list);
            continue;
        }
        if trimmed.starts_with('=') && trimmed.ends_with('=') {
            let level = trimmed.chars().take_while(|c| *c == '=').count().clamp(1, 6);
            let title = trimmed.trim_matches('=').trim();
            if !title.is_empty() {
                flush_list(&mut nodes, &mut list);
                nodes.push(heading(level as u8, title));
                continue;
            }
        }
        if let Some(item) = trimmed.strip_prefix("* ").or_else(|| trimmed.strip_prefix("# ")) {
            list.push(item.to_string());
            continue;
        }
        flush_list(&mut nodes, &mut list);
        nodes.push(paragraph(trimmed));
    }
    flush_list(&mut nodes, &mut list);
    finish(nodes)
}

// ---------------------------------------------------------------- ICS

pub fn ics_text_to_tiptap(text: &str) -> String {
    let unfolded = unfold_ics(text);
    let mut nodes = vec![heading(1, "Calendar")];
    let mut count = 0usize;
    let mut in_event = false;
    let mut summary = String::new();
    let mut dtstart = String::new();
    let mut description = String::new();

    let flush = |nodes: &mut Vec<Value>,
                 summary: &mut String,
                 dtstart: &mut String,
                 description: &mut String,
                 count: &mut usize| {
        if summary.is_empty() && dtstart.is_empty() {
            summary.clear();
            dtstart.clear();
            description.clear();
            return;
        }
        if *count >= MAX_EVENTS {
            return;
        }
        *count += 1;
        let title = if summary.is_empty() {
            format!("Event {}", *count)
        } else {
            summary.clone()
        };
        nodes.push(heading(2, &title));
        if !dtstart.is_empty() {
            nodes.push(paragraph(&format!("When: {}", format_ics_date(dtstart))));
        }
        if !description.is_empty() {
            nodes.push(paragraph(description));
        }
        summary.clear();
        dtstart.clear();
        description.clear();
    };

    for line in unfolded.lines() {
        let upper = line.to_ascii_uppercase();
        if upper == "BEGIN:VEVENT" {
            in_event = true;
            summary.clear();
            dtstart.clear();
            description.clear();
            continue;
        }
        if upper == "END:VEVENT" {
            flush(
                &mut nodes,
                &mut summary,
                &mut dtstart,
                &mut description,
                &mut count,
            );
            in_event = false;
            continue;
        }
        if !in_event {
            continue;
        }
        if let Some(value) = ics_prop(line, "SUMMARY") {
            summary = unescape_ics(value);
        } else if let Some(value) = ics_prop(line, "DTSTART") {
            dtstart = value.to_string();
        } else if let Some(value) = ics_prop(line, "DESCRIPTION") {
            description = unescape_ics(value);
        }
    }
    if nodes.len() == 1 {
        nodes.push(paragraph("No events found."));
    }
    finish(nodes)
}

fn unfold_ics(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for line in text.lines() {
        if line.starts_with(' ') || line.starts_with('\t') {
            out.push_str(line.trim_start());
        } else {
            if !out.is_empty() {
                out.push('\n');
            }
            out.push_str(line);
        }
    }
    out
}

fn ics_prop<'a>(line: &'a str, name: &str) -> Option<&'a str> {
    let upper = line.to_ascii_uppercase();
    let prefix = format!("{name}:");
    let prefix_param = format!("{name};");
    if upper.starts_with(&prefix) {
        return Some(&line[name.len() + 1..]);
    }
    if upper.starts_with(&prefix_param) {
        return line.split_once(':').map(|(_, v)| v);
    }
    None
}

fn unescape_ics(value: &str) -> String {
    value
        .replace("\\n", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
}

fn format_ics_date(raw: &str) -> String {
    let cleaned = raw.split(':').next_back().unwrap_or(raw).trim();
    if cleaned.len() >= 8 && cleaned.as_bytes().iter().take(8).all(u8::is_ascii_digit) {
        let y = &cleaned[0..4];
        let m = &cleaned[4..6];
        let d = &cleaned[6..8];
        if cleaned.len() >= 15 {
            let hh = &cleaned[9..11];
            let mm = &cleaned[11..13];
            return format!("{y}-{m}-{d} {hh}:{mm}");
        }
        return format!("{y}-{m}-{d}");
    }
    cleaned.to_string()
}

// ---------------------------------------------------------------- EML

pub fn eml_text_to_tiptap(text: &str) -> String {
    let (headers, body) = split_eml(text);
    let subject = header_value(&headers, "Subject").unwrap_or_else(|| "Email".into());
    let from = header_value(&headers, "From").unwrap_or_default();
    let date = header_value(&headers, "Date").unwrap_or_default();
    let mut nodes = vec![heading(1, &subject)];
    if !from.is_empty() {
        nodes.push(paragraph(&format!("From: {from}")));
    }
    if !date.is_empty() {
        nodes.push(paragraph(&format!("Date: {date}")));
    }
    let content_type = header_value(&headers, "Content-Type").unwrap_or_default();
    let body_text = if content_type.to_ascii_lowercase().contains("text/html") {
        strip_simple_html(&extract_eml_body(body, &content_type))
    } else {
        extract_eml_body(body, &content_type)
    };
    for block in body_text.split("\n\n") {
        let trimmed = block.trim();
        if !trimmed.is_empty() {
            nodes.push(paragraph(trimmed));
        }
    }
    finish(nodes)
}

fn split_eml(text: &str) -> (String, &str) {
    if let Some(idx) = text.find("\n\n") {
        (text[..idx].to_string(), &text[idx + 2..])
    } else {
        (text.to_string(), "")
    }
}

fn header_value(headers: &str, name: &str) -> Option<String> {
    let mut value = String::new();
    let mut matched = false;
    for line in headers.lines() {
        if matched && (line.starts_with(' ') || line.starts_with('\t')) {
            value.push(' ');
            value.push_str(line.trim());
            continue;
        }
        matched = false;
        if let Some((n, v)) = line.split_once(':') {
            if n.trim().eq_ignore_ascii_case(name) {
                value = v.trim().to_string();
                matched = true;
            }
        }
    }
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn extract_eml_body(body: &str, content_type: &str) -> String {
    let lower = content_type.to_ascii_lowercase();
    if let Some(boundary) = lower
        .split(';')
        .find_map(|part| part.trim().strip_prefix("boundary="))
    {
        let boundary = boundary.trim_matches('"');
        let marker = format!("--{boundary}");
        let mut plain = String::new();
        let mut html = String::new();
        for part in body.split(&marker) {
            let part = part.trim().trim_start_matches("--").trim();
            if part.is_empty() || part == "--" {
                continue;
            }
            let (ph, pb) = split_eml(part);
            let ct = header_value(&ph, "Content-Type").unwrap_or_default();
            if ct.to_ascii_lowercase().contains("text/plain") && plain.is_empty() {
                plain = pb.to_string();
            } else if ct.to_ascii_lowercase().contains("text/html") && html.is_empty() {
                html = pb.to_string();
            }
        }
        if !plain.is_empty() {
            return plain;
        }
        if !html.is_empty() {
            return html;
        }
    }
    body.to_string()
}

fn strip_simple_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
}

fn code_block(language: &str, code: &str) -> Value {
    json!({
        "type": "codeBlock",
        "attrs": { "language": language },
        "content": [{ "type": "text", "text": code }]
    })
}

fn ordered_list(items: &[String]) -> Value {
    let content: Vec<Value> = items
        .iter()
        .filter(|item| !item.trim().is_empty())
        .map(|item| {
            json!({
                "type": "listItem",
                "content": [paragraph(item)]
            })
        })
        .collect();
    json!({ "type": "orderedList", "content": content })
}

fn flush_ordered(nodes: &mut Vec<Value>, items: &mut Vec<String>) {
    if !items.is_empty() {
        nodes.push(ordered_list(items));
        items.clear();
    }
}

/// CommonMark-ish → TipTap for file import (lossy). Live editor keeps TipTap Markdown.
pub fn markdown_to_tiptap(text: &str) -> String {
    let source = if text.len() > MAX_CHARS {
        format!("{}\n…", &text[..MAX_CHARS])
    } else {
        text.replace("\r\n", "\n").replace('\r', "\n")
    };
    let lines: Vec<&str> = source.lines().collect();
    let mut nodes = Vec::new();
    let mut bullet: Vec<String> = Vec::new();
    let mut ordered: Vec<String> = Vec::new();
    let mut i = 0usize;

    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim_end();

        if trimmed.starts_with("```") {
            flush_list(&mut nodes, &mut bullet);
            flush_ordered(&mut nodes, &mut ordered);
            let lang = trimmed.trim_start_matches('`').trim().to_string();
            i += 1;
            let mut body = String::new();
            while i < lines.len() && !lines[i].trim_end().starts_with("```") {
                if !body.is_empty() {
                    body.push('\n');
                }
                body.push_str(lines[i]);
                i += 1;
            }
            nodes.push(code_block(&lang, &body));
            if i < lines.len() {
                i += 1; // closing fence
            }
            continue;
        }

        if trimmed.is_empty() {
            flush_list(&mut nodes, &mut bullet);
            flush_ordered(&mut nodes, &mut ordered);
            i += 1;
            continue;
        }

        if let Some(rest) = trimmed.strip_prefix('#') {
            let level = 1 + rest.chars().take_while(|c| *c == '#').count();
            let title = rest.trim_start_matches('#').trim();
            if !title.is_empty() && level <= 6 {
                flush_list(&mut nodes, &mut bullet);
                flush_ordered(&mut nodes, &mut ordered);
                nodes.push(heading(level as u8, title));
                i += 1;
                continue;
            }
        }

        if let Some(item) = trimmed
            .strip_prefix("- ")
            .or_else(|| trimmed.strip_prefix("* "))
            .or_else(|| trimmed.strip_prefix("+ "))
        {
            flush_ordered(&mut nodes, &mut ordered);
            bullet.push(strip_md_inline(item));
            i += 1;
            continue;
        }

        if let Some(item) = ordered_item(trimmed) {
            flush_list(&mut nodes, &mut bullet);
            ordered.push(strip_md_inline(item));
            i += 1;
            continue;
        }

        if trimmed.starts_with("> ") || trimmed == ">" {
            flush_list(&mut nodes, &mut bullet);
            flush_ordered(&mut nodes, &mut ordered);
            let quote = trimmed.strip_prefix("> ").unwrap_or("");
            nodes.push(json!({
                "type": "blockquote",
                "content": [paragraph(&strip_md_inline(quote))]
            }));
            i += 1;
            continue;
        }

        flush_list(&mut nodes, &mut bullet);
        flush_ordered(&mut nodes, &mut ordered);
        nodes.push(paragraph(&strip_md_inline(trimmed)));
        i += 1;
    }

    flush_list(&mut nodes, &mut bullet);
    flush_ordered(&mut nodes, &mut ordered);
    finish(nodes)
}

fn ordered_item(line: &str) -> Option<&str> {
    let bytes = line.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i == 0 || i + 1 >= bytes.len() {
        return None;
    }
    if bytes[i] == b'.' && bytes[i + 1] == b' ' {
        return Some(line[i + 2..].trim());
    }
    None
}

fn strip_md_inline(text: &str) -> String {
    let mut out = text.to_string();
    for marker in ["**", "__", "*", "_", "`"] {
        out = out.replace(marker, "");
    }
    // [label](url) → label
    while let Some(start) = out.find('[') {
        let Some(mid) = out[start..].find("](") else { break };
        let mid = start + mid;
        let Some(end_rel) = out[mid + 2..].find(')') else { break };
        let end = mid + 2 + end_rel;
        let label = out[start + 1..mid].to_string();
        out.replace_range(start..=end, &label);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn org_headings_and_list() {
        let json = org_text_to_tiptap("* Title\n\n- one\n- two\n\nBody");
        assert!(json.contains("\"heading\""));
        assert!(json.contains("\"bulletList\""));
        assert!(json.contains("Title"));
    }

    #[test]
    fn ics_events() {
        let ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Standup\nDTSTART:20261025\nDESCRIPTION:Daily sync\nEND:VEVENT\nEND:VCALENDAR\n";
        let json = ics_text_to_tiptap(ics);
        assert!(json.contains("Standup"));
        assert!(json.contains("2026-10-25"));
    }

    #[test]
    fn eml_subject() {
        let eml = "From: a@b.test\nSubject: Hello\n\nBody line\n";
        let json = eml_text_to_tiptap(eml);
        assert!(json.contains("Hello"));
        assert!(json.contains("Body line"));
    }

    #[test]
    fn markup_ext_dispatch() {
        assert!(is_markup_extension("org"));
        assert!(is_markup_extension("ics"));
        assert!(is_markup_extension("eml"));
        assert!(!is_markup_extension("md"));
    }

    #[test]
    fn markdown_headings_lists_and_code() {
        let json = markdown_to_tiptap(
            "# Title\n\n- one\n- two\n\n1. first\n\n```rs\nfn main() {}\n```\n\nBody **bold**",
        );
        assert!(json.contains("\"heading\""));
        assert!(json.contains("\"bulletList\""));
        assert!(json.contains("\"orderedList\""));
        assert!(json.contains("\"codeBlock\""));
        assert!(json.contains("Title"));
        assert!(json.contains("Body bold"));
    }
}
