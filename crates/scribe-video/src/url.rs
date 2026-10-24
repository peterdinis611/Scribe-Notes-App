//! Lightweight URL host/path/query parsing (no network).

/// Returns `(host without www., path, query)` for `http(s)` URLs.
pub fn parse_host_path(url: &str) -> Option<(String, String, String)> {
    let trimmed = url.trim();
    let without_scheme = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))?;
    let (authority, rest) = without_scheme
        .split_once('/')
        .map(|(a, r)| (a, format!("/{r}")))
        .unwrap_or((without_scheme, String::new()));
    let host = authority
        .split('@')
        .next_back()
        .unwrap_or(authority)
        .split(':')
        .next()
        .unwrap_or(authority)
        .to_ascii_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host).to_string();
    let (path, query) = rest
        .split_once('?')
        .map(|(p, q)| (p.to_string(), q.split('#').next().unwrap_or(q).to_string()))
        .unwrap_or_else(|| {
            let p = rest.split('#').next().unwrap_or(&rest).to_string();
            (p, String::new())
        });
    Some((host, path, query))
}

pub fn query_param(query: &str, key: &str) -> Option<String> {
    for part in query.split('&') {
        let mut kv = part.splitn(2, '=');
        let k = kv.next()?;
        if k == key {
            return Some(kv.next().unwrap_or("").to_string());
        }
    }
    None
}

pub fn path_segments(path: &str) -> Vec<&str> {
    path.split('/').filter(|p| !p.is_empty()).collect()
}
