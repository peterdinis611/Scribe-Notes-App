use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpHealth {
    pub ok: bool,
    pub version: String,
    pub model: String,
    pub features: Vec<String>,
}

#[derive(Debug)]
struct SidecarProcess {
    child: Child,
    stdin: BufWriter<ChildStdin>,
    stdout: BufReader<std::process::ChildStdout>,
}

pub struct NlpSidecar {
    script_path: PathBuf,
    python_bin: String,
    process: Mutex<Option<SidecarProcess>>,
    request_id: AtomicU64,
}

impl NlpSidecar {
    pub fn new() -> Self {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let script_path = manifest_dir.join("../nlp/scribe_nlp/__main__.py");
        let python_bin = std::env::var("SCRIBE_NLP_PYTHON").unwrap_or_else(|_| "python3".to_string());
        Self {
            script_path,
            python_bin,
            process: Mutex::new(None),
            request_id: AtomicU64::new(1),
        }
    }

    pub fn script_exists(&self) -> bool {
        self.script_path.exists()
    }

    fn spawn_process(&self) -> Result<SidecarProcess, String> {
        if !self.script_exists() {
            return Err(format!(
                "NLP sidecar script not found at {}",
                self.script_path.display()
            ));
        }

        let mut child = Command::new(&self.python_bin)
            .arg(&self.script_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|error| format!("Failed to start Python sidecar ({python}): {error}", python = self.python_bin))?;

        let stdin = child.stdin.take().ok_or("Missing sidecar stdin")?;
        let stdout = child.stdout.take().ok_or("Missing sidecar stdout")?;

        Ok(SidecarProcess {
            child,
            stdin: BufWriter::new(stdin),
            stdout: BufReader::new(stdout),
        })
    }

    fn reset_process(&self) {
        if let Ok(mut guard) = self.process.lock() {
            if let Some(mut process) = guard.take() {
                let _ = process.child.kill();
                let _ = process.child.wait();
            }
        }
    }

    fn call_method(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.request_id.fetch_add(1, Ordering::Relaxed);
        let request = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });

        let mut guard = self.process.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            *guard = Some(self.spawn_process()?);
        }

        let response = (|| -> Result<Value, String> {
            let process = guard.as_mut().ok_or("Sidecar unavailable")?;
            let payload = serde_json::to_string(&request).map_err(|e| e.to_string())?;
            writeln!(process.stdin, "{payload}").map_err(|e| e.to_string())?;
            process.stdin.flush().map_err(|e| e.to_string())?;

            let mut line = String::new();
            process.stdout.read_line(&mut line).map_err(|e| e.to_string())?;
            if line.trim().is_empty() {
                return Err("Empty response from NLP sidecar".to_string());
            }

            let value: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
            if let Some(error) = value.get("error") {
                return Err(error
                    .get("message")
                    .and_then(|item| item.as_str())
                    .unwrap_or("NLP sidecar error")
                    .to_string());
            }
            value
                .get("result")
                .cloned()
                .ok_or_else(|| "Missing result in NLP response".to_string())
        })();

        if response.is_err() {
            *guard = None;
        }

        response
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

    pub fn summarize(&self, text: &str, max_sentences: i64) -> Result<Value, String> {
        self.call_method(
            "summarize",
            json!({ "text": text, "maxSentences": max_sentences }),
        )
    }

    pub fn extract_entities(&self, text: &str) -> Result<Value, String> {
        self.call_method("extract_entities", json!({ "text": text }))
    }

    pub fn library_report(&self, documents: Value) -> Result<Value, String> {
        self.call_method("library_report", json!({ "documents": documents }))
    }
}

impl Drop for NlpSidecar {
    fn drop(&mut self) {
        self.reset_process();
    }
}

pub fn resolve_script_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../nlp/scribe_nlp/__main__.py")
}

pub fn script_path_label(path: &Path) -> String {
    path.to_string_lossy().to_string()
}
