use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

fn nlp_rpc_debug_enabled() -> bool {
    matches!(
        std::env::var("SCRIBE_NLP_DEBUG")
            .or_else(|_| std::env::var("SCRIBE_DEBUG"))
            .ok()
            .as_deref(),
        Some("1" | "true" | "yes" | "on" | "debug")
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpHealth {
    pub ok: bool,
    pub version: String,
    pub model: String,
    pub features: Vec<String>,
    #[serde(default)]
    pub embed_backend: Option<String>,
    #[serde(default)]
    pub quality_available: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct EmbedChunk {
    pub index: i32,
    pub text: String,
    pub vector: Vec<f32>,
}

#[derive(Debug, Clone)]
pub struct EmbedChunksResult {
    pub vector: Vec<f32>,
    pub chunks: Vec<EmbedChunk>,
    pub model: String,
}

fn parse_f32_vector(value: &Value) -> Vec<f32> {
    value
        .as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .map(|item| item.as_f64().unwrap_or(0.0) as f32)
        .collect()
}

fn parse_embed_chunks_result(value: &Value) -> Result<EmbedChunksResult, String> {
    let vector = value
        .get("vector")
        .map(parse_f32_vector)
        .ok_or("Invalid embed chunks response: missing vector")?;
    let model = value
        .get("model")
        .and_then(|item| item.as_str())
        .unwrap_or("unknown")
        .to_string();
    let mut chunks = Vec::new();
    if let Some(items) = value.get("chunks").and_then(|item| item.as_array()) {
        for entry in items {
            let index = entry
                .get("index")
                .and_then(|item| item.as_i64())
                .unwrap_or(chunks.len() as i64) as i32;
            let text = entry
                .get("text")
                .and_then(|item| item.as_str())
                .unwrap_or("")
                .to_string();
            let chunk_vector = entry
                .get("vector")
                .map(parse_f32_vector)
                .unwrap_or_default();
            if chunk_vector.is_empty() {
                continue;
            }
            chunks.push(EmbedChunk {
                index,
                text,
                vector: chunk_vector,
            });
        }
    }
    if chunks.is_empty() && !vector.is_empty() {
        chunks.push(EmbedChunk {
            index: 0,
            text: String::new(),
            vector: vector.clone(),
        });
    }
    Ok(EmbedChunksResult {
        vector,
        chunks,
        model,
    })
}

#[derive(Debug)]
struct SidecarProcess {
    child: Child,
    stdin: BufWriter<ChildStdin>,
}

enum WorkerMsg {
    Call {
        id: u64,
        method: String,
        params: Value,
        timeout: Duration,
        reply: mpsc::Sender<Result<Value, String>>,
    },
    Reset,
    Shutdown,
}

pub struct NlpSidecar {
    script_path: PathBuf,
    python_bin: String,
    request_id: AtomicU64,
    jobs: Mutex<mpsc::Sender<WorkerMsg>>,
    pid: Arc<AtomicU32>,
    cancel: Arc<AtomicBool>,
}

impl NlpSidecar {
    pub fn new(script_path: PathBuf) -> Self {
        let python_bin = std::env::var("SCRIBE_NLP_PYTHON").unwrap_or_else(|_| "python3".to_string());
        let (tx, rx) = mpsc::channel();
        let pid = Arc::new(AtomicU32::new(0));
        let cancel = Arc::new(AtomicBool::new(false));
        let worker_script = script_path.clone();
        let worker_python = python_bin.clone();
        let worker_pid = Arc::clone(&pid);
        let worker_cancel = Arc::clone(&cancel);
        let _ = thread::Builder::new()
            .name("scribe-nlp-worker".into())
            .spawn(move || worker_loop(rx, worker_script, worker_python, worker_pid, worker_cancel));
        Self {
            script_path,
            python_bin,
            request_id: AtomicU64::new(1),
            jobs: Mutex::new(tx),
            pid,
            cancel,
        }
    }

    pub fn script_path(&self) -> &Path {
        &self.script_path
    }

    pub fn script_exists(&self) -> bool {
        self.script_path.exists()
    }

    pub fn python_bin(&self) -> &str {
        &self.python_bin
    }

    pub fn reset_process(&self) {
        self.cancel.store(true, Ordering::SeqCst);
        kill_os_pid(self.pid.load(Ordering::SeqCst));
        if let Ok(tx) = self.jobs.lock() {
            let _ = tx.send(WorkerMsg::Reset);
        }
    }

    /// Kill the current RPC (if any) and respawn Python on the next call.
    pub fn cancel_inflight(&self) {
        self.reset_process();
    }

    pub fn configure_embed_backend(&self, backend: &str) -> Result<(), String> {
        self.call_method("set_embed_backend", json!({ "backend": backend }))?;
        Ok(())
    }

    fn call_method(&self, method: &str, params: Value) -> Result<Value, String> {
        let timeout = rpc_timeout(method);
        let id = self.request_id.fetch_add(1, Ordering::Relaxed);
        let (reply_tx, reply_rx) = mpsc::channel();
        {
            let tx = self.jobs.lock().map_err(|e| e.to_string())?;
            tx.send(WorkerMsg::Call {
                id,
                method: method.to_string(),
                params,
                timeout,
                reply: reply_tx,
            })
            .map_err(|_| "NLP worker stopped".to_string())?;
        }
        match reply_rx.recv_timeout(timeout + Duration::from_secs(2)) {
            Ok(result) => result,
            Err(RecvTimeoutError::Timeout) => {
                self.reset_process();
                Err(format!("NLP sidecar timed out ({method})"))
            }
            Err(RecvTimeoutError::Disconnected) => Err("NLP worker stopped".to_string()),
        }
    }

    pub fn health(&self) -> Result<NlpHealth, String> {
        let result = self.call_method("health", json!({}))?;
        Ok(serde_json::from_value(result).map_err(|e| e.to_string())?)
    }

    pub fn embed_text(&self, text: &str) -> Result<(Vec<f32>, String), String> {
        let result = self.call_method("embed", json!({ "text": text }))?;
        let vector = result
            .get("vector")
            .and_then(|value| value.as_array())
            .ok_or("Invalid embed response")?
            .iter()
            .map(|value| value.as_f64().unwrap_or(0.0) as f32)
            .collect::<Vec<_>>();
        let model = result
            .get("model")
            .and_then(|value| value.as_str())
            .unwrap_or("unknown")
            .to_string();
        Ok((vector, model))
    }

    pub fn embed_batch(&self, texts: &[String]) -> Result<(Vec<Vec<f32>>, String), String> {
        let result = self.call_method("embed_batch", json!({ "texts": texts }))?;
        let model = result
            .get("model")
            .and_then(|value| value.as_str())
            .unwrap_or("unknown")
            .to_string();
        let vectors = result
            .get("vectors")
            .and_then(|value| value.as_array())
            .ok_or("Invalid embed_batch response")?
            .iter()
            .map(|entry| {
                entry
                    .as_array()
                    .unwrap_or(&Vec::new())
                    .iter()
                    .map(|value| value.as_f64().unwrap_or(0.0) as f32)
                    .collect::<Vec<_>>()
            })
            .collect();
        Ok((vectors, model))
    }

    pub fn embed_with_chunks(&self, text: &str) -> Result<EmbedChunksResult, String> {
        let result = self.call_method("embed_with_chunks", json!({ "text": text }))?;
        parse_embed_chunks_result(&result)
    }

    pub fn embed_batch_with_chunks(
        &self,
        texts: &[String],
    ) -> Result<(Vec<EmbedChunksResult>, String), String> {
        let result = self.call_method("embed_batch_with_chunks", json!({ "texts": texts }))?;
        let model = result
            .get("model")
            .and_then(|value| value.as_str())
            .unwrap_or("unknown")
            .to_string();
        let documents = result
            .get("documents")
            .and_then(|value| value.as_array())
            .ok_or("Invalid embed_batch_with_chunks response")?;
        let mut out = Vec::with_capacity(documents.len());
        for entry in documents {
            let mut parsed = parse_embed_chunks_result(entry)?;
            parsed.model = model.clone();
            out.push(parsed);
        }
        Ok((out, model))
    }

    pub fn resolve_due_hints(&self, texts: &[String]) -> Result<Vec<Option<String>>, String> {
        let result = self.call_method("resolve_due_hints", json!({ "texts": texts }))?;
        let hints = result
            .get("hints")
            .and_then(|value| value.as_array())
            .ok_or("Invalid resolve_due_hints response")?;
        Ok(hints
            .iter()
            .map(|value| {
                value
                    .as_str()
                    .map(str::to_string)
                    .filter(|item| !item.is_empty())
            })
            .collect())
    }

    pub fn library_answer(
        &self,
        question: &str,
        passages: Value,
        max_sentences: i64,
    ) -> Result<Value, String> {
        self.library_answer_scoped(question, passages, max_sentences, "library")
    }

    pub fn library_answer_scoped(
        &self,
        question: &str,
        passages: Value,
        max_sentences: i64,
        scope: &str,
    ) -> Result<Value, String> {
        self.call_method(
            "library_answer",
            json!({
                "question": question,
                "passages": passages,
                "maxSentences": max_sentences,
                "scope": scope,
            }),
        )
    }

    pub fn suggest_wiki_links(
        &self,
        text: &str,
        documents: Value,
        limit: i64,
        exclude_document_id: Option<&str>,
    ) -> Result<Value, String> {
        let mut params = json!({
            "text": text,
            "documents": documents,
            "limit": limit,
        });
        if let Some(document_id) = exclude_document_id {
            params["excludeDocumentId"] = json!(document_id);
        }
        self.call_method("suggest_wiki_links", params)
    }

    pub fn suggest_organize(
        &self,
        text: &str,
        folders: Value,
        tags: Value,
        current_folder_id: Option<&str>,
        limit: i64,
    ) -> Result<Value, String> {
        let mut params = json!({
            "text": text,
            "folders": folders,
            "tags": tags,
            "limit": limit,
        });
        if let Some(folder_id) = current_folder_id {
            params["currentFolderId"] = json!(folder_id);
        }
        self.call_method("suggest_organize", params)
    }

    pub fn extract_dates_batch(
        &self,
        documents: Value,
        limit_per_doc: i64,
    ) -> Result<Value, String> {
        self.call_method(
            "extract_dates_batch",
            json!({
                "documents": documents,
                "limitPerDoc": limit_per_doc,
            }),
        )
    }

    pub fn summarize(&self, text: &str, max_sentences: i64) -> Result<Value, String> {
        self.call_method(
            "summarize",
            json!({ "text": text, "maxSentences": max_sentences }),
        )
    }

    pub fn extract_entities(&self, text: &str) -> Result<Value, String> {
        self.call_method("extract_entities", json!({ "text": text }))
    }

    pub fn extract_tasks(&self, text: &str) -> Result<Value, String> {
        self.call_method("extract_tasks", json!({ "text": text }))
    }

    pub fn extract_keywords(&self, text: &str, limit: i64) -> Result<Value, String> {
        self.call_method(
            "extract_keywords",
            json!({ "text": text, "limit": limit }),
        )
    }

    pub fn detect_language(&self, text: &str) -> Result<Value, String> {
        self.call_method("detect_language", json!({ "text": text }))
    }

    pub fn extract_outline(&self, text: &str, limit: i64) -> Result<Value, String> {
        self.call_method(
            "extract_outline",
            json!({ "text": text, "limit": limit }),
        )
    }

    pub fn analyze_document(
        &self,
        text: &str,
        keyword_limit: i64,
        outline_limit: i64,
        summary_sentences: i64,
    ) -> Result<Value, String> {
        self.call_method(
            "analyze_document",
            json!({
                "text": text,
                "keywordLimit": keyword_limit,
                "outlineLimit": outline_limit,
                "summarySentences": summary_sentences,
            }),
        )
    }

    pub fn similar_notes(&self, text: &str, documents: Value, limit: i64) -> Result<Value, String> {
        self.call_method(
            "similar_notes",
            json!({ "text": text, "documents": documents, "limit": limit }),
        )
    }

    pub fn library_report(&self, documents: Value, folders: Value) -> Result<Value, String> {
        self.call_method(
            "library_report",
            json!({ "documents": documents, "folders": folders }),
        )
    }

    pub fn reading_stats(&self, text: &str) -> Result<Value, String> {
        self.call_method("reading_stats", json!({ "text": text }))
    }

    pub fn find_duplicates(
        &self,
        documents: Value,
        limit: i64,
        min_score: f64,
    ) -> Result<Value, String> {
        self.call_method(
            "find_duplicates",
            json!({ "documents": documents, "limit": limit, "minScore": min_score }),
        )
    }

    pub fn suggest_title(&self, text: &str, max_chars: i64) -> Result<Value, String> {
        self.call_method(
            "suggest_title",
            json!({ "text": text, "maxChars": max_chars }),
        )
    }

    pub fn extract_mentions(&self, text: &str) -> Result<Value, String> {
        self.call_method("extract_mentions", json!({ "text": text }))
    }

    pub fn analyze_sentiment(&self, text: &str) -> Result<Value, String> {
        self.call_method("analyze_sentiment", json!({ "text": text }))
    }

    pub fn extract_dates(&self, text: &str) -> Result<Value, String> {
        self.call_method("extract_dates", json!({ "text": text }))
    }

    pub fn summarize_diff(
        &self,
        old_text: &str,
        new_text: &str,
        max_bullets: i64,
    ) -> Result<Value, String> {
        self.call_method(
            "summarize_diff",
            json!({
                "oldText": old_text,
                "newText": new_text,
                "maxBullets": max_bullets,
            }),
        )
    }

    pub fn template_fill_hints(
        &self,
        text: &str,
        expected_sections: Value,
    ) -> Result<Value, String> {
        self.call_method(
            "template_fill_hints",
            json!({ "text": text, "expectedSections": expected_sections }),
        )
    }

    pub fn rewrite_query(&self, query: &str, max_expansions: i64) -> Result<Value, String> {
        self.call_method(
            "rewrite_query",
            json!({ "query": query, "maxExpansions": max_expansions }),
        )
    }

    pub fn spellcheck(
        &self,
        text: &str,
        language: Option<&str>,
        max_issues: i64,
    ) -> Result<Value, String> {
        let mut params = json!({
            "text": text,
            "maxIssues": max_issues,
        });
        if let Some(lang) = language {
            params["language"] = json!(lang);
        }
        self.call_method("spellcheck", params)
    }

    pub fn chunk_text(
        &self,
        text: &str,
        max_chars: i64,
        overlap: i64,
        max_chunks: i64,
    ) -> Result<Value, String> {
        self.call_method(
            "chunk_text",
            json!({
                "text": text,
                "maxChars": max_chars,
                "overlap": overlap,
                "maxChunks": max_chunks,
            }),
        )
    }

    pub fn rewrite_selection(
        &self,
        text: &str,
        mode: &str,
        custom_instruction: Option<&str>,
    ) -> Result<Value, String> {
        let mut params = json!({
            "text": text,
            "mode": mode,
        });
        if let Some(inst) = custom_instruction {
            params["customInstruction"] = json!(inst);
        }
        self.call_method("rewrite_selection", params)
    }

    pub fn rewrite_selection_typed(
        &self,
        text: &str,
        mode: &str,
        custom_instruction: Option<&str>,
    ) -> Result<crate::nlp::NlpRewriteResult, String> {
        let raw = self.rewrite_selection(text, mode, custom_instruction)?;
        Ok(crate::nlp::parse_rewrite_result(&raw, mode, text))
    }

    pub fn analyze_document_typed(
        &self,
        text: &str,
        keyword_limit: i64,
        outline_limit: i64,
        summary_sentences: i64,
    ) -> Result<crate::nlp::NlpDocumentAnalysis, String> {
        let raw = self.analyze_document(text, keyword_limit, outline_limit, summary_sentences)?;
        Ok(crate::nlp::parse_document_analysis(&raw))
    }
}

impl Drop for NlpSidecar {
    fn drop(&mut self) {
        self.cancel.store(true, Ordering::SeqCst);
        kill_os_pid(self.pid.load(Ordering::SeqCst));
        if let Ok(tx) = self.jobs.lock() {
            let _ = tx.send(WorkerMsg::Shutdown);
        }
    }
}

pub fn rpc_timeout(method: &str) -> Duration {
    if let Ok(ms) = std::env::var("SCRIBE_NLP_RPC_TIMEOUT_MS") {
        if let Ok(n) = ms.parse::<u64>() {
            return Duration::from_millis(n.max(500));
        }
    }
    match method {
        "health" | "set_embed_backend" => Duration::from_secs(8),
        "embed" | "rewrite_query" | "chunk_text" => Duration::from_secs(25),
        "embed_with_chunks" => Duration::from_secs(60),
        "embed_batch" | "embed_batch_with_chunks" => Duration::from_secs(180),
        "library_answer" | "find_duplicates" | "library_report" | "analyze_document" => {
            Duration::from_secs(90)
        }
        _ => Duration::from_secs(45),
    }
}

fn kill_os_pid(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(unix)]
    {
        let _ = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .status();
    }
}

fn spawn_sidecar(script_path: &Path, python_bin: &str) -> Result<(SidecarProcess, mpsc::Receiver<Result<String, String>>), String> {
    if !script_path.exists() {
        return Err(format!(
            "NLP sidecar script not found at {}",
            script_path.display()
        ));
    }

    let mut child = Command::new(python_bin)
        .arg(script_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .env(
            "SCRIBE_NLP_DEBUG",
            std::env::var("SCRIBE_NLP_DEBUG").unwrap_or_else(|_| {
                match std::env::var("SCRIBE_DEBUG").as_deref() {
                    Ok("1" | "true" | "yes" | "on" | "debug") => "1".to_string(),
                    _ => "0".to_string(),
                }
            }),
        )
        .spawn()
        .map_err(|error| {
            format!("Failed to start Python sidecar ({python_bin}): {error}")
        })?;

    let stdin = child.stdin.take().ok_or("Missing sidecar stdin")?;
    let stdout = child.stdout.take().ok_or("Missing sidecar stdout")?;
    let (line_tx, line_rx) = mpsc::channel();
    thread::Builder::new()
        .name("scribe-nlp-stdout".into())
        .spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut line = String::new();
                match reader.read_line(&mut line) {
                    Ok(0) => {
                        let _ = line_tx.send(Err("NLP sidecar closed stdout".to_string()));
                        break;
                    }
                    Ok(_) => {
                        if line_tx.send(Ok(line)).is_err() {
                            break;
                        }
                    }
                    Err(error) => {
                        let _ = line_tx.send(Err(error.to_string()));
                        break;
                    }
                }
            }
        })
        .map_err(|e| e.to_string())?;

    Ok((
        SidecarProcess {
            child,
            stdin: BufWriter::new(stdin),
        },
        line_rx,
    ))
}

