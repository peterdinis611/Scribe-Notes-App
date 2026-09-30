use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use scribe_core::storage_fs::{self, ListOpts};

fn read_http_request(stream: &mut TcpStream) -> Option<(String, String, Vec<u8>)> {
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(8)));
    let mut buf = Vec::with_capacity(4096);
    let mut chunk = [0u8; 2048];
    loop {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                if let Some(idx) = find_header_end(&buf) {
                    let header_bytes = &buf[..idx];
                    let headers = String::from_utf8_lossy(header_bytes).to_string();
                    let first_line = headers.lines().next()?.to_string();
                    let content_length = headers
                        .lines()
                        .find_map(|line| {
                            let lower = line.to_ascii_lowercase();
                            lower
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse::<usize>().unwrap_or(0))
                        })
                        .unwrap_or(0);
                    let mut body = buf[idx..].to_vec();
                    while body.len() < content_length {
                        match stream.read(&mut chunk) {
                            Ok(0) => break,
                            Ok(n) => body.extend_from_slice(&chunk[..n]),
                            Err(_) => break,
                        }
                    }
                    if body.len() > content_length {
                        body.truncate(content_length);
                    }
                    return Some((first_line, headers, body));
                }
                if buf.len() > 64_000 {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    None
}

fn find_header_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n").map(|i| i + 4)
}

fn query_param(path: &str, key: &str) -> Option<String> {
    let q = path.split_once('?')?.1;
    for pair in q.split('&') {
        let mut parts = pair.splitn(2, '=');
        let k = parts.next()?;
        let v = parts.next().unwrap_or("");
        if k == key {
            return Some(urlencoding_decode(v));
        }
    }
    None
}

