//! Shared text folding for SK/CS + EN intent / synonym matching.

/// Strip common Latin-extended diacritics used in Slovak/Czech.
pub fn strip_diacritic(ch: char) -> char {
    match ch {
        'á' | 'ä' | 'à' | 'â' | 'ã' => 'a',
        'é' | 'ě' | 'è' | 'ê' => 'e',
        'í' | 'ì' | 'î' => 'i',
        'ó' | 'ô' | 'ö' | 'ò' | 'õ' => 'o',
        'ú' | 'ů' | 'ü' | 'ù' | 'û' => 'u',
        'ý' | 'ỳ' => 'y',
        'č' | 'ć' => 'c',
        'ď' => 'd',
        'ň' | 'ń' => 'n',
        'ř' | 'ŕ' => 'r',
        'š' | 'ś' => 's',
        'ť' => 't',
        'ž' | 'ź' => 'z',
        'ľ' | 'ĺ' => 'l',
        other => other,
    }
}

/// Lowercase + strip diacritics (parity with Python `fold_diacritics`).
pub fn fold_text(input: &str) -> String {
    input
        .trim()
        .chars()
        .map(|ch| strip_diacritic(ch.to_lowercase().next().unwrap_or(ch)))
        .collect()
}

/// Collapse whitespace.
pub fn collapse_ws(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_slovak() {
        assert_eq!(fold_text("Úloha"), "uloha");
        assert_eq!(fold_text("  Termín  "), "termin");
    }
}
