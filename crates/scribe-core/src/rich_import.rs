//! Extra document importers: ODT/ODS, HTML, RTF, EPUB, PPTX, OPML, JSON.
//!
//! Deliberately lossy — text, headings, bold/italic where cheap. No images.

use std::io::{Cursor, Read, Seek};

use quick_xml::events::{BytesRef, BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use serde_json::{json, Value};
use zip::result::ZipError;
use zip::ZipArchive;

const EMPTY_DOC_JSON: &str = r#"{"type":"doc","content":[{"type":"paragraph"}]}"#;
const MAX_ROWS: usize = 400;
const MAX_COLS: usize = 40;
const MAX_SLIDES: usize = 80;
const MAX_CHAPTERS: usize = 40;

// ---------------------------------------------------------------- ODT

pub fn odt_bytes_to_tiptap(bytes: &[u8]) -> Result<String, String> {
    let mut archive = open_archive(bytes)?;
    let xml = read_entry(&mut archive, "content.xml")?
        .ok_or_else(|| "ODT archive is missing content.xml".to_string())?;
    odt_content_xml_to_tiptap(&xml)
}

fn odt_content_xml_to_tiptap(xml: &str) -> Result<String, String> {
    let mut reader = new_reader(xml);
    let mut nodes: Vec<Value> = Vec::new();
    let mut text = String::new();
    let mut in_text = false;
    let mut heading_level: Option<i64> = None;
    let mut bold = false;
    let mut italic = false;
    let mut marks: Vec<Value> = Vec::new();
    let mut paragraph_parts: Vec<Value> = Vec::new();

    loop {
        match read_event(&mut reader, "odt/content.xml")? {
            Event::Start(tag) => match local_name(tag.name().as_ref()) {
                "h" => {
                    heading_level = attribute(&tag, "outline-level")
                        .and_then(|v| v.parse().ok())
                        .map(|n: i64| n.clamp(1, 6))
                        .or(Some(1));
                    text.clear();
                    paragraph_parts.clear();
                    in_text = true;
                }
                "p" => {
                    heading_level = None;
                    text.clear();
                    paragraph_parts.clear();
                    in_text = true;
                }
                "span" if in_text => {
                    flush_odt_run(&mut text, bold, italic, &mut paragraph_parts);
                    let style = attribute(&tag, "style-name").unwrap_or_default().to_lowercase();
                    bold = style.contains("bold") || style.contains("strong");
                    italic = style.contains("italic") || style.contains("emphasis");
                }
                "s" if in_text => text.push(' '),
                "line-break" | "tab" if in_text => {
                    flush_odt_run(&mut text, bold, italic, &mut paragraph_parts);
                    paragraph_parts.push(json!({ "type": "hardBreak" }));
                }
                _ => {}
            },
            Event::Empty(tag) => match local_name(tag.name().as_ref()) {
                "s" if in_text => text.push(' '),
                "line-break" | "tab" if in_text => {
                    flush_odt_run(&mut text, bold, italic, &mut paragraph_parts);
                    paragraph_parts.push(json!({ "type": "hardBreak" }));
                }
                _ => {}
            },
            Event::End(tag) => match local_name(tag.name().as_ref()) {
                "h" | "p" if in_text => {
                    flush_odt_run(&mut text, bold, italic, &mut paragraph_parts);
                    if let Some(level) = heading_level {
                        let plain = paragraph_parts
                            .iter()
                            .filter_map(|n| n.get("text").and_then(|t| t.as_str()))
                            .collect::<Vec<_>>()
                            .join("");
                        if plain.trim().is_empty() {
                            nodes.push(json!({ "type": "paragraph" }));
                        } else {
                            nodes.push(json!({
                                "type": "heading",
                                "attrs": { "level": level },
                                "content": [{ "type": "text", "text": plain.trim() }],
                            }));
                        }
                    } else if paragraph_parts.is_empty() {
                        nodes.push(json!({ "type": "paragraph" }));
                    } else {
                        nodes.push(json!({
                            "type": "paragraph",
                            "content": paragraph_parts.clone(),
                        }));
                    }
                    in_text = false;
                    bold = false;
                    italic = false;
                    marks.clear();
                }
                "span" if in_text => {
                    flush_odt_run(&mut text, bold, italic, &mut paragraph_parts);
                    bold = false;
                    italic = false;
                }
                _ => {}
            },
            Event::Text(chunk) if in_text => text.push_str(&chunk.xml10_content()),
            Event::GeneralRef(entity) if in_text => text.push_str(&resolve_entity(&entity)),
            Event::Eof => break,
            _ => {}
        }
    }

    Ok(doc_json(nodes))
}

fn flush_odt_run(text: &mut String, bold: bool, italic: bool, parts: &mut Vec<Value>) {
    if text.is_empty() {
        return;
    }
    let mut node = json!({ "type": "text", "text": std::mem::take(text) });
    let mut marks = Vec::new();
    if bold {
        marks.push(json!({ "type": "bold" }));
    }
    if italic {
        marks.push(json!({ "type": "italic" }));
    }
    if !marks.is_empty() {
        node["marks"] = json!(marks);
    }
    parts.push(node);
}

// ---------------------------------------------------------------- ODS

pub fn ods_bytes_to_tiptap(bytes: &[u8]) -> Result<String, String> {
    let mut archive = open_archive(bytes)?;
    let xml = read_entry(&mut archive, "content.xml")?
        .ok_or_else(|| "ODS archive is missing content.xml".to_string())?;
    ods_content_xml_to_tiptap(&xml)
}

fn ods_content_xml_to_tiptap(xml: &str) -> Result<String, String> {
    let mut reader = new_reader(xml);
    let mut nodes: Vec<Value> = Vec::new();
    let mut tables: Vec<(String, Vec<Vec<String>>)> = Vec::new();
    let mut table_name = String::new();
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut cell = String::new();
    let mut in_cell = false;
    let mut in_table = false;
    let mut table_count = 0usize;

    loop {
        match read_event(&mut reader, "ods/content.xml")? {
            Event::Start(tag) => match local_name(tag.name().as_ref()) {
                "table" => {
                    in_table = true;
                    table_count += 1;
                    table_name = attribute(&tag, "name")
                        .filter(|n| !n.is_empty())
                        .unwrap_or_else(|| format!("Sheet{table_count}"));
                    rows.clear();
                }
                "table-row" if in_table => row.clear(),
                "table-cell" | "covered-table-cell" if in_table => {
                    cell.clear();
                    in_cell = true;
                }
                _ => {}
            },
            Event::End(tag) => match local_name(tag.name().as_ref()) {
                "table-cell" | "covered-table-cell" if in_table => {
                    if row.len() < MAX_COLS {
                        row.push(std::mem::take(&mut cell));
                    }
                    in_cell = false;
                }
                "table-row" if in_table => {
                    if rows.len() < MAX_ROWS && row.iter().any(|c| !c.is_empty()) {
                        rows.push(std::mem::take(&mut row));
                    } else {
                        row.clear();
                    }
                }
                "table" if in_table => {
                    tables.push((std::mem::take(&mut table_name), std::mem::take(&mut rows)));
                    in_table = false;
                }
                _ => {}
            },
            Event::Text(chunk) if in_cell => cell.push_str(&chunk.xml10_content()),
            Event::GeneralRef(entity) if in_cell => cell.push_str(&resolve_entity(&entity)),
            Event::Eof => break,
            _ => {}
        }
    }

    let multiple = tables.len() > 1;
    for (name, sheet_rows) in tables {
        let Some(table) = sheet_rows_to_table(&sheet_rows) else {
            continue;
        };
        if multiple {
            nodes.push(json!({
                "type": "heading",
                "attrs": { "level": 2 },
                "content": [{ "type": "text", "text": name }],
            }));
        }
        nodes.push(table);
        nodes.push(json!({ "type": "paragraph" }));
    }

    Ok(doc_json(nodes))
}

// ---------------------------------------------------------------- HTML

pub fn html_bytes_to_tiptap(bytes: &[u8]) -> Result<String, String> {
    let text = decode_utf8(bytes)?;
    html_text_to_tiptap(&text)
}

pub fn html_text_to_tiptap(html: &str) -> Result<String, String> {
    let cleaned = crate::html_paste::normalize_clipboard_html(html).html;
    let body = extract_html_body(&cleaned);
    Ok(doc_json(html_fragment_to_nodes(&body)))
}

fn extract_html_body(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    if let Some(start) = lower.find("<body") {
        let after = &html[start..];
        if let Some(gt) = after.find('>') {
            let rest = &after[gt + 1..];
            let rest_lower = rest.to_ascii_lowercase();
            if let Some(end) = rest_lower.find("</body>") {
                return rest[..end].to_string();
            }
            return rest.to_string();
        }
    }
    html.to_string()
}

fn html_fragment_to_nodes(html: &str) -> Vec<Value> {
    let mut nodes = Vec::new();
    let mut chars = html.chars().peekable();
    let mut buf = String::new();
    let mut tag = String::new();
    let mut in_tag = false;
    let mut bold = 0i32;
    let mut italic = 0i32;
    let mut heading: Option<i64> = None;
    let mut parts: Vec<Value> = Vec::new();

    let flush_text = |buf: &mut String, bold: i32, italic: i32, parts: &mut Vec<Value>| {
        if buf.is_empty() {
            return;
        }
        let decoded = decode_html_entities(buf);
        buf.clear();
        if decoded.is_empty() {
            return;
        }
        let mut node = json!({ "type": "text", "text": decoded });
        let mut marks = Vec::new();
        if bold > 0 {
            marks.push(json!({ "type": "bold" }));
        }
        if italic > 0 {
            marks.push(json!({ "type": "italic" }));
        }
        if !marks.is_empty() {
            node["marks"] = json!(marks);
        }
        parts.push(node);
    };

    let push_block = |heading: &mut Option<i64>, parts: &mut Vec<Value>, nodes: &mut Vec<Value>| {
        if parts.is_empty() && heading.is_none() {
            return;
        }
        if let Some(level) = heading.take() {
            let plain = parts
                .iter()
                .filter_map(|n| n.get("text").and_then(|t| t.as_str()))
                .collect::<String>();
            if plain.trim().is_empty() {
                nodes.push(json!({ "type": "paragraph" }));
            } else {
                nodes.push(json!({
                    "type": "heading",
                    "attrs": { "level": level },
                    "content": [{ "type": "text", "text": plain.trim() }],
                }));
            }
        } else if parts.is_empty() {
            nodes.push(json!({ "type": "paragraph" }));
        } else {
            nodes.push(json!({ "type": "paragraph", "content": parts.clone() }));
        }
        parts.clear();
    };

    while let Some(ch) = chars.next() {
        if in_tag {
            if ch == '>' {
                in_tag = false;
                let raw = std::mem::take(&mut tag);
                let name = raw
                    .trim()
                    .trim_start_matches('/')
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .to_ascii_lowercase();
                let closing = raw.trim_start().starts_with('/');
                match (name.as_str(), closing) {
                    ("br", _) => {
                        flush_text(&mut buf, bold, italic, &mut parts);
                        parts.push(json!({ "type": "hardBreak" }));
                    }
                    ("b" | "strong", false) => {
                        flush_text(&mut buf, bold, italic, &mut parts);
                        bold += 1;
                    }
                    ("b" | "strong", true) => {
                        flush_text(&mut buf, bold, italic, &mut parts);
                        bold = (bold - 1).max(0);
                    }
                    ("i" | "em", false) => {
                        flush_text(&mut buf, bold, italic, &mut parts);
                        italic += 1;
                    }
                    ("i" | "em", true) => {
                        flush_text(&mut buf, bold, italic, &mut parts);
                        italic = (italic - 1).max(0);
                    }
                    ("h1" | "h2" | "h3" | "h4" | "h5" | "h6", false) => {
                        flush_text(&mut buf, bold, italic, &mut parts);
                        push_block(&mut heading, &mut parts, &mut nodes);
                        heading = Some(name.chars().nth(1).and_then(|c| c.to_digit(10)).unwrap_or(1) as i64);
                    }
                    ("h1" | "h2" | "h3" | "h4" | "h5" | "h6", true) => {
                        flush_text(&mut buf, bold, italic, &mut parts);
                        push_block(&mut heading, &mut parts, &mut nodes);
                    }
                    ("p" | "div" | "li" | "tr", false) => {
                        flush_text(&mut buf, bold, italic, &mut parts);
                        push_block(&mut heading, &mut parts, &mut nodes);
                    }
                    ("p" | "div" | "li" | "tr", true) => {
                        flush_text(&mut buf, bold, italic, &mut parts);
                        push_block(&mut heading, &mut parts, &mut nodes);
                    }
                    _ => {}
                }
            } else {
                tag.push(ch);
            }
            continue;
        }
        if ch == '<' {
            flush_text(&mut buf, bold, italic, &mut parts);
            in_tag = true;
            tag.clear();
            continue;
        }
        buf.push(ch);
    }
    flush_text(&mut buf, bold, italic, &mut parts);
    push_block(&mut heading, &mut parts, &mut nodes);
    nodes
}

fn decode_html_entities(text: &str) -> String {
    text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
}

// ---------------------------------------------------------------- RTF

pub fn rtf_bytes_to_tiptap(bytes: &[u8]) -> Result<String, String> {
    let text = decode_utf8_lossy(bytes);
    rtf_text_to_tiptap(&text)
}

pub fn rtf_text_to_tiptap(rtf: &str) -> Result<String, String> {
    if !rtf.trim_start().starts_with("{\\rtf") {
        return Ok(crate::plain_text::plain_text_to_tiptap(rtf, None));
    }
    Ok(doc_json(parse_rtf_nodes(rtf)))
}

fn parse_rtf_nodes(rtf: &str) -> Vec<Value> {
    let mut nodes: Vec<Value> = Vec::new();
    let mut parts: Vec<Value> = Vec::new();
    let mut text = String::new();
    let mut bold = false;
    let mut italic = false;
    let chars: Vec<char> = rtf.chars().collect();
    let mut i = 0usize;

    let flush = |text: &mut String, bold: bool, italic: bool, parts: &mut Vec<Value>| {
        if text.is_empty() {
            return;
        }
        let mut node = json!({ "type": "text", "text": std::mem::take(text) });
        let mut marks = Vec::new();
        if bold {
            marks.push(json!({ "type": "bold" }));
        }
        if italic {
            marks.push(json!({ "type": "italic" }));
        }
        if !marks.is_empty() {
            node["marks"] = json!(marks);
        }
        parts.push(node);
    };
    let push_para = |parts: &mut Vec<Value>, nodes: &mut Vec<Value>| {
        if parts.is_empty() {
            return;
        }
        nodes.push(json!({ "type": "paragraph", "content": parts.clone() }));
        parts.clear();
    };

    while i < chars.len() {
        let ch = chars[i];
        if ch == '\\' {
            i += 1;
            if i >= chars.len() {
                break;
            }
            match chars[i] {
                '\\' | '{' | '}' => {
                    text.push(chars[i]);
                    i += 1;
                }
                '\'' => {
                    if i + 2 < chars.len() {
                        let hex: String = chars[i + 1..i + 3].iter().collect();
                        if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                            // Windows-1252-ish single byte — keep as Latin-1
                            text.push(char::from_u32(byte as u32).unwrap_or('?'));
                        }
                        i += 3;
                    } else {
                        i += 1;
                    }
                }
                c if c.is_ascii_alphabetic() => {
                    let start = i;
                    while i < chars.len() && chars[i].is_ascii_alphabetic() {
                        i += 1;
                    }
                    let word: String = chars[start..i].iter().collect();
                    let mut num: Option<i32> = None;
                    if i < chars.len() && (chars[i] == '-' || chars[i].is_ascii_digit()) {
                        let nstart = i;
                        if chars[i] == '-' {
                            i += 1;
                        }
                        while i < chars.len() && chars[i].is_ascii_digit() {
                            i += 1;
                        }
                        num = chars[nstart..i].iter().collect::<String>().parse().ok();
                    }
                    if i < chars.len() && chars[i] == ' ' {
                        i += 1;
                    }
                    match word.as_str() {
                        "par" | "line" => {
                            flush(&mut text, bold, italic, &mut parts);
                            push_para(&mut parts, &mut nodes);
                        }
                        "b" => {
                            flush(&mut text, bold, italic, &mut parts);
                            bold = num.unwrap_or(1) != 0;
                        }
                        "i" => {
                            flush(&mut text, bold, italic, &mut parts);
                            italic = num.unwrap_or(1) != 0;
                        }
                        "plain" => {
                            flush(&mut text, bold, italic, &mut parts);
                            bold = false;
                            italic = false;
                        }
                        "tab" => text.push('\t'),
                        _ => {}
                    }
                }
                _ => i += 1,
            }
            continue;
        }
        if ch == '{' || ch == '}' || ch == '\r' || ch == '\n' {
            i += 1;
            continue;
        }
        text.push(ch);
        i += 1;
    }
    flush(&mut text, bold, italic, &mut parts);
    push_para(&mut parts, &mut nodes);
    if nodes.is_empty() {
        nodes.push(json!({ "type": "paragraph" }));
    }
    nodes
}

