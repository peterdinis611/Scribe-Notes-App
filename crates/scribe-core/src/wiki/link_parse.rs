//! Obsidian-style `[[Title#Heading|Alias]]` parse / format helpers.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedWikiLink {
    pub title: String,
    pub heading: Option<String>,
    pub alias: Option<String>,
    pub display_label: String,
}

/// Parse wiki link inner text (without brackets).
pub fn parse_wiki_link_raw(raw: &str) -> ParsedWikiLink {
    let trimmed = raw.trim();
    let (main, alias) = if let Some(pipe_idx) = trimmed.rfind('|') {
        let alias = trimmed[pipe_idx + 1..].trim();
        let alias = if alias.is_empty() {
            None
        } else {
            Some(alias.to_string())
        };
        (trimmed[..pipe_idx].trim(), alias)
    } else {
        (trimmed, None)
    };

    let (title, heading) = if let Some(hash_idx) = main.find('#') {
        let title = main[..hash_idx].trim().to_string();
        let heading = main[hash_idx + 1..].trim();
        let heading = if heading.is_empty() {
            None
        } else {
            Some(heading.to_string())
        };
        (title, heading)
    } else {
        (main.to_string(), None)
    };

    let display_label = alias.clone().unwrap_or_else(|| {
        if let Some(ref h) = heading {
            format!("{title}#{h}")
        } else {
            title.clone()
        }
    });

    ParsedWikiLink {
        title,
        heading,
        alias,
        display_label,
    }
}

pub fn format_wiki_link_render_text(label: &str, link_title: Option<&str>, heading: Option<&str>) -> String {
    let link_title = link_title
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| label.trim());
    let heading = heading.map(str::trim).filter(|s| !s.is_empty());
    let default_display = match heading {
        Some(h) => format!("{link_title}#{h}"),
        None => link_title.to_string(),
    };
    if label != default_display {
        let main = match heading {
            Some(h) => format!("{link_title}#{h}"),
            None => link_title.to_string(),
        };
        return format!("[[{main}|{label}]]");
    }
    if let Some(h) = heading {
        return format!("[[{link_title}#{h}]]");
    }
    format!("[[{link_title}]]")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_title_heading_alias() {
        let p = parse_wiki_link_raw("Note#Section|Shown");
        assert_eq!(p.title, "Note");
        assert_eq!(p.heading.as_deref(), Some("Section"));
        assert_eq!(p.alias.as_deref(), Some("Shown"));
        assert_eq!(p.display_label, "Shown");
        assert_eq!(
            format_wiki_link_render_text("Shown", Some("Note"), Some("Section")),
            "[[Note#Section|Shown]]"
        );
    }
}
