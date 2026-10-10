//! Privacy policy article ids (copy lives in FE i18n / PRIVACY.md).

pub const PRIVACY_ARTICLE_IDS: &[&str] = &[
    "localFirst",
    "storedData",
    "noCollection",
    "optionalNetwork",
    "mcp",
    "capture",
    "yourControl",
    "children",
    "changes",
    "contact",
];

pub const PRIVACY_EFFECTIVE_DATE: &str = "2026-09-19";

pub fn privacy_article_ids() -> Vec<String> {
    PRIVACY_ARTICLE_IDS
        .iter()
        .map(|id| (*id).to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn articles_non_empty() {
        assert_eq!(PRIVACY_ARTICLE_IDS.len(), 10);
        assert_eq!(PRIVACY_EFFECTIVE_DATE, "2026-09-19");
    }
}
