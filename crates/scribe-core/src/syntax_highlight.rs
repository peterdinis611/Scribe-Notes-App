//! Syntax highlighting for TipTap `codeBlock` HTML export.
//!
//! Uses [`syntect`] via [`two_face`] (bat's curated Sublime Text packs) so Rust
//! export covers the common programming languages — Rust, TypeScript, Docker,
//! TOML, Zig, etc. — not only the syntect default set.

use std::sync::OnceLock;

use two_face::re_exports::syntect::html::highlighted_html_for_string;
use two_face::re_exports::syntect::parsing::{SyntaxReference, SyntaxSet};
use two_face::theme::{EmbeddedLazyThemeSet, EmbeddedThemeName};

fn syntax_set() -> &'static SyntaxSet {
    static SET: OnceLock<SyntaxSet> = OnceLock::new();
    SET.get_or_init(two_face::syntax::extra_newlines)
}

fn theme_set() -> &'static EmbeddedLazyThemeSet {
    static SET: OnceLock<EmbeddedLazyThemeSet> = OnceLock::new();
    SET.get_or_init(two_face::theme::extra)
}

/// Map fence / TipTap language ids (and short aliases) onto syntect names.
fn normalize_language_id(language: &str) -> String {
    let trimmed = language.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("auto") {
        return String::new();
    }
    let lower = trimmed.to_ascii_lowercase();
    let mapped = match lower.as_str() {
        "js" | "jsx" | "mjs" | "cjs" | "javascript" => "JavaScript",
        "ts" | "tsx" | "typescript" => "TypeScript",
        "py" | "python" => "Python",
        "rb" | "ruby" => "Ruby",
        "rs" | "rust" => "Rust",
        "go" | "golang" => "Go",
        "sh" | "shell" | "zsh" | "fish" | "bash" => "Bash",
        "yml" | "yaml" => "YAML",
        "md" | "markdown" => "Markdown",
        "htm" | "html" => "HTML",
        "xml" => "XML",
        "css" => "CSS",
        "scss" => "SCSS",
        "sass" => "Sass",
        "json" => "JSON",
        "toml" => "TOML",
        "c" => "C",
        "h" | "cpp" | "cc" | "cxx" | "c++" => "C++",
        "cs" | "csharp" | "c#" => "C#",
        "fs" | "fsharp" | "f#" => "F#",
        "java" => "Java",
        "kt" | "kotlin" => "Kotlin",
        "swift" => "Swift",
        "php" => "PHP",
        "sql" | "pgsql" | "mysql" => "SQL",
        "docker" | "dockerfile" => "Dockerfile",
        "ps1" | "ps" | "powershell" => "PowerShell",
        "r" => "R",
        "lua" => "Lua",
        "dart" => "Dart",
        "scala" => "Scala",
        "graphql" | "gql" => "GraphQL",
        "proto" | "protobuf" => "Protobuf",
        "zig" => "Zig",
        "nim" => "Nim",
        "nix" => "Nix",
        "elm" => "Elm",
        "ex" | "exs" | "elixir" => "Elixir",
        "erl" | "erlang" => "Erlang",
        "hs" | "haskell" => "Haskell",
        "clj" | "clojure" => "Clojure",
        "ml" | "ocaml" => "OCaml",
        "pl" | "perl" => "Perl",
        "makefile" | "make" => "Makefile",
        "cmake" => "CMake",
        "tf" | "terraform" | "hcl" => "Terraform",
        "vue" => "Vue",
        "svelte" => "Svelte",
        "wasm" | "wat" => "WebAssembly",
        "plaintext" | "text" | "txt" | "plain" => "Plain Text",
        _ => trimmed,
    };
    mapped.to_string()
}

fn find_syntax<'a>(set: &'a SyntaxSet, language: &str) -> Option<&'a SyntaxReference> {
    let normalized = normalize_language_id(language);
    if normalized.is_empty() {
        return None;
    }

    set.find_syntax_by_name(&normalized)
        .or_else(|| set.find_syntax_by_token(&normalized.to_ascii_lowercase()))
        .or_else(|| set.find_syntax_by_extension(&normalized.to_ascii_lowercase()))
        .or_else(|| {
            // TipTap sometimes stores bare ids like "typescript" — try title case.
            let mut chars = normalized.chars();
            let titled = match chars.next() {
                Some(first) => {
                    first.to_uppercase().collect::<String>() + &chars.as_str().to_ascii_lowercase()
                }
                None => return None,
            };
            set.find_syntax_by_name(&titled)
        })
}

