//! Local-agent tool dispatch (parity with in-app Local Agent).

use crate::server::ScribeMcp;
use crate::tools;

/// Pick up to `limit` sandbox paths for `files_ingest` (mirrors FE agent-files-ingest).
pub(crate) fn select_files_ingest_paths(
    entries: &[serde_json::Value],
    goal: &str,
    limit: usize,
) -> Vec<String> {
    let needle = goal.trim().to_ascii_lowercase();
    let candidates: Vec<(String, String)> = entries
        .iter()
        .filter_map(|entry| {
            let kind = entry.get("kind").and_then(|v| v.as_str()).unwrap_or("");
            if kind == "dir" {
                return None;
            }
            let path = entry.get("path").and_then(|v| v.as_str())?.to_string();
            let name = entry
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let text_like = entry
                .get("textLike")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let looks_code = path.rsplit('.').next().is_some_and(|ext| {
                matches!(
                    ext.to_ascii_lowercase().as_str(),
                    "rs" | "py" | "ts" | "tsx" | "js" | "jsx" | "go" | "java"
                        | "kt" | "swift" | "c" | "h" | "cpp" | "cs" | "rb" | "php"
                        | "lua" | "sql" | "toml" | "yml" | "yaml" | "xml" | "css"
                        | "scss" | "sh" | "bash" | "json" | "md" | "txt" | "csv"
                        | "html" | "htm" | "log"
                )
            });
            if text_like || looks_code {
                Some((path, name))
            } else {
                None
            }
        })
        .collect();
    let matched: Vec<(String, String)> = if needle.is_empty() {
        candidates.clone()
    } else {
        candidates
            .iter()
            .filter(|(path, name)| {
                format!("{path} {name}")
                    .to_ascii_lowercase()
                    .contains(&needle)
            })
            .cloned()
            .collect()
    };
    if matched.is_empty() {
        candidates.into_iter().map(|(path, _)| path).take(limit).collect()
    } else {
        matched.into_iter().map(|(path, _)| path).take(limit).collect()
    }
}

