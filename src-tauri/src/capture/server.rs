use std::io::{Read, Write};
use std::net::TcpStream;
use tauri::AppHandle;

use super::html::capture_page;
use super::create_inbox_note;

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

fn write_response(stream: &mut TcpStream, status: &str, content_type: &str, body: &[u8]) {
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: content-type, authorization\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn token_ok(headers: &str, path: &str, expected: &str) -> bool {
    if query_param(path, "token").as_deref() == Some(expected) {
        return true;
    }
    for line in headers.lines() {
        let lower = line.to_ascii_lowercase();
        if let Some(rest) = lower.strip_prefix("authorization:") {
            let rest = rest.trim();
            if let Some(token) = rest.strip_prefix("bearer ") {
                if token.trim() == expected {
                    return true;
                }
            }
        }
    }
    false
}

#[derive(serde::Deserialize)]
struct CaptureBody {
    #[serde(default)]
    title: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    text: String,
}

pub fn handle_connection(mut stream: TcpStream, app: &AppHandle, expected_token: &str) {
    let Some((first_line, headers, body_bytes)) = read_http_request(&mut stream) else {
        write_response(&mut stream, "400 Bad Request", "text/plain", b"bad request");
        return;
    };

    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("/");

    if method == "OPTIONS" {
        write_response(&mut stream, "204 No Content", "text/plain", b"");
        return;
    }

    if method == "GET" && (path == "/" || path.starts_with("/?")) {
        if !token_ok(&headers, path, expected_token) {
            write_response(&mut stream, "401 Unauthorized", "text/plain", b"invalid token");
            return;
        }
        let page = capture_page(expected_token);
        write_response(&mut stream, "200 OK", "text/html; charset=utf-8", page.as_bytes());
        return;
    }

    if method == "GET" && path.starts_with("/health") {
        write_response(&mut stream, "200 OK", "application/json", br#"{"ok":true}"#);
        return;
    }

    if method == "POST" && path.starts_with("/api/capture") {
        if !token_ok(&headers, path, expected_token) {
            write_response(
                &mut stream,
                "401 Unauthorized",
                "application/json",
                br#"{"error":"invalid token"}"#,
            );
            return;
        }

        let parsed: CaptureBody = if body_bytes.is_empty() {
            CaptureBody {
                title: String::new(),
                body: String::new(),
                text: String::new(),
            }
        } else if let Ok(json) = serde_json::from_slice(&body_bytes) {
            json
        } else {
            // form-urlencoded fallback
            let raw = String::from_utf8_lossy(&body_bytes);
            let mut title = String::new();
            let mut body = String::new();
            for pair in raw.split('&') {
                let mut kv = pair.splitn(2, '=');
                let k = kv.next().unwrap_or("");
                let v = urlencoding_decode(kv.next().unwrap_or(""));
                if k == "title" {
                    title = v;
                } else if k == "body" || k == "text" {
                    body = v;
                }
            }
            CaptureBody {
                title,
                body,
                text: String::new(),
            }
        };

        let text = if !parsed.body.trim().is_empty() {
            parsed.body
        } else {
            parsed.text
        };
        if text.trim().is_empty() {
            write_response(
                &mut stream,
                "400 Bad Request",
                "application/json",
                br#"{"error":"body is required"}"#,
            );
            return;
        }

        match create_inbox_note(app, &parsed.title, &text) {
            Ok(created) => {
                let payload = serde_json::json!({
                    "ok": true,
                    "documentId": created.document_id,
                    "title": created.title,
                });
                write_response(
                    &mut stream,
                    "200 OK",
                    "application/json",
                    payload.to_string().as_bytes(),
                );
            }
            Err(error) => {
                let payload = serde_json::json!({ "error": error });
                write_response(
                    &mut stream,
                    "500 Internal Server Error",
                    "application/json",
                    payload.to_string().as_bytes(),
                );
            }
        }
        return;
    }

    write_response(&mut stream, "404 Not Found", "text/plain", b"not found");
}