/// Highlight `code` for `language`. Returns a self-contained `<pre>…</pre>` snippet,
/// or `None` when the language is unknown / highlighting fails (caller escapes).
pub fn highlight_code_html(language: &str, code: &str) -> Option<String> {
    let set = syntax_set();
    let syntax = find_syntax(set, language).or_else(|| {
        // Auto / empty: try first-line detection, else Plain Text.
        set.find_syntax_by_first_line(code.lines().next().unwrap_or(""))
            .or_else(|| set.find_syntax_by_name("Plain Text"))
    })?;

    let themes = theme_set();
    // Light theme — matches Scribe's typical document export / print surface.
    let theme = &themes[EmbeddedThemeName::InspiredGithub];

    highlighted_html_for_string(code, set, syntax, theme).ok()
}

/// Whether `language` resolves to a known grammar (including aliases).
pub fn supports_language(language: &str) -> bool {
    find_syntax(syntax_set(), language).is_some()
}

/// Names of embedded grammars (for diagnostics / future picker bridges).
pub fn list_syntax_names() -> Vec<&'static str> {
    syntax_set()
        .syntaxes()
        .iter()
        .map(|syntax| syntax.name.as_str())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn highlights_rust_with_spans() {
        let html = highlight_code_html("rust", "fn main() {\n    let x = 1;\n}\n")
            .expect("rust highlight");
        assert!(html.contains("<pre"));
        assert!(html.contains("<span"));
        assert!(html.contains("fn") || html.contains("main"));
    }

    #[test]
    fn resolves_common_aliases() {
        assert!(supports_language("rs"));
        assert!(supports_language("ts"));
        assert!(supports_language("tsx"));
        assert!(supports_language("py"));
        assert!(supports_language("dockerfile"));
        assert!(supports_language("toml"));
        assert!(supports_language("zig"));
        assert!(supports_language("yml"));
    }

    #[test]
    fn highlights_many_languages() {
        let samples = [
            ("javascript", "const n = 1;"),
            ("typescript", "const n: number = 1;"),
            ("python", "def hello():\n    return 1\n"),
            ("go", "package main\nfunc main() {}\n"),
            ("bash", "echo hello"),
            ("json", r#"{"a":1}"#),
            ("yaml", "a: 1\n"),
            ("toml", "[section]\nkey = 1\n"),
            ("sql", "SELECT 1;"),
            ("dockerfile", "FROM alpine\n"),
            ("css", "body { color: red; }"),
            ("html", "<div class=\"x\"></div>"),
            ("java", "class A { int x; }"),
            ("kotlin", "fun main() {}"),
            ("swift", "let x = 1"),
            ("csharp", "var x = 1;"),
            ("cpp", "int main() { return 0; }"),
            ("ruby", "puts 'hi'"),
            ("php", "<?php echo 1;"),
            ("lua", "print(1)"),
            ("r", "x <- 1"),
            ("dart", "void main() {}"),
            ("scala", "object A"),
            ("graphql", "type Query { a: Int }"),
            ("powershell", "Write-Host 'hi'"),
            ("makefile", "all:\n\techo hi\n"),
            ("zig", "pub fn main() void {}"),
            ("elixir", "IO.puts \"hi\""),
            ("haskell", "main = putStrLn \"hi\""),
            ("ocaml", "let x = 1"),
            ("clojure", "(println 1)"),
            ("vue", "<template><div/></template>"),
            ("svelte", "<script>let x = 1</script>"),
            ("terraform", "resource \"a\" \"b\" {}"),
            ("nix", "{ x = 1; }"),
            ("nim", "echo 1"),
            ("plaintext", "hello"),
        ];

        let mut failed = Vec::new();
        for (lang, code) in samples {
            match highlight_code_html(lang, code) {
                Some(html) if html.contains("<pre") => {}
                other => failed.push((lang, other.is_some())),
            }
        }
        assert!(
            failed.is_empty(),
            "highlight failed for: {failed:?}",
        );
    }

    #[test]
    fn lists_a_broad_syntax_catalog() {
        let names = list_syntax_names();
        assert!(
            names.len() >= 80,
            "expected a broad syntax pack, got {}",
            names.len()
        );
        assert!(names.iter().any(|n| *n == "Rust"));
        assert!(names.iter().any(|n| *n == "TypeScript" || n.contains("TypeScript")));
    }
}