impl ScribeMcp {
    /// Map planner tool ids to store methods (mirrors the in-app Local Agent).
    pub(crate) fn execute_agent_tool(
        &self,
        tool: &str,
        goal: &str,
        document_id: Option<&str>,
        document_id_b: Option<&str>,
        revision_id: Option<&str>,
    ) -> Result<(String, Option<String>), String> {
        let tool = tool.trim().to_ascii_lowercase();
        let grammar_rules = if tool == "grammar" || tool == "grammar_check" {
            self.grammar_rules_from_agent()
        } else {
            Vec::new()
        };
        self.with_store(|store| match tool.as_str() {
            "library_answer" => {
                let result = store.library_answer(&self.sidecar, goal, Some(8))?;
                Ok((
                    format!("{} citations", result.citations.len()),
                    Some(result.answer),
                ))
            }
            "document_answer" => {
                let id = document_id.ok_or_else(|| "documentId required for document_answer".to_string())?;
                let result = store.document_answer(&self.sidecar, id, goal, None)?;
                Ok((
                    format!("{} citations", result.citations.len()),
                    Some(result.answer),
                ))
            }
            "summarize" | "brief" => {
                let id = document_id.ok_or_else(|| "documentId required for summarize".to_string())?;
                let summary = store.summarize_document(&self.sidecar, id, Some(5))?;
                Ok(("summarize".into(), Some(summary.summary)))
            }
            "outline" => {
                let id = document_id.ok_or_else(|| "documentId required for outline".to_string())?;
                let outline = store.get_document_outline(id)?;
                Ok(("outline".into(), Some(tools::json(&outline))))
            }
            "tasks" => {
                let id = document_id.ok_or_else(|| "documentId required for tasks".to_string())?;
                let tasks = store.extract_document_tasks(&self.sidecar, id)?;
                Ok(("tasks".into(), Some(tools::json(&tasks))))
            }
            "takeaways" => {
                let id = document_id.ok_or_else(|| "documentId required for takeaways".to_string())?;
                let result = store.extract_takeaways(&self.sidecar, Some(id), None, Some(10))?;
                Ok(("takeaways".into(), Some(tools::json(&result))))
            }
            "organize" => {
                let id = document_id.ok_or_else(|| "documentId required for organize".to_string())?;
                let suggestions = store.suggest_tags(&self.sidecar, id)?;
                Ok(("organize".into(), Some(tools::json(&suggestions))))
            }
            "wiki" => {
                let id = document_id.ok_or_else(|| "documentId required for wiki".to_string())?;
                let links = store.suggest_wiki_links(&self.sidecar, id, Some(8))?;
                Ok(("wiki".into(), Some(tools::json(&links))))
            }
            "dates" => {
                let events = store.calendar_events(&self.sidecar, Some(16), None, None)?;
                Ok(("dates".into(), Some(tools::json(&events))))
            }
            "duplicates" => {
                let result = store.find_duplicate_documents(&self.sidecar, Some(12))?;
                Ok(("duplicates".into(), Some(tools::json(&result))))
            }
            "meeting" => {
                let id = document_id.ok_or_else(|| "documentId required for meeting".to_string())?;
                let pack = store.meeting_notes_pack(&self.sidecar, Some(id), None, Some(12))?;
                Ok(("meeting".into(), Some(tools::json(&pack))))
            }
            "citations" => {
                let pack = store.citation_pack(&self.sidecar, goal, Some(8))?;
                Ok(("citations".into(), Some(tools::json(&pack))))
            }
            "analysis" | "document_analysis" => {
                let id = document_id.ok_or_else(|| "documentId required for analysis".to_string())?;
                let analysis = store.document_analysis(&self.sidecar, id)?;
                Ok(("analysis".into(), Some(tools::json(&analysis))))
            }
            "flashcards" => {
                let id = document_id.ok_or_else(|| "documentId required for flashcards".to_string())?;
                let cards = store.extract_flashcards(&self.sidecar, Some(id), None, Some(12), Some(true))?;
                Ok(("flashcards".into(), Some(tools::json(&cards))))
            }
            "style" | "writing_coach" => {
                let id = document_id.ok_or_else(|| "documentId required for writing_coach".to_string())?;
                let coach = store.writing_coach(&self.sidecar, Some(id), None, None)?;
                Ok(("style".into(), Some(tools::json(&coach))))
            }
            "spellcheck" => {
                let id = document_id.ok_or_else(|| "documentId required for spellcheck".to_string())?;
                let result = store.spellcheck_document(&self.sidecar, id)?;
                Ok(("spellcheck".into(), Some(tools::json(&result))))
            }
            "grammar" | "grammar_check" => {
                let id = document_id.ok_or_else(|| "documentId required for grammar_check".to_string())?;
                let result = store.grammar_check(
                    &self.sidecar,
                    Some(id),
                    None,
                    &grammar_rules,
                    Some(24),
                )?;
                Ok(("grammar_check".into(), Some(tools::json(&result))))
            }
            "similar" => {
                let id = document_id.ok_or_else(|| "documentId required for similar".to_string())?;
                let hits = store.similar_documents_for(id, 8)?;
                Ok(("similar".into(), Some(tools::json(&hits))))
            }
            "rewrite" | "polish" => {
                let id = document_id.ok_or_else(|| "documentId required for rewrite".to_string())?;
                let doc = store
                    .get_document(id, false)?
                    .ok_or_else(|| format!("document not found: {id}"))?;
                let result = store.rewrite_selection(
                    &self.sidecar,
                    &doc.plain_text,
                    Some("polish"),
                    None,
                )?;
                Ok(("rewrite".into(), Some(tools::json(&result))))
            }
            "explain" => {
                let id = document_id.ok_or_else(|| "documentId required for explain".to_string())?;
                let result = store.explain_selection(&self.sidecar, Some(id), None)?;
                Ok(("explain".into(), Some(tools::json(&result))))
            }
            "code_brief" => {
                let id =
                    document_id.ok_or_else(|| "documentId required for code_brief".to_string())?;
                let result = store.code_brief(&self.sidecar, Some(id), None, None, None)?;
                Ok(("code_brief".into(), Some(tools::json(&result))))
            }
            "simplify" => {
                let id = document_id.ok_or_else(|| "documentId required for simplify".to_string())?;
                let result = store.simplify_text(&self.sidecar, Some(id), None)?;
                Ok(("simplify".into(), Some(tools::json(&result))))
            }
            "action_items" => {
                let id =
                    document_id.ok_or_else(|| "documentId required for action_items".to_string())?;
                let result = store.action_items(&self.sidecar, Some(id), None, Some(12))?;
                Ok(("action_items".into(), Some(tools::json(&result))))
            }
            "glossary" => {
                let id = document_id.ok_or_else(|| "documentId required for glossary".to_string())?;
                let result = store.glossary(&self.sidecar, Some(id), None, Some(16))?;
                Ok(("glossary".into(), Some(tools::json(&result))))
            }
            "terminology" => {
                let id =
                    document_id.ok_or_else(|| "documentId required for terminology".to_string())?;
                let result = store.check_terminology(&self.sidecar, Some(id), None, Some(12))?;
                Ok(("terminology".into(), Some(tools::json(&result))))
            }
            "quiz" => {
                let id = document_id.ok_or_else(|| "documentId required for quiz".to_string())?;
                let result = store.outline_quiz(&self.sidecar, Some(id), None, Some(12))?;
                Ok(("quiz".into(), Some(tools::json(&result))))
            }
            "files_answer" => {
                let result = store.files_answer(&self.sidecar, goal, None, Some(6), None)?;
                Ok(("files_answer".into(), Some(tools::json(&result))))
            }
            "section_summaries" => {
                let id = document_id
                    .ok_or_else(|| "documentId required for section_summaries".to_string())?;
                let result = store.section_summaries(&self.sidecar, Some(id), None, Some(12))?;
                Ok(("section_summaries".into(), Some(tools::json(&result))))
            }
            "decisions" => {
                let id = document_id.ok_or_else(|| "documentId required for decisions".to_string())?;
                let result = store.extract_decisions(&self.sidecar, Some(id), None, Some(12))?;
                Ok(("decisions".into(), Some(tools::json(&result))))
            }
            "pii" => {
                let id = document_id.ok_or_else(|| "documentId required for pii".to_string())?;
                let result = store.detect_pii(&self.sidecar, Some(id), None, Some(40))?;
                Ok(("pii".into(), Some(tools::json(&result))))
            }
            "quotes" => {
                let id = document_id.ok_or_else(|| "documentId required for quotes".to_string())?;
                let result = store.extract_quotes(&self.sidecar, Some(id), None, Some(10))?;
                Ok(("quotes".into(), Some(tools::json(&result))))
            }
            "commitments" => {
                let id =
                    document_id.ok_or_else(|| "documentId required for commitments".to_string())?;
                let result = store.extract_commitments(&self.sidecar, Some(id), None, Some(12))?;
                Ok(("commitments".into(), Some(tools::json(&result))))
            }
            "rank_tasks" => {
                let id = document_id.ok_or_else(|| "documentId required for rank_tasks".to_string())?;
                let result = store.rank_tasks(&self.sidecar, Some(id), None, Some(20))?;
                Ok(("rank_tasks".into(), Some(tools::json(&result))))
            }
            "open_loops" => {
                let id = document_id.ok_or_else(|| "documentId required for open_loops".to_string())?;
                let result = store.open_loops(&self.sidecar, Some(id), None, Some(16))?;
                Ok(("open_loops".into(), Some(tools::json(&result))))
            }
            "reading_plan" => {
                let id =
                    document_id.ok_or_else(|| "documentId required for reading_plan".to_string())?;
                let result = store.reading_plan(&self.sidecar, Some(id), None, Some(8))?;
                Ok(("reading_plan".into(), Some(tools::json(&result))))
            }
            "tone" => {
                let id = document_id.ok_or_else(|| "documentId required for tone".to_string())?;
                let result = store.tone_pack(&self.sidecar, Some(id), None)?;
                Ok(("tone".into(), Some(tools::json(&result))))
            }
            "title" => {
                let id = document_id.ok_or_else(|| "documentId required for title".to_string())?;
                let result = store.suggest_document_title(&self.sidecar, id)?;
                Ok(("title".into(), Some(tools::json(&result))))
            }
            "template_hints" => {
                let id = document_id
                    .ok_or_else(|| "documentId required for template_hints".to_string())?;
                let result = store.template_fill_hints(&self.sidecar, id, None)?;
                Ok(("template_hints".into(), Some(tools::json(&result))))
            }
            "library_report" => {
                let result = store.library_report(&self.sidecar)?;
                Ok(("library_report".into(), Some(tools::json(&result))))
            }
            "terminology_library" => {
                let result = store.check_terminology_library(&self.sidecar, Some(16), Some(40))?;
                Ok(("terminology_library".into(), Some(tools::json(&result))))
            }
            "forward_plan" => {
                let id =
                    document_id.ok_or_else(|| "documentId required for forward_plan".to_string())?;
                let result = store.forward_plan(&self.sidecar, Some(id), None, Some(12))?;
                Ok(("forward_plan".into(), Some(tools::json(&result))))
            }
            "compare_notes" => {
                let id_a =
                    document_id.ok_or_else(|| "documentId required for compare_notes".to_string())?;
                let id_b = document_id_b.ok_or_else(|| {
                    "documentIdB required for compare_notes — pass RunAgentParams.documentIdB"
                        .to_string()
                })?;
                let result = store.compare_notes(
                    &self.sidecar,
                    Some(id_a),
                    Some(id_b),
                    None,
                    None,
                    None,
                    None,
                )?;
                Ok(("compare_notes".into(), Some(tools::json(&result))))
            }
            "contradictions" | "contradiction_hints" => {
                let id_a = document_id
                    .ok_or_else(|| "documentId required for contradictions".to_string())?;
                let id_b = document_id_b.ok_or_else(|| {
                    "documentIdB required for contradictions — pass RunAgentParams.documentIdB"
                        .to_string()
                })?;
                let result = store.contradiction_hints(
                    &self.sidecar,
                    Some(id_a),
                    Some(id_b),
                    None,
                    None,
                    None,
                    None,
                    Some(8),
                )?;
                Ok(("contradictions".into(), Some(tools::json(&result))))
            }
            "revision" => {
                let id =
                    document_id.ok_or_else(|| "documentId required for revision".to_string())?;
                let rev = revision_id.ok_or_else(|| {
                    "revisionId required for revision — pass RunAgentParams.revisionId".to_string()
                })?;
                let result = store.analyze_revision_diff_for_document(
                    &self.sidecar,
                    id,
                    rev,
                    Some(12),
                    None,
                    None,
                )?;
                Ok(("revision".into(), Some(tools::json(&result))))
            }
            "keywords" => {
                let id = document_id.ok_or_else(|| "documentId required for keywords".to_string())?;
                let result = store.extract_document_keywords(&self.sidecar, id, Some(16))?;
                Ok(("keywords".into(), Some(tools::json(&result))))
            }
            "note_pulse" => {
                let id = document_id.ok_or_else(|| "documentId required for note_pulse".to_string())?;
                let result = store.note_pulse(&self.sidecar, Some(id), None)?;
                Ok(("note_pulse".into(), Some(tools::json(&result))))
            }
            "continuation" => {
                let id =
                    document_id.ok_or_else(|| "documentId required for continuation".to_string())?;
                let doc = store
                    .get_document(id, false)?
                    .ok_or_else(|| format!("document not found: {id}"))?;
                let prefix = doc.plain_text.chars().rev().take(240).collect::<String>();
                let prefix: String = prefix.chars().rev().collect();
                let prefix = prefix.trim();
                if prefix.is_empty() {
                    return Err("document has no text for continuation".into());
                }
                let result = store.suggest_continuation(
                    &self.sidecar,
                    prefix,
                    Some(4),
                    Some(24),
                    Some(id),
                    None,
                )?;
                Ok(("continuation".into(), Some(tools::json(&result))))
            }
            "mentions" => {
                let id = document_id.ok_or_else(|| "documentId required for mentions".to_string())?;
                let result = store.extract_mentions_text(&self.sidecar, Some(id), None)?;
                Ok(("mentions".into(), Some(tools::json(&result))))
            }
            "wiki_health" => {
                let health = store.wiki_health(40, 40, 24)?;
                let hubs = store.list_graph_hubs(10)?;
                Ok((
                    "wiki_health".into(),
                    Some(tools::json(&serde_json::json!({
                        "health": health,
                        "hubs": hubs,
                    }))),
                ))
            }
            "save_template" => {
                let id =
                    document_id.ok_or_else(|| "documentId required for save_template".to_string())?;
                if !self.writable {
                    return Err("save_template requires SCRIBE_MCP_WRITE=1".into());
                }
                let created = store.create_custom_template_from_document(id)?;
                Ok(("save_template".into(), Some(tools::json(&created))))
            }
            "handoff" => {
                let agent = self
                    .open_agent_store()
                    .ok_or_else(|| "agent store unavailable".to_string())?;
                let folded = goal.to_ascii_lowercase();
                let to = [
                    "organizer",
                    "meeting",
                    "librarian",
                    "proofreader",
                    "study",
                    "general",
                ]
                .into_iter()
                .find(|role| folded.contains(&format!("@{role}")) || folded.contains(*role))
                .unwrap_or("organizer");
                let summary = goal.trim();
                if summary.len() < 2 {
                    return Err("handoff summary too short".into());
                }
                let sent = agent.send_handoff("general", to, summary, document_id, None)?;
                Ok(("handoff".into(), Some(tools::json(&sent))))
            }
            "files_ingest" => {
                if !self.writable {
                    return Err("files_ingest requires SCRIBE_MCP_WRITE=1".into());
                }
                let listed = store.files_list(&self.sidecar, "", true, None)?;
                let entries = listed
                    .get("entries")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let paths = select_files_ingest_paths(&entries, goal, 5);
                if paths.is_empty() {
                    return Ok((
                        "files_ingest".into(),
                        Some(
                            "No text/code files found in the sandbox to import. Put files under `files/` and start the Local Files API."
                                .into(),
                        ),
                    ));
                }
                let mut lines = Vec::new();
                let mut created = Vec::new();
                for path in &paths {
                    match store.files_read_text(&self.sidecar, path, None) {
                        Ok(read) => {
                            let text = read
                                .get("text")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .trim();
                            if text.is_empty() {
                                lines.push(format!("- Skipped `{path}` (empty)"));
                                continue;
                            }
                            let title = path
                                .rsplit(['/', '\\'])
                                .next()
                                .unwrap_or(path)
                                .trim()
                                .to_string();
                            let body = format!("<!-- imported from files/{path} -->\n\n{text}");
                            match store.create_note(&title, Some(&body), None) {
                                Ok(note) => {
                                    lines.push(format!("- [[{}]] ← `{path}`", note.title));
                                    created.push(serde_json::json!({
                                        "id": note.id,
                                        "title": note.title,
                                        "path": path,
                                    }));
                                }
                                Err(error) => {
                                    lines.push(format!("- Failed `{path}`: {error}"));
                                }
                            }
                        }
                        Err(error) => {
                            lines.push(format!("- Failed `{path}`: {error}"));
                        }
                    }
                }
                Ok((
                    "files_ingest".into(),
                    Some(tools::json(&serde_json::json!({
                        "imported": created.len(),
                        "created": created,
                        "answer": format!(
                            "**Imported {} file(s) into the library**\n\n{}",
                            created.len(),
                            lines.join("\n")
                        ),
                    }))),
                ))
            }
            "canvas_summarize" => {
                let id = document_id
                    .ok_or_else(|| "documentId required for canvas_summarize".to_string())?;
                let doc = store
                    .get_document(id, true)?
                    .ok_or_else(|| format!("document not found: {id}"))?;
                let content = doc
                    .content_json
                    .as_deref()
                    .ok_or_else(|| "document has no content".to_string())?;
                let canvas = scribe_ui::parse_canvas_document(content)
                    .ok_or_else(|| "document is not a canvas".to_string())?;
                let mut notes = Vec::new();
                let mut frames = Vec::new();
                let mut links = Vec::new();
                for obj in &canvas.objects {
                    match &obj.kind {
                        scribe_ui::CanvasObjectKind::Note if !obj.text.trim().is_empty() => {
                            notes.push(obj.text.trim().chars().take(160).collect::<String>());
                        }
                        scribe_ui::CanvasObjectKind::Frame if !obj.label.trim().is_empty() => {
                            frames.push(obj.label.trim().to_string());
                        }
                        scribe_ui::CanvasObjectKind::DocLink => {
                            let label = if !obj.document_title.trim().is_empty() {
                                obj.document_title.trim()
                            } else if !obj.document_id.trim().is_empty() {
                                obj.document_id.trim()
                            } else {
                                "link"
                            };
                            links.push(label.to_string());
                        }
                        _ => {}
                    }
                }
                Ok((
                    "canvas_summarize".into(),
                    Some(tools::json(&serde_json::json!({
                        "title": doc.title,
                        "objectCount": canvas.objects.len(),
                        "notes": notes,
                        "frames": frames,
                        "docLinks": links,
                    }))),
                ))
            }
            "canvas_to_note" => {
                let id =
                    document_id.ok_or_else(|| "documentId required for canvas_to_note".to_string())?;
                if !self.writable {
                    return Err("canvas_to_note requires SCRIBE_MCP_WRITE=1".into());
                }
                let doc = store
                    .get_document(id, true)?
                    .ok_or_else(|| format!("document not found: {id}"))?;
                let content = doc
                    .content_json
                    .as_deref()
                    .ok_or_else(|| "document has no content".to_string())?;
                let canvas = scribe_ui::parse_canvas_document(content)
                    .ok_or_else(|| "document is not a canvas".to_string())?;
                let mut lines: Vec<String> = Vec::new();
                for obj in &canvas.objects {
                    let text = obj.text.trim();
                    let label = obj.label.trim();
                    if !label.is_empty() {
                        lines.push(format!("## {label}"));
                    }
                    if !text.is_empty() {
                        lines.push(text.to_string());
                    }
                }
                let body = if lines.is_empty() {
                    "(empty canvas)".to_string()
                } else {
                    lines.join("\n\n")
                };
                let title = format!("{} — from canvas", doc.title);
                let created = store.create_note(&title, Some(&body), None)?;
                Ok(("canvas_to_note".into(), Some(tools::json(&created))))
            }
            "canvas_template" => {
                let id = document_id
                    .ok_or_else(|| "documentId required for canvas_template".to_string())?;
                if !self.writable {
                    return Err("canvas_template requires SCRIBE_MCP_WRITE=1".into());
                }
                let doc = store
                    .get_document(id, true)?
                    .ok_or_else(|| format!("document not found: {id}"))?;
                let content = doc
                    .content_json
                    .as_deref()
                    .ok_or_else(|| "document has no content".to_string())?;
                if scribe_ui::parse_canvas_document(content).is_none() {
                    return Err("document is not a canvas".into());
                }
                let template_id = scribe_ui::pick_canvas_template_id(goal);
                let next = scribe_ui::build_canvas_template(template_id);
                let content_json = scribe_ui::serialize_canvas_document(&next);
                let updated = store.replace_document_content_json(id, &content_json)?;
                Ok((
                    "canvas_template".into(),
                    Some(tools::json(&serde_json::json!({
                        "id": updated.id,
                        "title": updated.title,
                        "templateId": template_id,
                        "objectCount": next.objects.len(),
                        "answer": format!(
                            "Applied canvas template **{template_id}** ({} objects).",
                            next.objects.len()
                        ),
                    }))),
                ))
            }
            other => Err(format!("unsupported agent tool: {other}")),
        })
    }