fn kill_process(process: &mut SidecarProcess, pid: &AtomicU32) {
    let _ = process.child.kill();
    let _ = process.child.wait();
    pid.store(0, Ordering::SeqCst);
}

fn watchdog_dead(process: &mut SidecarProcess, pid: &AtomicU32) -> bool {
    match process.child.try_wait() {
        Ok(Some(_)) => {
            pid.store(0, Ordering::SeqCst);
            true
        }
        Ok(None) => false,
        Err(_) => {
            pid.store(0, Ordering::SeqCst);
            true
        }
    }
}

fn parse_rpc_result(line: &str, id: u64, method: &str) -> Result<Value, String> {
    if line.trim().is_empty() {
        return Err("Empty response from NLP sidecar".to_string());
    }
    let value: Value = serde_json::from_str(line).map_err(|e| e.to_string())?;
    if let Some(error) = value.get("error") {
        if nlp_rpc_debug_enabled() {
            log::debug!("NLP RPC ← error id={id}: {error}");
        }
        return Err(error
            .get("message")
            .and_then(|item| item.as_str())
            .unwrap_or("NLP sidecar error")
            .to_string());
    }
    if nlp_rpc_debug_enabled() {
        log::debug!("NLP RPC ← ok id={id} {method}");
    }
    value
        .get("result")
        .cloned()
        .ok_or_else(|| "Missing result in NLP response".to_string())
}

