//! Minimal DOCX and XLSX readers that produce TipTap JSON.
//!
//! This is deliberately a subset of the TypeScript importers: text, headings
//! and sheet values only. No images, styling or formula evaluation.

use std::collections::HashMap;
use std::io::{Cursor, Read, Seek};

use quick_xml::events::{BytesRef, BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use serde_json::{json, Value};
use zip::result::ZipError;
use zip::ZipArchive;

const EMPTY_DOC_JSON: &str = r#"{"type":"doc","content":[{"type":"paragraph"}]}"#;
const MAX_SHEETS: usize = 15;
const MAX_ROWS: usize = 400;
const MAX_COLS: usize = 40;

// ---------------------------------------------------------------- DOCX

pub fn docx_bytes_to_tiptap(bytes: &[u8]) -> Result<String, String> {
    let mut archive = open_archive(bytes)?;
    let xml = read_entry(&mut archive, "word/document.xml")?
        .ok_or_else(|| "DOCX archive is missing word/document.xml".to_string())?;
    docx_document_xml_to_tiptap(&xml)
}

/// Convert the raw `word/document.xml` payload of a DOCX file to TipTap JSON.
pub fn docx_document_xml_to_tiptap(xml: &str) -> Result<String, String> {
    Ok(doc_json(docx_nodes(xml)?))
}

fn docx_nodes(xml: &str) -> Result<Vec<Value>, String> {
    let mut reader = new_reader(xml);
    let mut nodes: Vec<Value> = Vec::new();
    let mut in_paragraph = false;
    let mut in_text = false;
    let mut text = String::new();
    let mut style: Option<String> = None;

    loop {
        match read_event(&mut reader, "word/document.xml")? {
            Event::Start(tag) => match local_name(tag.name().as_ref()) {
                "p" => {
                    in_paragraph = true;
                    text.clear();
                    style = None;
                }
                "t" => in_text = true,
                "pStyle" => style = attribute(&tag, "val"),
                "tab" if in_paragraph => text.push('\t'),
                "br" | "cr" if in_paragraph => text.push('\n'),
                _ => {}
            },
            Event::Empty(tag) => match local_name(tag.name().as_ref()) {
                "p" => nodes.push(json!({ "type": "paragraph" })),
                "pStyle" => style = attribute(&tag, "val"),
                "tab" if in_paragraph => text.push('\t'),
                "br" | "cr" if in_paragraph => text.push('\n'),
                _ => {}
            },
            Event::End(tag) => match local_name(tag.name().as_ref()) {
                "p" => {
                    if in_paragraph {
                        nodes.push(docx_block(&text, style.as_deref()));
                    }
                    in_paragraph = false;
                    in_text = false;
                    text.clear();
                    style = None;
                }
                "t" => in_text = false,
                _ => {}
            },
            Event::Text(chunk) if in_paragraph && in_text => {
                text.push_str(&chunk.xml10_content());
            }
            Event::GeneralRef(entity) if in_paragraph && in_text => {
                text.push_str(&resolve_entity(&entity));
            }
            Event::Eof => break,
            _ => {}
        }
    }

    Ok(nodes)
}

fn docx_block(text: &str, style: Option<&str>) -> Value {
    if text.trim().is_empty() {
        return json!({ "type": "paragraph" });
    }

    if let Some(level) = heading_level(style) {
        return json!({
            "type": "heading",
            "attrs": { "level": level },
            "content": [{ "type": "text", "text": text.replace('\n', " ").trim() }],
        });
    }

    json!({ "type": "paragraph", "content": inline_content(text) })
}

/// Word style ids such as `Heading2`, `heading 2` or `Title` map to a level.
fn heading_level(style: Option<&str>) -> Option<i64> {
    let style = style?;
    let normalized: String = style
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect();

    if normalized == "title" {
        return Some(1);
    }
    if normalized == "subtitle" {
        return Some(2);
    }

    let digits = normalized.strip_prefix("heading")?;
    digits.parse::<i64>().ok().map(|level| level.clamp(1, 6))
}

/// Split soft line breaks into TipTap `hardBreak` nodes.
fn inline_content(text: &str) -> Vec<Value> {
    let mut nodes = Vec::new();
    for (index, part) in text.split('\n').enumerate() {
        if index > 0 {
            nodes.push(json!({ "type": "hardBreak" }));
        }
        if !part.is_empty() {
            nodes.push(json!({ "type": "text", "text": part }));
        }
    }
    nodes
}

// ---------------------------------------------------------------- XLSX

pub fn xlsx_bytes_to_tiptap(bytes: &[u8]) -> Result<String, String> {
    let mut archive = open_archive(bytes)?;

    let shared = match read_entry(&mut archive, "xl/sharedStrings.xml")? {
        Some(xml) => parse_shared_strings(&xml)?,
        None => Vec::new(),
    };
    let relationships = match read_entry(&mut archive, "xl/_rels/workbook.xml.rels")? {
        Some(xml) => parse_relationships(&xml)?,
        None => HashMap::new(),
    };
    let mut sheets = match read_entry(&mut archive, "xl/workbook.xml")? {
        Some(xml) => parse_workbook_sheets(&xml)?,
        None => Vec::new(),
    };
    if sheets.is_empty() {
        sheets.push(("Sheet1".to_string(), None));
    }

    let mut nodes: Vec<Value> = Vec::new();
    for (index, (name, rel_id)) in sheets.into_iter().take(MAX_SHEETS).enumerate() {
        let path = rel_id
            .and_then(|id| relationships.get(&id).cloned())
            .map(|target| sheet_entry_path(&target))
            .unwrap_or_else(|| format!("xl/worksheets/sheet{}.xml", index + 1));

        let Some(xml) = read_entry(&mut archive, &path)? else {
            continue;
        };
        let rows = parse_sheet_rows(&xml, &shared)?;
        if rows.is_empty() {
            continue;
        }

        nodes.push(json!({
            "type": "heading",
            "attrs": { "level": 2 },
            "content": [{ "type": "text", "text": if name.is_empty() { "Sheet".to_string() } else { name } }],
        }));
        for row in rows {
            let line = row.join(" | ");
            nodes.push(if line.trim().is_empty() {
                json!({ "type": "paragraph" })
            } else {
                json!({ "type": "paragraph", "content": [{ "type": "text", "text": line }] })
            });
        }
    }

    Ok(doc_json(nodes))
}

fn parse_shared_strings(xml: &str) -> Result<Vec<String>, String> {
    let mut reader = new_reader(xml);
    let mut strings = Vec::new();
    let mut current = String::new();
    let mut in_item = false;
    let mut in_text = false;

    loop {
        match read_event(&mut reader, "xl/sharedStrings.xml")? {
            Event::Start(tag) => match local_name(tag.name().as_ref()) {
                "si" => {
                    in_item = true;
                    current.clear();
                }
                "t" => in_text = true,
                _ => {}
            },
            Event::End(tag) => match local_name(tag.name().as_ref()) {
                "si" => {
                    strings.push(std::mem::take(&mut current));
                    in_item = false;
                }
                "t" => in_text = false,
                _ => {}
            },
            Event::Text(chunk) if in_item && in_text => current.push_str(&chunk.xml10_content()),
            Event::GeneralRef(entity) if in_item && in_text => {
                current.push_str(&resolve_entity(&entity));
            }
            Event::Eof => break,
            _ => {}
        }
    }

    Ok(strings)
}

/// Sheet name plus the relationship id pointing at the worksheet part.
fn parse_workbook_sheets(xml: &str) -> Result<Vec<(String, Option<String>)>, String> {
    let mut reader = new_reader(xml);
    let mut sheets = Vec::new();

    loop {
        let tag = match read_event(&mut reader, "xl/workbook.xml")? {
            Event::Start(tag) | Event::Empty(tag) => tag,
            Event::Eof => break,
            _ => continue,
        };
        if local_name(tag.name().as_ref()) != "sheet" {
            continue;
        }
        sheets.push((
            attribute(&tag, "name").unwrap_or_default(),
            attribute(&tag, "id"),
        ));
    }

    Ok(sheets)
}

fn parse_relationships(xml: &str) -> Result<HashMap<String, String>, String> {
    let mut reader = new_reader(xml);
    let mut map = HashMap::new();

    loop {
        let tag = match read_event(&mut reader, "xl/_rels/workbook.xml.rels")? {
            Event::Start(tag) | Event::Empty(tag) => tag,
            Event::Eof => break,
            _ => continue,
        };
        if local_name(tag.name().as_ref()) != "Relationship" {
            continue;
        }
        if let (Some(id), Some(target)) = (attribute(&tag, "Id"), attribute(&tag, "Target")) {
            map.insert(id, target);
        }
    }

    Ok(map)
}

/// Relationship targets are relative to `xl/` unless they are absolute.
fn sheet_entry_path(target: &str) -> String {
    let target = target.replace('\\', "/");
    if let Some(absolute) = target.strip_prefix('/') {
        return absolute.to_string();
    }
    let relative = target.trim_start_matches("./").trim_start_matches("../");
    if relative.starts_with("xl/") {
        return relative.to_string();
    }
    format!("xl/{relative}")
}

fn parse_sheet_rows(xml: &str, shared: &[String]) -> Result<Vec<Vec<String>>, String> {
    let mut reader = new_reader(xml);
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut in_row = false;
    let mut cell_type = String::new();
    let mut cell_column = 0usize;
    let mut value = String::new();
    let mut capture = false;

    loop {
        match read_event(&mut reader, "worksheet")? {
            Event::Start(tag) => match local_name(tag.name().as_ref()) {
                "row" => {
                    in_row = true;
                    row = Vec::new();
                }
                "c" => {
                    cell_type = attribute(&tag, "t").unwrap_or_default();
                    cell_column = attribute(&tag, "r")
                        .map(|reference| column_index(&reference))
                        .unwrap_or(row.len());
                    value.clear();
                }
                "v" | "t" => capture = true,
                _ => {}
            },
            Event::Text(chunk) if capture => value.push_str(&chunk.xml10_content()),
            Event::GeneralRef(entity) if capture => value.push_str(&resolve_entity(&entity)),
            Event::End(tag) => match local_name(tag.name().as_ref()) {
                "v" | "t" => capture = false,
                "c" if in_row => {
                    set_cell(&mut row, cell_column, cell_value(&cell_type, &value, shared));
                    value.clear();
                }
                "row" if in_row => {
                    while row.last().is_some_and(|cell| cell.is_empty()) {
                        row.pop();
                    }
                    if !row.is_empty() {
                        rows.push(std::mem::take(&mut row));
                    }
                    in_row = false;
                    if rows.len() >= MAX_ROWS {
                        break;
                    }
                }
                _ => {}
            },
            Event::Eof => break,
            _ => {}
        }
    }

    Ok(rows)
}

fn set_cell(row: &mut Vec<String>, column: usize, value: String) {
    if column >= MAX_COLS {
        return;
    }
    while row.len() <= column {
        row.push(String::new());
    }
    row[column] = value;
}

fn cell_value(cell_type: &str, raw: &str, shared: &[String]) -> String {
    match cell_type {
        "s" => raw
            .trim()
            .parse::<usize>()
            .ok()
            .and_then(|index| shared.get(index))
            .cloned()
            .unwrap_or_default(),
        "b" => match raw.trim() {
            "1" => "TRUE".to_string(),
            "0" => "FALSE".to_string(),
            other => other.to_string(),
        },
        _ => raw.to_string(),
    }
}

/// `"BC12"` -> zero based column index 54.
fn column_index(reference: &str) -> usize {
    let mut index = 0usize;
    for ch in reference.chars() {
        let Some(offset) = ch.to_digit(36).filter(|_| ch.is_ascii_alphabetic()) else {
            break;
        };
        index = index * 26 + (offset as usize - 9);
    }
    index.saturating_sub(1)
}

// ---------------------------------------------------------------- shared

fn open_archive(bytes: &[u8]) -> Result<ZipArchive<Cursor<&[u8]>>, String> {
    ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("file is not a valid Office archive: {error}"))
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

/// Strip the namespace prefix, so `w:p` matches `p`.
fn local_name(name: &str) -> &str {
    match name.rfind(':') {
        Some(index) => &name[index + 1..],
        None => name,
    }
}

/// Look up an attribute by local name, ignoring namespace prefixes.
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

/// quick-xml reports entity references separately from text runs.
fn resolve_entity(entity: &BytesRef<'_>) -> String {
    if let Ok(Some(ch)) = entity.resolve_char_ref() {
        return ch.to_string();
    }
    match entity.as_ref() {
        "lt" => "<".to_string(),
        "gt" => ">".to_string(),
        "amp" => "&".to_string(),
        "apos" => "'".to_string(),
        "quot" => "\"".to_string(),
        other => format!("&{other};"),
    }
}

fn doc_json(nodes: Vec<Value>) -> String {
    if nodes.is_empty() {
        return EMPTY_DOC_JSON.to_string();
    }
    serde_json::to_string(&json!({ "type": "doc", "content": nodes }))
        .unwrap_or_else(|_| EMPTY_DOC_JSON.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn zip_with(entries: &[(&str, &str)]) -> Vec<u8> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for (name, body) in entries {
            writer.start_file(*name, options).unwrap();
            std::io::Write::write_all(&mut writer, body.as_bytes()).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    const DOCUMENT_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Prvá kapitola</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Ahoj </w:t></w:r><w:r><w:t>svet &amp; spol.</w:t></w:r></w:p>
    <w:p/>
    <w:p><w:r><w:t>Riadok</w:t><w:br/><w:t>druhý</w:t></w:r></w:p>
  </w:body>
</w:document>"#;

    #[test]
    fn docx_paragraphs_and_headings() {
        let json = docx_bytes_to_tiptap(&zip_with(&[("word/document.xml", DOCUMENT_XML)])).unwrap();
        let doc: Value = serde_json::from_str(&json).unwrap();
        let nodes = doc["content"].as_array().unwrap();

        assert_eq!(nodes.len(), 4);
        assert_eq!(nodes[0]["type"], "heading");
        assert_eq!(nodes[0]["attrs"]["level"], 1);
        assert_eq!(nodes[0]["content"][0]["text"], "Prvá kapitola");

        assert_eq!(nodes[1]["type"], "paragraph");
        assert_eq!(nodes[1]["content"][0]["text"], "Ahoj svet & spol.");

        assert_eq!(nodes[2]["type"], "paragraph");
        assert!(nodes[2].get("content").is_none());

        let breaks = nodes[3]["content"].as_array().unwrap();
        assert_eq!(breaks[0]["text"], "Riadok");
        assert_eq!(breaks[1]["type"], "hardBreak");
        assert_eq!(breaks[2]["text"], "druhý");
    }

    #[test]
    fn docx_without_document_part_fails() {
        let error = docx_bytes_to_tiptap(&zip_with(&[("word/styles.xml", "<x/>")])).unwrap_err();
        assert!(error.contains("word/document.xml"));
    }

    #[test]
    fn non_zip_bytes_fail() {
        assert!(docx_bytes_to_tiptap(b"plain text").is_err());
        assert!(xlsx_bytes_to_tiptap(b"plain text").is_err());
    }

    #[test]
    fn empty_docx_body_yields_empty_doc() {
        let json = docx_bytes_to_tiptap(&zip_with(&[(
            "word/document.xml",
            "<w:document><w:body/></w:document>",
        )]))
        .unwrap();
        assert_eq!(json, EMPTY_DOC_JSON);
    }

    #[test]
    fn xlsx_sheets_become_headings_and_rows() {
        let workbook = r#"<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
            <sheets><sheet name="Rozpočet" sheetId="1" r:id="rId1"/></sheets></workbook>"#;
        let rels = r#"<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>"#;
        let shared = r#"<sst><si><t>Názov</t></si><si><t>Suma</t></si><si><t>Kniečo &amp; iné</t></si></sst>"#;
        let sheet = r#"<worksheet><sheetData>
            <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
            <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c><c r="D2" t="b"><v>1</v></c></row>
        </sheetData></worksheet>"#;

        let json = xlsx_bytes_to_tiptap(&zip_with(&[
            ("xl/workbook.xml", workbook),
            ("xl/_rels/workbook.xml.rels", rels),
            ("xl/sharedStrings.xml", shared),
            ("xl/worksheets/sheet1.xml", sheet),
        ]))
        .unwrap();

        let doc: Value = serde_json::from_str(&json).unwrap();
        let nodes = doc["content"].as_array().unwrap();

        assert_eq!(nodes.len(), 3);
        assert_eq!(nodes[0]["type"], "heading");
        assert_eq!(nodes[0]["attrs"]["level"], 2);
        assert_eq!(nodes[0]["content"][0]["text"], "Rozpočet");
        assert_eq!(nodes[1]["content"][0]["text"], "Názov | Suma");
        // Column C is empty, column D holds a boolean.
        assert_eq!(nodes[2]["content"][0]["text"], "Kniečo & iné | 42 |  | TRUE");
    }

    #[test]
    fn xlsx_falls_back_to_first_sheet_path() {
        let sheet = r#"<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Inline</t></is></c></row></sheetData></worksheet>"#;
        let json = xlsx_bytes_to_tiptap(&zip_with(&[("xl/worksheets/sheet1.xml", sheet)])).unwrap();
        let doc: Value = serde_json::from_str(&json).unwrap();
        let nodes = doc["content"].as_array().unwrap();

        assert_eq!(nodes[0]["content"][0]["text"], "Sheet1");
        assert_eq!(nodes[1]["content"][0]["text"], "Inline");
    }

    #[test]
    fn xlsx_without_rows_yields_empty_doc() {
        let json = xlsx_bytes_to_tiptap(&zip_with(&[(
            "xl/worksheets/sheet1.xml",
            "<worksheet><sheetData/></worksheet>",
        )]))
        .unwrap();
        assert_eq!(json, EMPTY_DOC_JSON);
    }

    #[test]
    fn column_letters_map_to_indexes() {
        assert_eq!(column_index("A1"), 0);
        assert_eq!(column_index("B2"), 1);
        assert_eq!(column_index("Z9"), 25);
        assert_eq!(column_index("AA1"), 26);
        assert_eq!(column_index("BC12"), 54);
    }

    #[test]
    fn heading_styles_map_to_levels() {
        assert_eq!(heading_level(Some("Heading1")), Some(1));
        assert_eq!(heading_level(Some("heading 3")), Some(3));
        assert_eq!(heading_level(Some("Heading9")), Some(6));
        assert_eq!(heading_level(Some("Title")), Some(1));
        assert_eq!(heading_level(Some("BodyText")), None);
        assert_eq!(heading_level(None), None);
    }

    #[test]
    fn relationship_targets_resolve_to_entry_paths() {
        assert_eq!(sheet_entry_path("worksheets/sheet1.xml"), "xl/worksheets/sheet1.xml");
        assert_eq!(sheet_entry_path("/xl/worksheets/sheet2.xml"), "xl/worksheets/sheet2.xml");
        assert_eq!(sheet_entry_path("../xl/worksheets/sheet3.xml"), "xl/worksheets/sheet3.xml");
    }
}