fn urlencoding_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = &value[i + 1..i + 3];
                if let Ok(b) = u8::from_str_radix(hex, 16) {
                    out.push(b);
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn path_only(full: &str) -> &str {
    full.split_once('?').map(|(p, _)| p).unwrap_or(full)
}

fn write_response(stream: &mut TcpStream, status: &str, content_type: &str, body: &[u8]) {
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: content-type\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn write_json(stream: &mut TcpStream, status: &str, value: &Value) {
    let body = serde_json::to_vec(value).unwrap_or_else(|_| b"{}".to_vec());
    write_response(stream, status, "application/json; charset=utf-8", &body);
}

fn write_err(stream: &mut TcpStream, message: &str) {
    let status = if message.starts_with("NotFound:") {
        "404 Not Found"
    } else if message.starts_with("InvalidPath:")
        || message.starts_with("NotADirectory:")
        || message.starts_with("NotAFile:")
        || message.starts_with("NotEmpty:")
        || message.starts_with("AlreadyExists:")
        || message.starts_with("RootProtected:")
        || message.starts_with("TooLarge:")
    {
        "400 Bad Request"
    } else {
        "500 Internal Server Error"
    };
    write_json(stream, status, &json!({ "error": message }));
}

fn strip_data_url_base64(data: &str) -> &str {
    data.split_once(',').map(|(_, d)| d).unwrap_or(data)
}

fn graphiql_html(port: u16) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Scribe Files API · GraphiQL</title>
  <style>
    :root {{ color-scheme: dark; }}
    body {{ margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      background: #12110f; color: #e8e4dc; }}
    header {{ padding: 14px 18px; border-bottom: 1px solid #2a2824;
      display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }}
    header strong {{ letter-spacing: 0.06em; text-transform: uppercase; font-size: 11px;
      color: #c4a574; }}
    header span {{ opacity: 0.7; font-size: 12px; }}
    main {{ padding: 18px; display: grid; gap: 14px; max-width: 920px; }}
    textarea {{ width: 100%; min-height: 160px; background: #1a1916; color: #e8e4dc;
      border: 1px solid #333029; border-radius: 8px; padding: 12px; font: inherit; }}
    button {{ background: #c4a574; color: #12110f; border: 0; border-radius: 6px;
      padding: 8px 14px; font-weight: 700; cursor: pointer; }}
    pre {{ background: #1a1916; border: 1px solid #333029; border-radius: 8px;
      padding: 12px; overflow: auto; white-space: pre-wrap; }}
    code {{ color: #9ecbff; }}
  </style>
</head>
<body>
  <header>
    <strong>Scribe Files API</strong>
    <span>http://127.0.0.1:{port}/graphql · loopback only</span>
  </header>
  <main>
    <p>Try a query against the local Files sandbox.</p>
    <textarea id="q">query {{
  storageFsList(path: "inbox") {{
    path
    count
    entries {{ path name kind sizeBytes }}
  }}
}}</textarea>
    <button id="run" type="button">Run</button>
    <pre id="out">Ready.</pre>
  </main>
  <script>
    const out = document.getElementById('out');
    document.getElementById('run').onclick = async () => {{
      out.textContent = 'Running…';
      try {{
        const res = await fetch('/graphql', {{
          method: 'POST',
          headers: {{ 'content-type': 'application/json' }},
          body: JSON.stringify({{ query: document.getElementById('q').value }}),
        }});
        const json = await res.json();
        out.textContent = JSON.stringify(json, null, 2);
      }} catch (e) {{
        out.textContent = String(e);
      }}
    }};
  </script>
</body>
</html>"#
    )
}

fn handle_graphql(documents_dir: &Path, body: &[u8]) -> Result<Value, String> {
    let payload: Value =
        serde_json::from_slice(body).map_err(|e| format!("InvalidPath: bad JSON ({e})"))?;
    let query = payload
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Minimal resolver: detect storageFsList / storageFsDiskUsage / health-ish fields
    if query.contains("storageFsList") {
        let path = payload
            .pointer("/variables/path")
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| {
                // naive extract path: "…" from query
                query
                    .split("path:")
                    .nth(1)
                    .and_then(|rest| {
                        let rest = rest.trim_start();
                        if let Some(s) = rest.strip_prefix('"') {
                            s.split('"').next()
                        } else {
                            Some("")
                        }
                    })
                    .unwrap_or("")
            });
        let entries = storage_fs::list(
            documents_dir,
            ListOpts {
                path: Some(path.to_string()),
                recursive: false,
                depth: None,
            },
        )?;
        return Ok(json!({
            "data": {
                "storageFsList": {
                    "path": path,
                    "count": entries.len(),
                    "entries": entries,
                }
            }
        }));
    }

    if query.contains("storageFsStat") {
        let path = payload
            .pointer("/variables/path")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let entry = storage_fs::stat(documents_dir, path)?;
        return Ok(json!({ "data": { "storageFsStat": entry } }));
    }

    if query.contains("__schema") || query.contains("storageFsHealth") {
        return Ok(json!({
            "data": {
                "storageFsHealth": { "ok": true, "root": "files/" }
            }
        }));
    }

    Ok(json!({
        "errors": [{
            "message": "Supported demo fields: storageFsList(path), storageFsStat(path). See docs/storage-fs-api.md for full schema."
        }]
    }))
}

pub fn handle_connection(mut stream: TcpStream, documents_dir: &Path, port: u16) {
    let Some((first_line, _headers, body_bytes)) = read_http_request(&mut stream) else {
        write_response(&mut stream, "400 Bad Request", "text/plain", b"bad request");
        return;
    };

    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let full_path = parts.next().unwrap_or("/");
    let path = path_only(full_path);

    if method == "OPTIONS" {
        write_response(&mut stream, "204 No Content", "text/plain", b"");
        return;
    }

    if method == "GET" && path == "/graphql" {
        let html = graphiql_html(port);
        write_response(
            &mut stream,
            "200 OK",
            "text/html; charset=utf-8",
            html.as_bytes(),
        );
        return;
    }

    if method == "POST" && path == "/graphql" {
        match handle_graphql(documents_dir, &body_bytes) {
            Ok(v) => write_json(&mut stream, "200 OK", &v),
            Err(e) => write_err(&mut stream, &e),
        }
        return;
    }

    if method == "GET" && path == "/v1/fs/health" {
        write_json(
            &mut stream,
            "200 OK",
            &json!({
                "ok": true,
                "port": port,
                "filesRoot": documents_dir.join("files").to_string_lossy(),
                "endpoints": super::endpoint_catalog(),
            }),
        );
        return;
    }

    if method == "GET" && path == "/v1/fs/list" {
        let rel = query_param(full_path, "path").unwrap_or_default();
        let recursive = query_param(full_path, "recursive")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        let depth = query_param(full_path, "depth").and_then(|v| v.parse().ok());
        match storage_fs::list(
            documents_dir,
            ListOpts {
                path: Some(rel.clone()),
                recursive,
                depth,
            },
        ) {
            Ok(entries) => write_json(
                &mut stream,
                "200 OK",
                &json!({ "path": rel, "count": entries.len(), "entries": entries }),
            ),
            Err(e) => write_err(&mut stream, &e),
        }
        return;
    }

    if method == "GET" && path == "/v1/fs/stat" {
        let rel = query_param(full_path, "path").unwrap_or_default();
        match storage_fs::stat(documents_dir, &rel) {
            Ok(entry) => write_json(&mut stream, "200 OK", &json!(entry)),
            Err(e) => write_err(&mut stream, &e),
        }
        return;
    }

    if method == "GET" && path == "/v1/fs/read" {
        let rel = query_param(full_path, "path").unwrap_or_default();
        match storage_fs::read_file(documents_dir, &rel) {
            Ok(bytes) => write_json(
                &mut stream,
                "200 OK",
                &json!({
                    "path": rel,
                    "sizeBytes": bytes.len(),
                    "dataBase64": STANDARD.encode(&bytes),
                }),
            ),
            Err(e) => write_err(&mut stream, &e),
        }
        return;
    }

    if method == "GET" && path == "/v1/fs/read-text" {
        let rel = query_param(full_path, "path").unwrap_or_default();
        match storage_fs::read_text(documents_dir, &rel, None) {
            Ok(text) => write_json(
                &mut stream,
                "200 OK",
                &json!({ "path": rel, "text": text, "sizeBytes": text.len() }),
            ),
            Err(e) => write_err(&mut stream, &e),
        }
        return;
    }

    if method == "GET" && path == "/v1/fs/search" {
        let query = query_param(full_path, "query").unwrap_or_default();
        let under = query_param(full_path, "path").unwrap_or_default();
        let q = query.to_ascii_lowercase();
        match storage_fs::list(
            documents_dir,
            ListOpts {
                path: Some(under),
                recursive: true,
                depth: Some(8),
            },
        ) {
            Ok(entries) => {
                let filtered: Vec<_> = entries
                    .into_iter()
                    .filter(|e| e.name.to_ascii_lowercase().contains(&q) || e.path.to_ascii_lowercase().contains(&q))
                    .take(100)
                    .collect();
                write_json(&mut stream, "200 OK", &json!(filtered));
            }
            Err(e) => write_err(&mut stream, &e),
        }
        return;
    }

    if method == "GET" && path == "/v1/fs/disk-usage" {
        let rel = query_param(full_path, "path").unwrap_or_default();
        match storage_fs::list(
            documents_dir,
            ListOpts {
                path: Some(rel.clone()),
                recursive: true,
                depth: Some(32),
            },
        ) {
            Ok(entries) => {
                let mut total = 0u64;
                let mut files = 0u64;
                let mut dirs = 0u64;
                for e in &entries {
                    match e.kind {
                        storage_fs::StorageEntryKind::File => {
                            files += 1;
                            total += e.size_bytes.unwrap_or(0);
                        }
                        storage_fs::StorageEntryKind::Dir => dirs += 1,
                    }
                }
                write_json(
                    &mut stream,
                    "200 OK",
                    &json!({
                        "path": rel,
                        "totalBytes": total,
                        "fileCount": files,
                        "dirCount": dirs,
                    }),
                );
            }
            Err(e) => write_err(&mut stream, &e),
        }
        return;
    }

    if method == "POST" {
        let payload: Value = serde_json::from_slice(&body_bytes).unwrap_or(json!({}));
        let result = match path {
            "/v1/fs/mkdir" => {
                let p = payload.get("path").and_then(|v| v.as_str()).unwrap_or("");
                storage_fs::mkdir(documents_dir, p).map(|e| json!(e))
            }
            "/v1/fs/write-text" => {
                let p = payload.get("path").and_then(|v| v.as_str()).unwrap_or("");
                let text = payload.get("text").and_then(|v| v.as_str()).unwrap_or("");
                let overwrite = payload
                    .get("overwrite")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                storage_fs::write_text(documents_dir, p, text, overwrite).map(|e| json!(e))
            }
            "/v1/fs/write" => {
                let p = payload.get("path").and_then(|v| v.as_str()).unwrap_or("");
                let data = payload
                    .get("dataBase64")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let overwrite = payload
                    .get("overwrite")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                match STANDARD.decode(strip_data_url_base64(data)) {
                    Ok(bytes) => {
                        storage_fs::write_file(documents_dir, p, &bytes, overwrite).map(|e| json!(e))
                    }
                    Err(e) => Err(format!("InvalidPath: bad base64 ({e})")),
                }
            }
            "/v1/fs/delete" => {
                let p = payload.get("path").and_then(|v| v.as_str()).unwrap_or("");
                let recursive = payload
                    .get("recursive")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                storage_fs::delete(documents_dir, p, recursive)
                    .map(|_| json!({ "ok": true, "path": p }))
            }
            "/v1/fs/rename" => {
                let from = payload.get("from").and_then(|v| v.as_str()).unwrap_or("");
                let to = payload.get("to").and_then(|v| v.as_str()).unwrap_or("");
                storage_fs::rename(documents_dir, from, to).map(|e| json!(e))
            }
            "/v1/fs/copy" => {
                let from = payload.get("from").and_then(|v| v.as_str()).unwrap_or("");
                let to = payload.get("to").and_then(|v| v.as_str()).unwrap_or("");
                let overwrite = payload
                    .get("overwrite")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                storage_fs::read_file(documents_dir, from).and_then(|bytes| {
                    storage_fs::write_file(documents_dir, to, &bytes, overwrite).map(|e| json!(e))
                })
            }
            "/v1/fs/ensure-defaults" => storage_fs::ensure_defaults(documents_dir)
                .map(|created| json!({ "created": created })),
            _ => Err(format!("NotFound: unknown route {path}")),
        };
        match result {
            Ok(v) => write_json(&mut stream, "200 OK", &v),
            Err(e) => write_err(&mut stream, &e),
        }
        return;
    }

    write_err(&mut stream, &format!("NotFound: {method} {path}"));
}