fn worker_loop(
    rx: mpsc::Receiver<WorkerMsg>,
    script_path: PathBuf,
    python_bin: String,
    pid: Arc<AtomicU32>,
    cancel: Arc<AtomicBool>,
) {
    let mut process: Option<SidecarProcess> = None;
    let mut lines: Option<mpsc::Receiver<Result<String, String>>> = None;

    while let Ok(msg) = rx.recv() {
        match msg {
            WorkerMsg::Shutdown => {
                if let Some(mut current) = process.take() {
                    kill_process(&mut current, &pid);
                }
                lines = None;
                break;
            }
            WorkerMsg::Reset => {
                cancel.store(false, Ordering::SeqCst);
                if let Some(mut current) = process.take() {
                    kill_process(&mut current, &pid);
                }
                lines = None;
            }
            WorkerMsg::Call {
                id,
                method,
                params,
                timeout,
                reply,
            } => {
                cancel.store(false, Ordering::SeqCst);
                if process.as_mut().is_some_and(|current| watchdog_dead(current, &pid)) {
                    process = None;
                    lines = None;
                }
                if process.is_none() {
                    match spawn_sidecar(&script_path, &python_bin) {
                        Ok((spawned, reader)) => {
                            pid.store(spawned.child.id(), Ordering::SeqCst);
                            process = Some(spawned);
                            lines = Some(reader);
                        }
                        Err(error) => {
                            let _ = reply.send(Err(error));
                            continue;
                        }
                    }
                }

                let request = json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "method": method,
                    "params": params,
                });
                let write_err = (|| -> Result<(), String> {
                    let current = process.as_mut().ok_or("Sidecar unavailable")?;
                    let payload = serde_json::to_string(&request).map_err(|e| e.to_string())?;
                    if nlp_rpc_debug_enabled() {
                        log::debug!("NLP RPC → {method} id={id}");
                    }
                    writeln!(current.stdin, "{payload}").map_err(|e| e.to_string())?;
                    current.stdin.flush().map_err(|e| e.to_string())
                })();
                if let Err(error) = write_err {
                    if let Some(mut current) = process.take() {
                        kill_process(&mut current, &pid);
                    }
                    lines = None;
                    let _ = reply.send(Err(error));
                    continue;
                }

                let deadline = Instant::now() + timeout;
                let result = loop {
                    if cancel.load(Ordering::SeqCst) {
                        break Err(format!("NLP sidecar cancelled ({method})"));
                    }
                    let remaining = deadline.saturating_duration_since(Instant::now());
                    if remaining.is_zero() {
                        break Err(format!("NLP sidecar timed out ({method})"));
                    }
                    let slice = remaining.min(Duration::from_millis(200));
                    match lines.as_ref().unwrap().recv_timeout(slice) {
                        Ok(Ok(line)) => break parse_rpc_result(&line, id, &method),
                        Ok(Err(error)) => break Err(error),
                        Err(RecvTimeoutError::Timeout) => continue,
                        Err(RecvTimeoutError::Disconnected) => {
                            break Err("NLP sidecar closed stdout".to_string());
                        }
                    }
                };

                if result.is_err() {
                    if let Some(mut current) = process.take() {
                        kill_process(&mut current, &pid);
                    }
                    lines = None;
                }
                let _ = reply.send(result);
            }
        }
    }
}

