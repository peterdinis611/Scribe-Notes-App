//! Built-in template category ids.

pub const BUILT_IN_TEMPLATE_CATEGORIES: &[&str] = &["general", "business", "personal", "creative"];

pub const NEW_CATEGORY_SELECT_VALUE: &str = "__new_category__";

pub fn built_in_template_categories() -> Vec<String> {
    BUILT_IN_TEMPLATE_CATEGORIES
        .iter()
        .map(|s| (*s).to_string())
        .collect()
}

pub fn is_built_in_category(id: &str) -> bool {
    BUILT_IN_TEMPLATE_CATEGORIES.contains(&id)
}

pub fn is_custom_category_id(id: &str) -> bool {
    id.starts_with("cat-")
}

pub fn is_valid_category_id(id: &str) -> bool {
    is_built_in_category(id) || is_custom_category_id(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates() {
        assert!(is_valid_category_id("general"));
        assert!(is_valid_category_id("cat-abc"));
        assert!(!is_valid_category_id("nope"));
    }
}
