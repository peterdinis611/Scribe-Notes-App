//! Generic XML → TipTap (readable outline, not a raw code dump).
//!
//! `.svg` stays on the source-code path (syntax highlight). This module covers
//! `.xml`, `.xsd`, `.xsl`/`.xslt`, `.rss`, `.atom`, `.plist`.

use quick_xml::events::Event;
use quick_xml::Reader;
use serde_json::{json, Value};

const EMPTY_DOC_JSON: &str = r#"{"type":"doc","content":[{"type":"paragraph"}]}"#;
const MAX_CHARS: usize = 800_000;
const MAX_NODES: usize = 2_000;

pub fn is_xml_document_extension(ext: &str) -> bool {
    matches!(
        ext.trim().trim_start_matches('.').to_ascii_lowercase().as_str(),
        "xml" | "xsd" | "xsl" | "xslt" | "rss" | "atom" | "plist"
    )
}

pub fn xml_bytes_to_tiptap(bytes: &[u8]) -> Result<String, String> {
    let text = decode_text(bytes)?;
    Ok(xml_text_to_tiptap(&text))
}

pub fn xml_text_to_tiptap(text: &str) -> String {
    let source = if text.len() > MAX_CHARS {
        format!("{}\n…", &text[..MAX_CHARS])
    } else {
        text.replace("\r\n", "\n").replace('\r', "\n")
    };

    match walk_xml(&source) {
        Ok(nodes) if !nodes.is_empty() => finish(nodes),
        _ => {
            // Malformed / empty → fall back to a single XML code block.
            let content = if source.trim().is_empty() {
                Vec::<Value>::new()
            } else {
                vec![json!({ "type": "text", "text": source })]
            };
            finish(vec![json!({
                "type": "codeBlock",
                "attrs": { "language": "xml" },
                "content": content,
            })])
        }
    }
}

fn decode_text(bytes: &[u8]) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("XML file is empty".into());
    }
    let trimmed = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &bytes[3..]
    } else {
        bytes
    };
    let probe = &trimmed[..trimmed.len().min(8 * 1024)];
    if probe.contains(&0) {
        return Err("File looks binary — not imported as XML".into());
    }
    Ok(String::from_utf8_lossy(trimmed).into_owned())
}

fn walk_xml(text: &str) -> Result<Vec<Value>, String> {
    let mut reader = Reader::from_str(text);
    reader.config_mut().trim_text(true);

    let mut nodes: Vec<Value> = Vec::new();
    let mut stack: Vec<String> = Vec::new();
    let mut buf = Vec::new();
    let mut emitted = 0usize;

    loop {
        if emitted >= MAX_NODES {
            nodes.push(paragraph("…"));
            break;
        }
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(tag)) => {
                let name = local_name(tag.name().as_ref());
                if name.is_empty() {
                    buf.clear();
                    continue;
                }
                let depth = (stack.len() as u8).saturating_add(1).min(6);
                let mut label = name.clone();
                let mut attrs: Vec<String> = Vec::new();
                for attr in tag.attributes().flatten() {
                    let key = local_name(attr.key.as_ref());
                    let value = attr
                        .unescape_value()
                        .map(|v| v.into_owned())
                        .unwrap_or_default();
                    if !key.is_empty() {
                        attrs.push(format!("{key}={value}"));
                    }
                }
                if !attrs.is_empty() {
                    label = format!("{label} ({})", attrs.join(", "));
                }
                nodes.push(heading(depth, &label));
                emitted += 1;
                stack.push(name);
            }
            Ok(Event::Empty(tag)) => {
                let name = local_name(tag.name().as_ref());
                if name.is_empty() {
                    buf.clear();
                    continue;
                }
                let mut bits = vec![name];
                for attr in tag.attributes().flatten() {
                    let key = local_name(attr.key.as_ref());
                    let value = attr
                        .unescape_value()
                        .map(|v| v.into_owned())
                        .unwrap_or_default();
                    if !key.is_empty() {
                        bits.push(format!("{key}={value}"));
                    }
                }
                nodes.push(paragraph(&bits.join(" · ")));
                emitted += 1;
            }
            Ok(Event::End(_)) => {
                stack.pop();
            }
            Ok(Event::Text(chunk)) => {
                let text = chunk
                    .unescape()
                    .map(|v| v.into_owned())
                    .unwrap_or_default();
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    nodes.push(paragraph(trimmed));
                    emitted += 1;
                }
            }
            Ok(Event::CData(chunk)) => {
                let text = String::from_utf8_lossy(chunk.as_ref());
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    nodes.push(paragraph(trimmed));
                    emitted += 1;
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(err) => return Err(err.to_string()),
        }
        buf.clear();
    }

    if nodes.is_empty() {
        return Err("No XML content".into());
    }
    Ok(nodes)
}

fn local_name(raw: &[u8]) -> String {
    let full = String::from_utf8_lossy(raw);
    full.rsplit(':').next().unwrap_or(&full).trim().to_string()
}

fn heading(level: u8, text: &str) -> Value {
    json!({
        "type": "heading",
        "attrs": { "level": level.clamp(1, 6) },
        "content": [{ "type": "text", "text": text }]
    })
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

fn finish(nodes: Vec<Value>) -> String {
    let content = if nodes.is_empty() {
        vec![json!({ "type": "paragraph" })]
    } else {
        nodes
    };
    serde_json::to_string(&json!({ "type": "doc", "content": content }))
        .unwrap_or_else(|_| EMPTY_DOC_JSON.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xml_extensions() {
        assert!(is_xml_document_extension("xml"));
        assert!(is_xml_document_extension(".xsd"));
        assert!(is_xml_document_extension("rss"));
        assert!(!is_xml_document_extension("svg"));
        assert!(!is_xml_document_extension("html"));
    }

    #[test]
    fn structured_outline() {
        let xml = r#"<?xml version="1.0"?>
<root>
  <person id="1">
    <name>Ada Lovelace</name>
    <role>Mathematician</role>
  </person>
</root>"#;
        let json = xml_text_to_tiptap(xml);
        assert!(json.contains("\"heading\""));
        assert!(json.contains("person"));
        assert!(json.contains("Ada Lovelace"));
        assert!(json.contains("Mathematician"));
        assert!(!json.contains("\"codeBlock\""));
    }

    #[test]
    fn malformed_falls_back_to_code_block() {
        let json = xml_text_to_tiptap("<not closed");
        assert!(json.contains("\"codeBlock\""));
    }
}
