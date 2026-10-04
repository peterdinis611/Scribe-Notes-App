//! Offline PII / secret scan (Rust fallback when Python NLP is off).

use regex::Regex;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::OnceLock;

use super::types::{NlpPiiFinding, NlpPiiReport};

struct Pattern {
    kind: &'static str,
    label: &'static str,
    re: Regex,
}

fn patterns() -> &'static [Pattern] {
    static PATTERNS: OnceLock<Vec<Pattern>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        vec![
            Pattern {
                kind: "email",
                label: "Email address",
                re: Regex::new(r"(?i)\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
                    .expect("email"),
            },
            Pattern {
                kind: "phone",
                label: "Phone number",
                re: Regex::new(
                    r"(?i)(?:\+\d{1,3}[\s.\-]?)?(?:\(?\d{2,4}\)?[\s.\-]?)?\d{3}[\s.\-]?\d{3,4}",
                )
                .expect("phone"),
            },
            Pattern {
                kind: "iban",
                label: "IBAN / bank account",
                re: Regex::new(r"\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}\b").expect("iban"),
            },
            Pattern {
                kind: "credit_card",
                label: "Possible card number",
                re: Regex::new(r"\b(?:\d[ -]*?){13,19}\b").expect("card"),
            },
            Pattern {
                kind: "ssn_sk",
                label: "Possible national ID / birth number",
                re: Regex::new(r"\b\d{6}/?\d{3,4}\b").expect("ssn"),
            },
            Pattern {
                kind: "api_key",
                label: "API key / secret-looking token",
                re: Regex::new(r"(?i)\b(?:sk|pk|api|token|secret|key)[-_]?[A-Za-z0-9]{16,}\b")
                    .expect("api"),
            },
            Pattern {
                kind: "aws_key",
                label: "AWS access key id",
                re: Regex::new(r"\bAKIA[0-9A-Z]{16}\b").expect("aws"),
            },
            Pattern {
                kind: "private_key",
                label: "Private key block",
                re: Regex::new(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")
                    .expect("pkey"),
            },
            Pattern {
                kind: "ip_address",
                label: "IPv4 address",
                re: Regex::new(
                    r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b",
                )
                .expect("ip"),
            },
        ]
    })
}

fn luhn_ok(digits: &str) -> bool {
    let nums: Vec<u32> = digits
        .chars()
        .filter_map(|c| c.to_digit(10))
        .collect();
    if !(13..=19).contains(&nums.len()) {
        return false;
    }
    let mut checksum = 0u32;
    let parity = nums.len() % 2;
    for (i, mut n) in nums.into_iter().enumerate() {
        if i % 2 == parity {
            n *= 2;
            if n > 9 {
                n -= 9;
            }
        }
        checksum += n;
    }
    checksum % 10 == 0
}

fn redact(value: &str) -> String {
    if value.len() <= 6 {
        return "*".repeat(value.len());
    }
    let mid = (value.len() - 4).min(12);
    format!("{}{}{}", &value[..2], "*".repeat(mid), &value[value.len() - 2..])
}

/// Scan text for PII / secrets. Always available offline.
pub fn detect_pii(text: &str, limit: usize) -> NlpPiiReport {
    let limit = limit.clamp(1, 100);
    let source = text;
    let mut findings = Vec::new();

    'outer: for pattern in patterns() {
        for caps in pattern.re.find_iter(source) {
            let value = caps.as_str();
            if pattern.kind == "credit_card" {
                let digits: String = value.chars().filter(|c| c.is_ascii_digit()).collect();
                if !luhn_ok(&digits) {
                    continue;
                }
            }
            if pattern.kind == "phone" {
                let digits: String = value.chars().filter(|c| c.is_ascii_digit()).collect();
                if !(9..=15).contains(&digits.len()) {
                    continue;
                }
            }
            findings.push(NlpPiiFinding {
                kind: pattern.kind.to_string(),
                label: pattern.label.to_string(),
                matched: redact(value),
                start: caps.start() as i64,
                end: caps.end() as i64,
            });
            if findings.len() >= limit {
                break 'outer;
            }
        }
    }

    let mut by_kind = BTreeMap::new();
    for item in &findings {
        *by_kind.entry(item.kind.clone()).or_insert(0) += 1;
    }

    let high = ["credit_card", "iban", "api_key", "aws_key", "private_key", "ssn_sk"];
    let risk = if findings.is_empty() {
        "none"
    } else if findings.iter().any(|f| high.contains(&f.kind.as_str())) {
        "high"
    } else {
        "medium"
    };

    NlpPiiReport {
        count: findings.len() as i64,
        findings,
        by_kind,
        risk: risk.to_string(),
        safe_to_share: risk == "none",
        source: "rust".to_string(),
    }
}

pub fn detect_pii_value(text: &str, limit: usize) -> Value {
    serde_json::to_value(detect_pii(text, limit)).unwrap_or_else(|_| json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_email_and_redacts() {
        let report = detect_pii("Mail writer@example.com please", 10);
        assert_eq!(report.count, 1);
        assert_eq!(report.risk, "medium");
        assert!(!report.safe_to_share);
        assert!(!report.findings[0].matched.contains("writer@example.com"));
    }

    #[test]
    fn api_key_is_high_risk() {
        let report = detect_pii("token sk-abcdefghijklmnopqrstuvwxyz012345", 10);
        assert_eq!(report.risk, "high");
        assert!(report.by_kind.contains_key("api_key"));
    }
}