pub fn resolve_script_path() -> PathBuf {
    if let Ok(path) = std::env::var("SCRIBE_NLP_SCRIPT") {
        return PathBuf::from(path);
    }

    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../nlp/scribe_nlp/__main__.py");
    if dev_path.exists() {
        return dev_path;
    }

    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../nlp/scribe_nlp/__main__.py");
    bundled
}

pub fn script_path_label(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_path_label_formats_display_path() {
        let path = PathBuf::from("/tmp/scribe_nlp/__main__.py");
        assert!(script_path_label(&path).contains("__main__.py"));
    }

    fn live_sidecar() -> Option<NlpSidecar> {
        let path = std::env::var("SCRIBE_NLP_SCRIPT")
            .map(PathBuf::from)
            .unwrap_or_else(|_| resolve_script_path());
        if !path.exists() {
            eprintln!("skip live sidecar: missing {}", path.display());
            return None;
        }
        Some(NlpSidecar::new(path))
    }

    #[test]
    fn live_sidecar_health_analyze_rewrite() {
        let Some(sidecar) = live_sidecar() else {
            return;
        };
        let health = match sidecar.health() {
            Ok(health) => health,
            Err(error) => {
                eprintln!("skip live sidecar: {error}");
                return;
            }
        };
        assert!(health.ok, "sidecar health not ok: {health:?}");
        assert!(!health.version.is_empty());

        let analysis = sidecar
            .analyze_document_typed(
                "Meeting tomorrow in Bratislava. Need to finish the report and email Peter.",
                8,
                8,
                2,
            )
            .expect("analyze_document");
        assert!(!analysis.language.is_empty());

        let rewritten = sidecar
            .rewrite_selection_typed(
                "this is kinda messy notes",
                "rephrase_professional",
                None,
            )
            .expect("rewrite_selection");
        assert!(!rewritten.output.trim().is_empty());
        assert_eq!(rewritten.mode, "rephrase_professional");

        let dates = sidecar
            .extract_dates("Meet tomorrow in Bratislava, then Friday.")
            .expect("extract_dates");
        assert!(dates.get("events").and_then(Value::as_array).is_some());

        let spell = sidecar
            .spellcheck("This sentense has a typo.", Some("en"), 8)
            .expect("spellcheck");
        assert!(spell.get("issues").and_then(Value::as_array).is_some());

        let query = sidecar
            .rewrite_query("notes about friday meeting", 4)
            .expect("rewrite_query");
        assert!(
            query
                .get("query")
                .or_else(|| query.get("rewritten"))
                .or_else(|| query.get("expanded"))
                .is_some()
                || query.get("expansions").is_some()
        );
    }
}
