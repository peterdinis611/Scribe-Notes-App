use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Mutex;
use std::time::Instant;
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

/// Capture auth: Bearer / X-Scribe-Capture-Token only (query `?token=` is rejected).
pub(crate) fn token_ok(headers: &str, path: &str, expected: &str) -> bool {
    // Explicitly ignore query tokens — they must not authorize.
    let _ = path;
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
        if let Some(rest) = lower.strip_prefix("x-scribe-capture-token:") {
            if rest.trim() == expected {
                return true;
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

fn mint_form_nonce() -> String {
    uuid::Uuid::new_v4().to_string().replace('-', "")
}

/// Consume a one-time form nonce. Returns false if missing/mismatched.
fn consume_form_nonce(store: &Mutex<Option<String>>, presented: &str) -> bool {
    let Ok(mut guard) = store.lock() else {
        return false;
    };
    match guard.take() {
        Some(expected) if !presented.is_empty() && expected == presented => true,
        Some(expected) => {
            // Put back so a wrong guess does not wipe a valid pending nonce.
            *guard = Some(expected);
            false
        }
        None => false,
    }
}

pub fn handle_connection(
    mut stream: TcpStream,
    peer: Option<std::net::SocketAddr>,
    app: &AppHandle,
    session: &crate::security::TokenSession,
    limiter: &crate::security::RateLimiter,
    form_nonce: &Mutex<Option<String>>,
    last_activity: &Mutex<Instant>,
) {
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

    let key = crate::security::client_key(peer);
    if !limiter.check(&key) {
        write_response(
            &mut stream,
            "429 Too Many Requests",
            "application/json",
            br#"{"error":"rate limit exceeded"}"#,
        );
        return;
    }

    // Public form shell — session token is in the URL hash; POST needs Bearer + one-time nonce.
    if method == "GET" && (path == "/" || path.starts_with("/?")) {
        if let Ok(mut last) = last_activity.lock() {
            *last = Instant::now();
        }
        let nonce = mint_form_nonce();
        if let Ok(mut guard) = form_nonce.lock() {
            *guard = Some(nonce.clone());
        }
        let page = capture_page("", &nonce);
        write_response(&mut stream, "200 OK", "text/html; charset=utf-8", page.as_bytes());
        return;
    }

    if method == "GET" && path.starts_with("/health") {
        write_response(&mut stream, "200 OK", "application/json", br#"{"ok":true}"#);
        return;
    }

    if method == "POST" && path.starts_with("/api/capture") {
        let presented = headers.lines().find_map(|line| {
            let lower = line.to_ascii_lowercase();
            lower
                .strip_prefix("authorization:")
                .and_then(|rest| rest.trim().strip_prefix("bearer ").map(|t| t.trim().to_string()))
                .or_else(|| {
                    lower
                        .strip_prefix("x-scribe-capture-token:")
                        .map(|t| t.trim().to_string())
                })
        });
        let auth_ok = presented
            .as_deref()
            .map(|t| session.is_valid(t))
            .unwrap_or(false);
        if !auth_ok {
            write_response(
                &mut stream,
                "401 Unauthorized",
                "application/json",
                br#"{"error":"invalid or expired token"}"#,
            );
            return;
        }

        let presented_nonce = headers.lines().find_map(|line| {
            let lower = line.to_ascii_lowercase();
            lower
                .strip_prefix("x-scribe-capture-nonce:")
                .map(|t| t.trim().to_string())
        });
        let nonce_ok = presented_nonce
            .as_deref()
            .map(|n| consume_form_nonce(form_nonce, n))
            .unwrap_or(false);
        if !nonce_ok {
            // Issue a fresh nonce so a legitimate client can retry after reload.
            let fresh = mint_form_nonce();
            if let Ok(mut guard) = form_nonce.lock() {
                *guard = Some(fresh.clone());
            }
            let payload = serde_json::json!({
                "error": "invalid or reused form nonce",
                "nonce": fresh,
            });
            write_response(
                &mut stream,
                "403 Forbidden",
                "application/json",
                payload.to_string().as_bytes(),
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
        let next_nonce = mint_form_nonce();
        if let Ok(mut guard) = form_nonce.lock() {
            *guard = Some(next_nonce.clone());
        }
        if text.trim().is_empty() {
            let payload = serde_json::json!({
                "error": "body is required",
                "nonce": next_nonce,
            });
            write_response(
                &mut stream,
                "400 Bad Request",
                "application/json",
                payload.to_string().as_bytes(),
            );
            return;
        }

        match create_inbox_note(app, &parsed.title, &text) {
            Ok(created) => {
                if let Ok(mut last) = last_activity.lock() {
                    *last = Instant::now();
                }
                let payload = serde_json::json!({
                    "ok": true,
                    "documentId": created.document_id,
                    "title": created.title,
                    "nonce": next_nonce,
                });
                write_response(
                    &mut stream,
                    "200 OK",
                    "application/json",
                    payload.to_string().as_bytes(),
                );
            }
            Err(error) => {
                let payload = serde_json::json!({ "error": error, "nonce": next_nonce });
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

#[cfg(test)]
mod tests {
    use super::token_ok;

    #[test]
    fn accepts_bearer_header() {
        let headers = "Host: 127.0.0.1\r\nAuthorization: Bearer secret\r\n\r\n";
        assert!(token_ok(headers, "/api/capture", "secret"));
    }

    #[test]
    fn accepts_custom_capture_header() {
        let headers = "X-Scribe-Capture-Token: secret\r\n";
        assert!(token_ok(headers, "/api/capture", "secret"));
    }

    #[test]
    fn rejects_query_token() {
        assert!(!token_ok(
            "Host: x\r\n\r\n",
            "/api/capture?token=secret",
            "secret"
        ));
    }

    #[test]
    fn rejects_wrong_bearer() {
        let headers = "Authorization: Bearer nope\r\n";
        assert!(!token_ok(headers, "/api/capture", "secret"));
    }
}