    pub(crate) fn run_agent_with_persona(
        &self,
        goal: &str,
        scope: &str,
        document_id: Option<String>,
        document_id_b: Option<String>,
        revision_id: Option<String>,
        max_tools: Option<i64>,
        persona: &str,
        recipe_id: Option<&str>,
        force_tools: Option<&[String]>,
    ) -> Result<String, String> {
        let spellcheck = persona == "spellcheck";
        if spellcheck && document_id.as_deref().map(str::trim).filter(|v| !v.is_empty()).is_none()
        {
            return Err("documentId is required for the spellcheck persona".into());
        }

        let (prefs_enabled, prefs_max, disabled_tools) = self
            .open_agent_store()
            .and_then(|store| store.get_prefs().ok())
            .map(|prefs| {
                (
                    prefs.enabled,
                    prefs.max_steps as i64,
                    prefs.disabled_tools,
                )
            })
            .unwrap_or((true, 3, Vec::new()));

        if !prefs_enabled {
            return Err("Local agent is disabled in Scribe settings".into());
        }

        let scope = if spellcheck {
            "document"
        } else if recipe_id
            .and_then(scribe_ui::get_agent_recipe)
            .map(|recipe| recipe.document_preferred)
            .unwrap_or(false)
            && document_id
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .is_some()
        {
            "document"
        } else {
            scope
        };
        let max_tools = if spellcheck {
            1
        } else {
            max_tools.unwrap_or(prefs_max).clamp(1, 6)
        };

        let role_id = if spellcheck {
            "proofreader"
        } else if persona == "general" || persona.is_empty() {
            "general"
        } else {
            persona
        };

        let (handoff_summaries, feedback_tools, inbox_block) =
            if let Some(agent_store) = self.open_agent_store() {
                let inbox = agent_store
                    .list_handoff_inbox(role_id, Some("pending"), 8)
                    .unwrap_or_default();
                let summaries: Vec<String> = inbox
                    .iter()
                    .filter(|item| item.status == "pending")
                    .take(6)
                    .map(|item| format!("From {}: {}", item.from_agent_id, item.summary))
                    .collect();
                let preamble = scribe_agent::inbox_preamble(&inbox);
                let feedback = agent_store
                    .recent_successful_tool_sets(24)
                    .unwrap_or_default();
                (summaries, feedback, preamble)
            } else {
                (Vec::new(), Vec::new(), None)
            };

        let filter_disabled = |tools: Vec<String>| -> Vec<String> {
            tools
                .into_iter()
                .filter(|tool| {
                    !disabled_tools
                        .iter()
                        .any(|disabled| disabled.eq_ignore_ascii_case(tool))
                })
                .collect()
        };
        let apply_role = |tools: Vec<String>| -> Vec<String> {
            if role_id == "general" {
                tools
            } else {
                scribe_ui::filter_tools_by_agents(&tools, &[role_id.to_string()])
            }
        };

        let tools_list: Vec<String> = if spellcheck {
            vec!["spellcheck".into()]
        } else if let Some(forced) = force_tools.filter(|tools| !tools.is_empty()) {
            apply_role(filter_disabled(forced.to_vec()))
                .into_iter()
                .take(max_tools as usize)
                .collect()
        } else if let Some(recipe) = recipe_id.and_then(scribe_ui::get_agent_recipe) {
            if !scribe_ui::is_recipe_allowed_by_agents(&recipe.id, &[role_id.to_string()])
                && role_id != "general"
            {
                return Err(format!(
                    "recipe `{rid}` is not allowed for persona `{role_id}`",
                    rid = recipe.id
                ));
            }
            apply_role(filter_disabled(recipe.tools))
                .into_iter()
                .take(max_tools as usize)
                .collect()
        } else {
            let handoffs = if handoff_summaries.is_empty() {
                None
            } else {
                Some(handoff_summaries.as_slice())
            };
            let feedback = if feedback_tools.is_empty() {
                None
            } else {
                Some(feedback_tools.as_slice())
            };
            let plan = self.with_store(|store| {
                store.plan_agent_goal_ctx(
                    &self.sidecar,
                    goal,
                    scope,
                    Some(max_tools),
                    Some(role_id),
                    handoffs,
                    feedback,
                    None,
                )
            })?;

            let planned = plan
                .get("tools")
                .and_then(|value| value.as_array())
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|value| value.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>();

            let planned = apply_role(filter_disabled(planned))
                .into_iter()
                .take(max_tools as usize)
                .collect::<Vec<_>>();

            if plan
                .get("needsClarification")
                .and_then(|value| value.as_bool())
                .unwrap_or(false)
                && planned.is_empty()
            {
                return Ok(tools::json(&serde_json::json!({
                    "goal": goal,
                    "scope": scope,
                    "documentId": document_id,
                    "documentIdB": document_id_b,
                    "revisionId": revision_id,
                    "persona": persona,
                    "recipeId": recipe_id,
                    "needsClarification": true,
                    "clarifyOptions": plan.get("clarifyOptions").cloned().unwrap_or(serde_json::json!([])),
                    "steps": [],
                    "answer": "Goal is ambiguous — pick a tool from clarifyOptions, or call run_agent again with a more specific goal.",
                })));
            }

            planned
        };

        let mut steps = Vec::new();
        let mut answers = Vec::new();

        if let Some(preamble) = self.agent_teachings_preamble(spellcheck) {
            answers.push(preamble);
        }
        if let Some(inbox) = inbox_block {
            answers.push(inbox);
        }

        for tool_name in &tools_list {
            match self.execute_agent_tool(
                tool_name,
                goal,
                document_id.as_deref(),
                document_id_b.as_deref(),
                revision_id.as_deref(),
            ) {
                Ok((detail, answer)) => {
                    if let Some(text) = answer.as_ref().filter(|s| !s.trim().is_empty()) {
                        answers.push(text.clone());
                    }
                    steps.push(serde_json::json!({
                        "tool": tool_name,
                        "status": "ok",
                        "detail": detail,
                    }));
                }
                Err(error) => {
                    steps.push(serde_json::json!({
                        "tool": tool_name,
                        "status": "error",
                        "detail": error,
                    }));
                }
            }
        }

        let answer = if answers.is_empty() {
            "No tool produced an answer.".to_string()
        } else {
            answers.join("\n\n")
        };

        if let Some(store) = self.open_agent_store() {
            let agent_id = if spellcheck { "proofreader" } else { role_id };
            let _ = store.append_run(
                scope,
                document_id.as_deref(),
                goal,
                Some(&serde_json::to_string(&steps).unwrap_or_else(|_| "[]".into())),
                Some(&answer),
                Some(agent_id),
            );
        }

        let goal_preview: String = goal.chars().take(120).collect();
        self.audit_mcp(
            "agent",
            "run_agent",
            &format!("MCP run_agent ({persona}): {goal_preview}"),
            Some(serde_json::json!({
                "persona": persona,
                "scope": scope,
                "documentId": document_id,
                "documentIdB": document_id_b,
                "revisionId": revision_id,
                "toolCount": tools_list.len(),
            })),
            "ok",
        );

        Ok(tools::json(&serde_json::json!({
            "goal": goal,
            "scope": scope,
            "documentId": document_id,
            "documentIdB": document_id_b,
            "revisionId": revision_id,
            "persona": persona,
            "steps": steps,
            "answer": answer,
        })))
    }
}

