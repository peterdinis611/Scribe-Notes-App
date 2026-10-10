//! Code language aliases / pinned ids (hljs list stays FE-side).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodeLanguage {
    pub id: String,
    pub label: String,
}

pub const PINNED_LANGUAGE_IDS: &[&str] = &[
    "plaintext", "javascript", "typescript", "python", "rust", "go", "bash", "json", "html",
    "css", "sql", "markdown", "yaml", "java", "kotlin", "swift", "c", "cpp", "csharp", "php",
    "ruby", "dockerfile", "xml", "scss", "graphql", "lua", "r", "dart", "scala", "powershell",
    "wasm",
];

fn aliases() -> HashMap<&'static str, &'static str> {
    HashMap::from([
        ("html", "xml"),
        ("htm", "xml"),
        ("sh", "bash"),
        ("shell", "bash"),
        ("zsh", "bash"),
        ("fish", "bash"),
        ("js", "javascript"),
        ("jsx", "javascript"),
        ("mjs", "javascript"),
        ("cjs", "javascript"),
        ("ts", "typescript"),
        ("tsx", "typescript"),
        ("py", "python"),
        ("rb", "ruby"),
        ("rs", "rust"),
        ("yml", "yaml"),
        ("md", "markdown"),
        ("docker", "dockerfile"),
        ("ps1", "powershell"),
        ("ps", "powershell"),
        ("cs", "csharp"),
        ("c++", "cpp"),
        ("c#", "csharp"),
        ("objc", "objectivec"),
        ("objective-c", "objectivec"),
        ("text", "plaintext"),
        ("txt", "plaintext"),
    ])
}

fn label_overrides() -> HashMap<&'static str, &'static str> {
    HashMap::from([
        ("bash", "Bash / Shell"),
        ("cpp", "C++"),
        ("csharp", "C#"),
        ("javascript", "JavaScript"),
        ("typescript", "TypeScript"),
        ("plaintext", "Plain text"),
        ("dockerfile", "Dockerfile"),
        ("markdown", "Markdown"),
        ("powershell", "PowerShell"),
        ("wasm", "WebAssembly"),
        ("xml", "XML / HTML"),
        ("yaml", "YAML"),
    ])
}

pub fn humanize_language_id(id: &str) -> String {
    if let Some(label) = label_overrides().get(id) {
        return (*label).to_string();
    }
    id.split(['-', '_'])
        .map(|part| {
            if part.len() <= 3 {
                part.to_uppercase()
            } else {
                let mut chars = part.chars();
                match chars.next() {
                    Some(c) => format!("{}{}", c.to_uppercase(), chars.as_str()),
                    None => String::new(),
                }
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn resolve_code_language_alias(language: &str) -> Option<String> {
    let normalized = language.trim().to_ascii_lowercase();
    if normalized.is_empty() || normalized == "auto" {
        return None;
    }
    Some(
        aliases()
            .get(normalized.as_str())
            .copied()
            .unwrap_or(normalized.as_str())
            .to_string(),
    )
}

pub fn pinned_language_ids() -> Vec<String> {
    PINNED_LANGUAGE_IDS.iter().map(|s| (*s).to_string()).collect()
}

/// Filter a provided language list (FE passes hljs-backed catalog).
pub fn filter_code_languages(items: &[CodeLanguage], query: &str) -> Vec<CodeLanguage> {
    let q = query.trim().to_ascii_lowercase();
    if q.is_empty() {
        return items.to_vec();
    }
    let alias_target = aliases().get(q.as_str()).map(|s| (*s).to_string());
    items
        .iter()
        .filter(|item| {
            item.id.to_ascii_lowercase().contains(&q)
                || item.label.to_ascii_lowercase().contains(&q)
                || alias_target.as_deref() == Some(item.id.as_str())
        })
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aliases_js() {
        assert_eq!(resolve_code_language_alias("js").as_deref(), Some("javascript"));
        assert_eq!(filter_code_languages(
            &[CodeLanguage { id: "javascript".into(), label: "JavaScript".into() }],
            "js"
        ).len(), 1);
    }
}
