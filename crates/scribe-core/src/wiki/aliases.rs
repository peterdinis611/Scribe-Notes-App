//! Document title aliases via `alias:short-name` tags.

/// Aliases live as tags: `alias:short-name` (multiple allowed).
pub fn parse_aliases(tags: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for raw in tags {
        let tag = raw.trim();
        let lower = tag.to_ascii_lowercase();
        let Some(rest) = lower.strip_prefix("alias:") else {
            continue;
        };
        // Preserve original casing after the prefix.
        let value = tag[tag.len() - rest.len()..].trim();
        if !value.is_empty() {
            out.push(value.to_string());
        }
    }
    out
}

pub fn add_alias_tag(tags: &[String], alias: &str) -> Vec<String> {
    let value = alias.trim();
    if value.is_empty() {
        return tags.to_vec();
    }
    let needle = format!("alias:{value}");
    let mut next = tags.to_vec();
    if next
        .iter()
        .any(|tag| tag.eq_ignore_ascii_case(&needle))
    {
        return next;
    }
    next.push(needle);
    next
}

pub fn document_matches_title_or_alias(title: &str, tags: &[String], query: &str) -> bool {
    let q = query.trim().to_ascii_lowercase();
    if q.is_empty() {
        return false;
    }
    if title.trim().to_ascii_lowercase() == q {
        return true;
    }
    parse_aliases(tags)
        .iter()
        .any(|alias| alias.to_ascii_lowercase() == q)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_and_match() {
        let tags = vec!["alias:Ship".into(), "project:x".into()];
        assert_eq!(parse_aliases(&tags), vec!["Ship"]);
        assert!(document_matches_title_or_alias("Plan", &tags, "ship"));
        assert!(document_matches_title_or_alias("Plan", &tags, "plan"));
        let next = add_alias_tag(&tags, "Ship");
        assert_eq!(next.len(), 2);
        let next = add_alias_tag(&tags, "Launch");
        assert_eq!(next.len(), 3);
    }
}