#[cfg(test)]
mod tests {
    use super::select_files_ingest_paths;
    use serde_json::json;

    #[test]
    fn files_ingest_skips_dirs_and_binaries() {
        let entries = vec![
            json!({"kind": "dir", "path": "src", "name": "src", "textLike": false}),
            json!({"kind": "file", "path": "src/main.rs", "name": "main.rs", "textLike": true}),
            json!({"kind": "file", "path": "logo.png", "name": "logo.png", "textLike": false}),
            json!({"kind": "file", "path": "notes.md", "name": "notes.md", "textLike": true}),
        ];
        let paths = select_files_ingest_paths(&entries, "", 5);
        assert_eq!(paths, vec!["src/main.rs", "notes.md"]);
    }

    #[test]
    fn files_ingest_filters_by_goal_needle() {
        let entries = vec![
            json!({"kind": "file", "path": "inbox/a.md", "name": "a.md", "textLike": true}),
            json!({"kind": "file", "path": "inbox/b.py", "name": "b.py", "textLike": true}),
            json!({"kind": "file", "path": "other/c.md", "name": "c.md", "textLike": true}),
        ];
        let paths = select_files_ingest_paths(&entries, "inbox", 5);
        assert_eq!(paths, vec!["inbox/a.md", "inbox/b.py"]);
    }

    #[test]
    fn files_ingest_falls_back_when_needle_misses() {
        let entries = vec![
            json!({"kind": "file", "path": "readme.md", "name": "readme.md", "textLike": true}),
        ];
        let paths = select_files_ingest_paths(&entries, "zzzz-missing", 5);
        assert_eq!(paths, vec!["readme.md"]);
    }

    #[test]
    fn files_ingest_caps_at_limit() {
        let entries: Vec<_> = (0..8)
            .map(|i| {
                json!({
                    "kind": "file",
                    "path": format!("f{i}.md"),
                    "name": format!("f{i}.md"),
                    "textLike": true,
                })
            })
            .collect();
        let paths = select_files_ingest_paths(&entries, "", 5);
        assert_eq!(paths.len(), 5);
    }
}