// ---------------------------------------------------------------- EPUB

pub fn epub_bytes_to_tiptap(bytes: &[u8]) -> Result<String, String> {
    let mut archive = open_archive(bytes)?;
    let container = read_entry(&mut archive, "META-INF/container.xml")?
        .ok_or_else(|| "EPUB is missing META-INF/container.xml".to_string())?;
    let opf_path = container_rootfile(&container)
        .ok_or_else(|| "EPUB container.xml has no rootfile".to_string())?;
    let opf = read_entry(&mut archive, &opf_path)?
        .ok_or_else(|| format!("EPUB is missing {opf_path}"))?;
    let base = opf_base(&opf_path);
    let spine = parse_opf_spine(&opf);
    let mut nodes: Vec<Value> = Vec::new();
    for href in spine.into_iter().take(MAX_CHAPTERS) {
        let path = join_path(&base, &href);
        let Some(xhtml) = read_entry(&mut archive, &path)? else {
            continue;
        };
        let chapter_nodes = html_fragment_to_nodes(&extract_html_body(&xhtml));
        nodes.extend(chapter_nodes);
        nodes.push(json!({ "type": "paragraph" }));
    }
    Ok(doc_json(nodes))
}

fn container_rootfile(xml: &str) -> Option<String> {
    let mut reader = new_reader(xml);
    loop {
        match read_event(&mut reader, "container.xml").ok()? {
            Event::Start(tag) | Event::Empty(tag) => {
                if local_name(tag.name().as_ref()) == "rootfile" {
                    return attribute(&tag, "full-path");
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    None
}

fn opf_base(opf_path: &str) -> String {
    match opf_path.rfind('/') {
        Some(i) => opf_path[..i + 1].to_string(),
        None => String::new(),
    }
}

fn join_path(base: &str, href: &str) -> String {
    let href = href.split('#').next().unwrap_or(href).replace('\\', "/");
    if href.starts_with('/') {
        return href.trim_start_matches('/').to_string();
    }
    format!("{base}{href}")
}

fn parse_opf_spine(opf: &str) -> Vec<String> {
    let mut reader = new_reader(opf);
    let mut manifest: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut spine_ids: Vec<String> = Vec::new();
    let mut in_manifest = false;
    let mut in_spine = false;

    loop {
        match read_event(&mut reader, "opf") {
            Ok(Event::Start(tag)) => match local_name(tag.name().as_ref()) {
                "manifest" => in_manifest = true,
                "spine" => in_spine = true,
                "item" if in_manifest => {
                    if let (Some(id), Some(href)) = (attribute(&tag, "id"), attribute(&tag, "href"))
                    {
                        manifest.insert(id, href);
                    }
                }
                "itemref" if in_spine => {
                    if let Some(idref) = attribute(&tag, "idref") {
                        spine_ids.push(idref);
                    }
                }
                _ => {}
            },
            Ok(Event::Empty(tag)) => match local_name(tag.name().as_ref()) {
                "item" if in_manifest => {
                    if let (Some(id), Some(href)) = (attribute(&tag, "id"), attribute(&tag, "href"))
                    {
                        manifest.insert(id, href);
                    }
                }
                "itemref" if in_spine => {
                    if let Some(idref) = attribute(&tag, "idref") {
                        spine_ids.push(idref);
                    }
                }
                _ => {}
            },
            Ok(Event::End(tag)) => match local_name(tag.name().as_ref()) {
                "manifest" => in_manifest = false,
                "spine" => in_spine = false,
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }

    spine_ids
        .into_iter()
        .filter_map(|id| manifest.get(&id).cloned())
        .collect()
}

// ---------------------------------------------------------------- PPTX

pub fn pptx_bytes_to_tiptap(bytes: &[u8]) -> Result<String, String> {
    let mut archive = open_archive(bytes)?;
    let mut nodes: Vec<Value> = Vec::new();
    for index in 1..=MAX_SLIDES {
        let path = format!("ppt/slides/slide{index}.xml");
        let Some(xml) = read_entry(&mut archive, &path)? else {
            if index == 1 {
                return Err("PPTX has no slides".into());
            }
            break;
        };
        let texts = extract_pptx_texts(&xml);
        let title = texts
            .first()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("Slide {index}"));
        nodes.push(json!({
            "type": "heading",
            "attrs": { "level": 2 },
            "content": [{ "type": "text", "text": title }],
        }));
        for line in texts.into_iter().skip(1) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            nodes.push(json!({
                "type": "paragraph",
                "content": [{ "type": "text", "text": trimmed }],
            }));
        }
        nodes.push(json!({ "type": "paragraph" }));
    }
    Ok(doc_json(nodes))
}

fn extract_pptx_texts(xml: &str) -> Vec<String> {
    let mut reader = new_reader(xml);
    let mut texts = Vec::new();
    let mut current = String::new();
    let mut in_t = false;
    loop {
        match read_event(&mut reader, "pptx/slide") {
            Ok(Event::Start(tag)) if local_name(tag.name().as_ref()) == "t" => in_t = true,
            Ok(Event::End(tag)) if local_name(tag.name().as_ref()) == "t" => {
                in_t = false;
                if !current.trim().is_empty() {
                    texts.push(std::mem::take(&mut current));
                } else {
                    current.clear();
                }
            }
            Ok(Event::Text(chunk)) if in_t => current.push_str(&chunk.xml10_content()),
            Ok(Event::GeneralRef(entity)) if in_t => current.push_str(&resolve_entity(&entity)),
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
    texts
}

// ---------------------------------------------------------------- OPML

pub fn opml_bytes_to_tiptap(bytes: &[u8]) -> Result<String, String> {
    let text = decode_utf8(bytes)?;
    opml_text_to_tiptap(&text)
}

pub fn opml_text_to_tiptap(xml: &str) -> Result<String, String> {
    let mut reader = new_reader(xml);
    let mut nodes: Vec<Value> = Vec::new();
    let mut depth: i64 = 0;

    let push_outline = |tag: &BytesStart<'_>, depth: i64, nodes: &mut Vec<Value>| {
        let text = attribute(tag, "text")
            .or_else(|| attribute(tag, "title"))
            .unwrap_or_default();
        if text.trim().is_empty() {
            return;
        }
        let level = (depth + 1).clamp(1, 6);
        if depth == 0 {
            nodes.push(json!({
                "type": "heading",
                "attrs": { "level": level },
                "content": [{ "type": "text", "text": text.trim() }],
            }));
        } else {
            nodes.push(json!({
                "type": "paragraph",
                "content": [{
                    "type": "text",
                    "text": format!("{}{}", "  ".repeat(depth as usize), text.trim())
                }],
            }));
        }
    };

    loop {
        match read_event(&mut reader, "opml")? {
            Event::Start(tag) => {
                if local_name(tag.name().as_ref()) == "outline" {
                    push_outline(&tag, depth, &mut nodes);
                    depth += 1;
                }
            }
            Event::Empty(tag) => {
                if local_name(tag.name().as_ref()) == "outline" {
                    push_outline(&tag, depth, &mut nodes);
                }
            }
            Event::End(tag) => {
                if local_name(tag.name().as_ref()) == "outline" {
                    depth = (depth - 1).max(0);
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }

    Ok(doc_json(nodes))
}

pub fn tiptap_to_opml(content_json: &str, title: &str) -> Result<String, String> {
    let doc: Value = serde_json::from_str(content_json).map_err(|e| e.to_string())?;
    let mut outlines = String::new();
    if let Some(content) = doc.get("content").and_then(|c| c.as_array()) {
        for node in content {
            let typ = node.get("type").and_then(|t| t.as_str()).unwrap_or("");
            let text = collect_text(node);
            if text.trim().is_empty() {
                continue;
            }
            let escaped = escape_xml(&text);
            match typ {
                "heading" => {
                    let level = node
                        .pointer("/attrs/level")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(1);
                    outlines.push_str(&format!(
                        "    <outline text=\"{escaped}\" _level=\"{level}\" />\n"
                    ));
                }
                _ => outlines.push_str(&format!("    <outline text=\"{escaped}\" />\n")),
            }
        }
    }
    Ok(format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>{}</title></head>
  <body>
{outlines}  </body>
</opml>
"#,
        escape_xml(title)
    ))
}

// ---------------------------------------------------------------- JSON

pub fn json_bytes_to_tiptap(bytes: &[u8]) -> Result<String, String> {
    let text = decode_utf8(bytes)?;
    match json_text_to_tiptap(&text) {
        Ok(doc) => Ok(doc),
        // Arbitrary JSON (APIs, configs, arrays) → code block with highlighting.
        Err(_) => Ok(crate::source_code::source_text_to_tiptap(&text, "json")),
    }
}

pub fn json_text_to_tiptap(text: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(text).map_err(|e| format!("Invalid JSON: {e}"))?;

    // Prefer explicit structured export marker.
    if value.get("format").and_then(|v| v.as_str()) == Some("scribe-structured") {
        if let Some(arr) = value.get("blocks").and_then(|v| v.as_array()) {
            return Ok(doc_json(blocks_array_to_nodes(arr)));
        }
        if let Some(content) = value.get("content") {
            if content.get("type").and_then(|t| t.as_str()) == Some("doc") {
                return Ok(
                    serde_json::to_string(content).unwrap_or_else(|_| EMPTY_DOC_JSON.to_string())
                );
            }
        }
    }

    // Already a TipTap doc
    if value.get("type").and_then(|t| t.as_str()) == Some("doc") {
        if value.get("content").and_then(|c| c.as_array()).is_some() {
            return Ok(serde_json::to_string(&value).unwrap_or_else(|_| EMPTY_DOC_JSON.to_string()));
        }
    }

    // { contentJson: "..." } or { content: tipTap }
    if let Some(cj) = value.get("contentJson").and_then(|v| v.as_str()) {
        return json_text_to_tiptap(cj);
    }
    if let Some(content) = value.get("content") {
        if content.get("type").and_then(|t| t.as_str()) == Some("doc") {
            return Ok(serde_json::to_string(content).unwrap_or_else(|_| EMPTY_DOC_JSON.to_string()));
        }
        if let Some(arr) = content.as_array() {
            return Ok(doc_json(blocks_array_to_nodes(arr)));
        }
    }

    // { blocks: [{type, text}] } or { outline: [...] }
    if let Some(arr) = value.get("blocks").and_then(|v| v.as_array()) {
        return Ok(doc_json(blocks_array_to_nodes(arr)));
    }
    if let Some(arr) = value.get("outline").and_then(|v| v.as_array()) {
        return Ok(doc_json(outline_array_to_nodes(arr, 1)));
    }

    // { title, body/text }
    let mut nodes = Vec::new();
    if let Some(title) = value.get("title").and_then(|t| t.as_str()) {
        if !title.trim().is_empty() {
            nodes.push(json!({
                "type": "heading",
                "attrs": { "level": 1 },
                "content": [{ "type": "text", "text": title.trim() }],
            }));
        }
    }
    let body = value
        .get("body")
        .or_else(|| value.get("text"))
        .or_else(|| value.get("markdown"))
        .and_then(|v| v.as_str());
    if let Some(body) = body {
        for para in body.split("\n\n") {
            let t = para.trim();
            if t.is_empty() {
                continue;
            }
            nodes.push(json!({
                "type": "paragraph",
                "content": [{ "type": "text", "text": t }],
            }));
        }
    }

    if nodes.is_empty() {
        return Err("JSON is not a recognized document shape".into());
    }
    Ok(doc_json(nodes))
}

fn blocks_array_to_nodes(arr: &[Value]) -> Vec<Value> {
    let mut nodes = Vec::new();
    for item in arr {
        let typ = item.get("type").and_then(|t| t.as_str()).unwrap_or("paragraph");
        let text = item
            .get("text")
            .or_else(|| item.get("content"))
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .trim();
        if text.is_empty() {
            continue;
        }
        match typ {
            "heading" | "h1" | "h2" | "h3" => {
                let level = item
                    .get("level")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(if typ == "h2" {
                        2
                    } else if typ == "h3" {
                        3
                    } else {
                        1
                    })
                    .clamp(1, 6);
                nodes.push(json!({
                    "type": "heading",
                    "attrs": { "level": level },
                    "content": [{ "type": "text", "text": text }],
                }));
            }
            _ => nodes.push(json!({
                "type": "paragraph",
                "content": [{ "type": "text", "text": text }],
            })),
        }
    }
    nodes
}

fn outline_array_to_nodes(arr: &[Value], level: i64) -> Vec<Value> {
    let mut nodes = Vec::new();
    for item in arr {
        let text = item
            .get("text")
            .or_else(|| item.get("title"))
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .trim();
        if !text.is_empty() {
            nodes.push(json!({
                "type": "heading",
                "attrs": { "level": level.clamp(1, 6) },
                "content": [{ "type": "text", "text": text }],
            }));
        }
        if let Some(children) = item.get("children").and_then(|c| c.as_array()) {
            nodes.extend(outline_array_to_nodes(children, level + 1));
        }
    }
    nodes
}

pub fn tiptap_to_structured_json(content_json: &str, title: &str) -> Result<String, String> {
    let doc: Value = serde_json::from_str(content_json).map_err(|e| e.to_string())?;
    let mut blocks = Vec::new();
    if let Some(content) = doc.get("content").and_then(|c| c.as_array()) {
        for node in content {
            let typ = node.get("type").and_then(|t| t.as_str()).unwrap_or("paragraph");
            let text = collect_text(node);
            if text.trim().is_empty() {
                continue;
            }
            let mut block = json!({ "type": typ, "text": text.trim() });
            if typ == "heading" {
                if let Some(level) = node.pointer("/attrs/level") {
                    block["level"] = level.clone();
                }
            }
            blocks.push(block);
        }
    }
    let out = json!({
        "title": title,
        "format": "scribe-structured",
        "version": 1,
        "blocks": blocks,
        "content": doc,
    });
    serde_json::to_string_pretty(&out).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- shared

fn collect_text(node: &Value) -> String {
    if let Some(t) = node.get("text").and_then(|t| t.as_str()) {
        return t.to_string();
    }
    let mut out = String::new();
    if let Some(children) = node.get("content").and_then(|c| c.as_array()) {
        for child in children {
            let typ = child.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if typ == "hardBreak" {
                out.push('\n');
            } else {
                out.push_str(&collect_text(child));
            }
        }
    }
    out
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn sheet_rows_to_table(rows: &[Vec<String>]) -> Option<Value> {
    if rows.is_empty() {
        return None;
    }
    let width = rows.iter().map(|r| r.len()).max().unwrap_or(0).min(MAX_COLS);
    if width == 0 {
        return None;
    }
    let table_rows: Vec<Value> = rows
        .iter()
        .take(MAX_ROWS)
        .enumerate()
        .map(|(row_index, row)| {
            let cells: Vec<Value> = (0..width)
                .map(|col| {
                    let text = row.get(col).map(String::as_str).unwrap_or("");
                    json!({
                        "type": if row_index == 0 { "tableHeader" } else { "tableCell" },
                        "attrs": { "colspan": 1, "rowspan": 1, "colwidth": null },
                        "content": [if text.is_empty() {
                            json!({ "type": "paragraph" })
                        } else {
                            json!({ "type": "paragraph", "content": [{ "type": "text", "text": text }] })
                        }],
                    })
                })
                .collect();
            json!({ "type": "tableRow", "content": cells })
        })
        .collect();
    Some(json!({ "type": "table", "content": table_rows }))
}

fn doc_json(nodes: Vec<Value>) -> String {
    let content = if nodes.is_empty() {
        vec![json!({ "type": "paragraph" })]
    } else {
        nodes
    };
    serde_json::to_string(&json!({ "type": "doc", "content": content }))
        .unwrap_or_else(|_| EMPTY_DOC_JSON.to_string())
}

fn open_archive(bytes: &[u8]) -> Result<ZipArchive<Cursor<&[u8]>>, String> {
    ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("not a valid ZIP archive: {e}"))
}

fn read_entry<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    name: &str,
) -> Result<Option<String>, String> {
    let mut entry = match archive.by_name(name) {
        Ok(entry) => entry,
        Err(ZipError::FileNotFound) => return Ok(None),
        Err(error) => return Err(format!("cannot read {name}: {error}")),
    };
    let mut buffer = Vec::new();
    entry
        .read_to_end(&mut buffer)
        .map_err(|error| format!("cannot read {name}: {error}"))?;
    Ok(Some(crate::enhance::decode_bytes(&buffer)))
}

fn decode_utf8(bytes: &[u8]) -> Result<String, String> {
    let trimmed = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &bytes[3..]
    } else {
        bytes
    };
    String::from_utf8(trimmed.to_vec()).map_err(|_| "file must be UTF-8".to_string())
}

fn decode_utf8_lossy(bytes: &[u8]) -> String {
    let trimmed = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &bytes[3..]
    } else {
        bytes
    };
    String::from_utf8_lossy(trimmed).into_owned()
}

fn new_reader(xml: &str) -> Reader<&[u8]> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().check_end_names = false;
    reader
}

fn read_event<'a>(reader: &mut Reader<&'a [u8]>, part: &str) -> Result<Event<'a>, String> {
    reader
        .read_event()
        .map_err(|error| format!("invalid XML in {part}: {error}"))
}

fn local_name(name: &str) -> &str {
    match name.rfind(':') {
        Some(index) => &name[index + 1..],
        None => name,
    }
}

fn attribute(tag: &BytesStart<'_>, name: &str) -> Option<String> {
    tag.attributes().flatten().find_map(|attr| {
        if local_name(attr.key.as_ref()) == name {
            attr.normalized_value(XmlVersion::Implicit1_0)
                .ok()
                .map(|value| value.into_owned())
        } else {
            None
        }
    })
}

fn resolve_entity(entity: &BytesRef<'_>) -> String {
    if let Ok(Some(ch)) = entity.resolve_char_ref() {
        return ch.to_string();
    }
    match entity.as_ref() {
        "lt" => "<".into(),
        "gt" => ">".into(),
        "amp" => "&".into(),
        "apos" => "'".into(),
        "quot" => "\"".into(),
        other => format!("&{other};"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn zip_with(entries: &[(&str, &str)]) -> Vec<u8> {
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut cursor);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            for (name, body) in entries {
                zip.start_file(*name, options).unwrap();
                zip.write_all(body.as_bytes()).unwrap();
            }
            zip.finish().unwrap();
        }
        cursor.into_inner()
    }

    #[test]
    fn odt_headings_and_paragraphs() {
        let xml = r#"<?xml version="1.0"?>
        <office:document-content xmlns:text="urn:oasis:names:opencocument:xmlns:text:1.0">
          <text:h text:outline-level="1">Nadpis</text:h>
          <text:p>Ahoj <text:span text:style-name="Strong_20_Emphasis">svet</text:span></text:p>
        </office:document-content>"#;
        let bytes = zip_with(&[("content.xml", xml)]);
        let json = odt_bytes_to_tiptap(&bytes).unwrap();
        assert!(json.contains("heading"));
        assert!(json.contains("Nadpis"));
        assert!(json.contains("bold") || json.contains("svet"));
    }

    #[test]
    fn ods_table() {
        let xml = r#"<?xml version="1.0"?>
        <office:document-content xmlns:table="urn:oasis:names:opencocument:xmlns:table:1.0"
          xmlns:text="urn:oasis:names:opencocument:xmlns:text:1.0">
          <table:table table:name="Data">
            <table:table-row>
              <table:table-cell><text:p>A</text:p></table:table-cell>
              <table:table-cell><text:p>B</text:p></table:table-cell>
            </table:table-row>
            <table:table-row>
              <table:table-cell><text:p>1</text:p></table:table-cell>
              <table:table-cell><text:p>2</text:p></table:table-cell>
            </table:table-row>
          </table:table>
        </office:document-content>"#;
        let json = ods_bytes_to_tiptap(&zip_with(&[("content.xml", xml)])).unwrap();
        assert!(json.contains("table"));
        assert!(json.contains("A"));
    }

    #[test]
    fn html_bold_heading() {
        let json = html_text_to_tiptap("<h1>Title</h1><p>Hello <b>world</b></p>").unwrap();
        let doc: Value = serde_json::from_str(&json).unwrap();
        assert_eq!(doc["content"][0]["type"], "heading");
        assert!(json.contains("bold"));
    }

    #[test]
    fn rtf_bold_italic() {
        let rtf = r"{\rtf1\ansi Hello \b bold\b0  and \i italic\i0  done.\par}";
        let json = rtf_text_to_tiptap(rtf).unwrap();
        assert!(json.contains("bold"));
        assert!(json.contains("italic"));
        assert!(json.contains("done."));
    }

    #[test]
    fn pptx_slides_to_headings() {
        let slide = r#"<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
          <p:cSld><p:spTree>
            <p:sp><p:txBody><a:p><a:r><a:t>Úvod</a:t></a:r></a:p>
              <a:p><a:r><a:t>Bod jedna</a:t></a:r></a:p></p:txBody></p:sp>
          </p:spTree></p:cSld></p:sld>"#;
        let json = pptx_bytes_to_tiptap(&zip_with(&[("ppt/slides/slide1.xml", slide)])).unwrap();
        assert!(json.contains("heading"));
        assert!(json.contains("Úvod"));
        assert!(json.contains("Bod jedna"));
    }

    #[test]
    fn opml_and_json_roundtrip_shapes() {
        let opml = r#"<?xml version="1.0"?><opml version="2.0"><body>
          <outline text="Root"><outline text="Child"/></outline>
        </body></opml>"#;
        let json = opml_text_to_tiptap(opml).unwrap();
        assert!(json.contains("Root"));

        let structured = r#"{"title":"Note","blocks":[{"type":"heading","level":1,"text":"Hi"},{"type":"paragraph","text":"Body"}]}"#;
        let tip = json_text_to_tiptap(structured).unwrap();
        assert!(tip.contains("heading"));
        let exported = tiptap_to_structured_json(&tip, "Note").unwrap();
        assert!(exported.contains("scribe-structured"));
        let opml_out = tiptap_to_opml(&tip, "Note").unwrap();
        assert!(opml_out.contains("<opml"));
    }

    #[test]
    fn arbitrary_json_becomes_code_block() {
        let tip = json_bytes_to_tiptap(br#"{"apiVersion":1,"items":[1,2,3]}"#).unwrap();
        assert!(tip.contains("codeBlock"));
        assert!(tip.contains("apiVersion"));
    }

    #[test]
    fn epub_spine_chapters() {
        let container = r#"<?xml version="1.0"?><container><rootfiles>
          <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
        </rootfiles></container>"#;
        let opf = r#"<?xml version="1.0"?><package>
          <manifest>
            <item id="c1" href="chap1.xhtml" media-type="application/xhtml+xml"/>
          </manifest>
          <spine><itemref idref="c1"/></spine>
        </package>"#;
        let chap = r#"<?xml version="1.0"?><html><body><h1>Kapitola</h1><p>Text</p></body></html>"#;
        let bytes = zip_with(&[
            ("META-INF/container.xml", container),
            ("OEBPS/content.opf", opf),
            ("OEBPS/chap1.xhtml", chap),
        ]);
        let json = epub_bytes_to_tiptap(&bytes).unwrap();
        assert!(json.contains("Kapitola"));
        assert!(json.contains("Text"));
    }
}
