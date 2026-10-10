use std::collections::HashMap;

pub type StringMap = HashMap<String, String>;

pub fn t(strings: &StringMap, key: &str) -> String {
    strings
        .get(key)
        .cloned()
        .unwrap_or_else(|| key.to_string())
}

