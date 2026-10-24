//! Import programming / config source files as a TipTap `codeBlock`.

use serde_json::{json, Value};

const EMPTY_DOC_JSON: &str = r#"{"type":"doc","content":[{"type":"paragraph"}]}"#;
const MAX_SOURCE_BYTES: usize = 2 * 1024 * 1024;

/// Map a file extension (no dot) to a TipTap / highlight.js language id.
pub fn language_from_extension(ext: &str) -> Option<&'static str> {
    let ext = ext.trim().trim_start_matches('.').to_ascii_lowercase();
    Some(match ext.as_str() {
        "js" | "mjs" | "cjs" => "javascript",
        "jsx" => "javascript",
        "ts" => "typescript",
        "tsx" => "typescript",
        "py" | "pyw" | "pyi" => "python",
        "rs" => "rust",
        "go" => "go",
        "rb" | "rake" => "ruby",
        "php" => "php",
        "java" => "java",
        "kt" | "kts" => "kotlin",
        "swift" => "swift",
        "c" => "c",
        "h" | "hh" | "hpp" | "hxx" => "cpp",
        "cc" | "cpp" | "cxx" | "c++" => "cpp",
        "cs" => "csharp",
        "fs" | "fsi" | "fsx" => "fsharp",
        "m" | "mm" => "objectivec",
        "scala" | "sc" => "scala",
        "dart" => "dart",
        "lua" => "lua",
        "r" => "r",
        "pl" | "pm" => "perl",
        "pm6" | "raku" => "perl",
        "ex" | "exs" => "elixir",
        "erl" | "hrl" => "erlang",
        "hs" | "lhs" => "haskell",
        "clj" | "cljs" | "cljc" | "edn" => "clojure",
        "ml" | "mli" => "ocaml",
        "elm" => "elm",
        "nim" => "nim",
        "zig" => "zig",
        "nimble" => "nim",
        "v" => "v",
        "vue" => "vue",
        "svelte" => "svelte",
        "css" => "css",
        "scss" => "scss",
        "sass" => "scss",
        "less" => "css",
        "json" | "jsonc" | "json5" => "json",
        "jsonl" | "ndjson" => "json",
        "toml" => "toml",
        "yml" | "yaml" => "yaml",
        "xml" | "xsl" | "xsd" | "svg" => "xml",
        "sql" | "psql" | "pgsql" => "sql",
        "graphql" | "gql" => "graphql",
        "proto" => "protobuf",
        "sh" | "bash" | "zsh" | "fish" | "ksh" => "bash",
        "ps1" | "psm1" | "psd1" => "powershell",
        "bat" | "cmd" => "dos",
        "dockerfile" => "dockerfile",
        "makefile" | "mk" => "makefile",
        "cmake" => "cmake",
        "tf" | "hcl" => "terraform",
        "nix" => "nix",
        "wasm" | "wat" => "wasm",
        "ini" | "cfg" | "conf" | "env" => "ini",
        "properties" => "ini",
        "gradle" => "groovy",
        "groovy" => "groovy",
        "dartx" => "dart",
        "tex" | "latex" | "ltx" => "latex",
        "mdx" => "markdown",
        "astro" => "javascript",
        "sol" => "solidity",
        "move" => "rust",
        "wgsl" => "rust",
        "glsl" | "frag" | "vert" => "glsl",
        "diff" | "patch" => "diff",
        "log" => "plaintext",
        "txt" => "plaintext",
        _ => return None,
    })
}

/// Whether this extension is treated as a source / config file import.
pub fn is_source_extension(ext: &str) -> bool {
    language_from_extension(ext).is_some()
}

/// Build a TipTap doc with a single fenced code block.
pub fn source_text_to_tiptap(code: &str, language: &str) -> String {
    let lang = language.trim();
    let language_attr = if lang.is_empty() || lang.eq_ignore_ascii_case("auto") {
        Value::Null
    } else {
        json!(lang)
    };
    let content = if code.is_empty() {
        Vec::<Value>::new()
    } else {
        vec![json!({ "type": "text", "text": code })]
    };
    let doc = json!({
        "type": "doc",
        "content": [
            {
                "type": "codeBlock",
                "attrs": { "language": language_attr },
                "content": content,
            },
            { "type": "paragraph" }
        ]
    });
    serde_json::to_string(&doc).unwrap_or_else(|_| EMPTY_DOC_JSON.to_string())
}

pub fn source_bytes_to_tiptap(bytes: &[u8], language: &str) -> Result<String, String> {
    if bytes.len() > MAX_SOURCE_BYTES {
        return Err(format!(
            "Source file exceeds {} MB limit",
            MAX_SOURCE_BYTES / (1024 * 1024)
        ));
    }
    let text = decode_text(bytes)?;
    Ok(source_text_to_tiptap(&text, language))
}

/// Import by path extension. Returns `None` when the extension is not a known source type.
pub fn source_path_to_tiptap(path: &str, bytes: &[u8]) -> Result<Option<String>, String> {
    let ext = path
        .rsplit(['/', '\\'])
        .next()
        .and_then(|name| name.rsplit_once('.'))
        .map(|(_, ext)| ext)
        .unwrap_or("");
    // Special filenames without a useful last segment.
    let file_name = path
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    let language = if file_name == "dockerfile" || file_name.starts_with("dockerfile.") {
        Some("dockerfile")
    } else if file_name == "makefile" || file_name == "gnumakefile" {
        Some("makefile")
    } else if file_name == "cmakelists.txt" {
        Some("cmake")
    } else {
        language_from_extension(ext)
    };
    let Some(language) = language else {
        return Ok(None);
    };
    Ok(Some(source_bytes_to_tiptap(bytes, language)?))
}

fn decode_text(bytes: &[u8]) -> Result<String, String> {
    let trimmed = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &bytes[3..]
    } else {
        bytes
    };
    // Reject obvious binary (NUL in the first 8 KiB).
    let probe = &trimmed[..trimmed.len().min(8 * 1024)];
    if probe.contains(&0) {
        return Err("File looks binary — not imported as source text".into());
    }
    Ok(String::from_utf8_lossy(trimmed).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_common_extensions() {
        assert_eq!(language_from_extension("rs"), Some("rust"));
        assert_eq!(language_from_extension("tsx"), Some("typescript"));
        assert_eq!(language_from_extension("py"), Some("python"));
        assert_eq!(language_from_extension("json"), Some("json"));
        assert_eq!(language_from_extension("yml"), Some("yaml"));
        assert!(language_from_extension("png").is_none());
    }

    #[test]
    fn wraps_as_code_block() {
        let json = source_text_to_tiptap("fn main() {}", "rust");
        let doc: Value = serde_json::from_str(&json).unwrap();
        assert_eq!(doc["content"][0]["type"], "codeBlock");
        assert_eq!(doc["content"][0]["attrs"]["language"], "rust");
        assert_eq!(doc["content"][0]["content"][0]["text"], "fn main() {}");
    }

    #[test]
    fn dockerfile_by_name() {
        let out = source_path_to_tiptap("Dockerfile", b"FROM alpine\n")
            .unwrap()
            .unwrap();
        assert!(out.contains("dockerfile"));
        assert!(out.contains("FROM alpine"));
    }
}
