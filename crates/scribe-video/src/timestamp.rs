//! Start-offset parsing from provider URLs (`t=`, `start=`, `#t=`).

use crate::url::{parse_host_path, query_param};

/// Parse a YouTube-style duration token (`90`, `1h2m3s`, `2m`, `45s`) into seconds.
pub fn parse_duration_token(raw: &str) -> Option<u64> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    if s.chars().all(|c| c.is_ascii_digit()) {
        return s.parse().ok();
    }
    let lower = s.to_ascii_lowercase();
    let mut total = 0u64;
    let mut num = 0u64;
    let mut saw_unit = false;
    for ch in lower.chars() {
        if ch.is_ascii_digit() {
            num = num.saturating_mul(10).saturating_add((ch as u64) - ('0' as u64));
            continue;
        }
        let mult = match ch {
            'h' => 3600,
            'm' => 60,
            's' => 1,
            _ => return None,
        };
        total = total.saturating_add(num.saturating_mul(mult));
        num = 0;
        saw_unit = true;
    }
    if !saw_unit {
        return None;
    }
    // Trailing number without unit is ignored (invalid).
    if num != 0 {
        return None;
    }
    Some(total)
}

/// Extract playback start offset in seconds when present on the URL.
pub fn extract_start_seconds(src: &str) -> Option<u64> {
    let trimmed = src.trim();
    if let Some((_host, _path, query)) = parse_host_path(trimmed) {
        for key in ["t", "start", "time_continue"] {
            if let Some(v) = query_param(&query, key) {
                if let Some(secs) = parse_duration_token(&v) {
                    return Some(secs);
                }
            }
        }
    }
    // Fragment forms: `#t=90`, `#t=1m30s`
    if let Some(hash) = trimmed.split_once('#').map(|(_, h)| h) {
        let frag = hash.split('&').next().unwrap_or(hash);
        if let Some(v) = frag.strip_prefix("t=") {
            return parse_duration_token(v);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tokens() {
        assert_eq!(parse_duration_token("90"), Some(90));
        assert_eq!(parse_duration_token("1h2m3s"), Some(3723));
        assert_eq!(parse_duration_token("2m"), Some(120));
        assert_eq!(parse_duration_token("45s"), Some(45));
        assert_eq!(parse_duration_token(""), None);
    }

    #[test]
    fn extracts_from_url() {
        assert_eq!(
            extract_start_seconds("https://www.youtube.com/watch?v=abc&t=90"),
            Some(90)
        );
        assert_eq!(
            extract_start_seconds("https://youtu.be/abc?t=1m30s"),
            Some(90)
        );
        assert_eq!(
            extract_start_seconds("https://vimeo.com/123#t=45s"),
            Some(45)
        );
    }
}
