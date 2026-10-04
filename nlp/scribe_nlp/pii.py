"""Lightweight local PII / secret scan before share or export."""

from __future__ import annotations

import re
from typing import Any

_PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    (
        "email",
        re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),
        "Email address",
    ),
    (
        "phone",
        re.compile(
            r"(?<!\w)(?:\+?\d{1,3}[\s.\-]?)?(?:\(?\d{2,4}\)?[\s.\-]?)?\d{3}[\s.\-]?\d{3,4}(?!\w)"
        ),
        "Phone number",
    ),
    (
        "iban",
        re.compile(r"\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}\b"),
        "IBAN / bank account",
    ),
    (
        "credit_card",
        re.compile(r"\b(?:\d[ -]*?){13,19}\b"),
        "Possible card number",
    ),
    (
        "ssn_sk",
        re.compile(r"\b\d{6}/?\d{3,4}\b"),
        "Possible national ID / birth number",
    ),
    (
        "api_key",
        re.compile(
            r"\b(?:sk|pk|api|token|secret|key)[-_]?[A-Za-z0-9]{16,}\b",
            re.IGNORECASE,
        ),
        "API key / secret-looking token",
    ),
    (
        "aws_key",
        re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
        "AWS access key id",
    ),
    (
        "private_key",
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
        "Private key block",
    ),
    (
        "ip_address",
        re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b"),
        "IPv4 address",
    ),
]


def _luhn_ok(digits: str) -> bool:
    nums = [int(c) for c in digits if c.isdigit()]
    if len(nums) < 13 or len(nums) > 19:
        return False
    checksum = 0
    parity = len(nums) % 2
    for i, n in enumerate(nums):
        if i % 2 == parity:
            n *= 2
            if n > 9:
                n -= 9
        checksum += n
    return checksum % 10 == 0


def detect_pii(text: str, *, limit: int = 40) -> dict[str, Any]:
    source = text or ""
    limit = max(1, min(int(limit or 40), 100))

    findings: list[dict[str, Any]] = []
    for kind, pattern, label in _PATTERNS:
        for match in pattern.finditer(source):
            value = match.group(0)
            if kind == "credit_card":
                digits = re.sub(r"\D", "", value)
                if not _luhn_ok(digits):
                    continue
            if kind == "phone":
                digits = re.sub(r"\D", "", value)
                if len(digits) < 9 or len(digits) > 15:
                    continue
            # Redact middle for safer return payloads
            if len(value) <= 6:
                redacted = "*" * len(value)
            else:
                redacted = value[:2] + ("*" * min(12, len(value) - 4)) + value[-2:]
            findings.append(
                {
                    "kind": kind,
                    "label": label,
                    "match": redacted,
                    "start": match.start(),
                    "end": match.end(),
                }
            )
            if len(findings) >= limit:
                break
        if len(findings) >= limit:
            break

    by_kind: dict[str, int] = {}
    for item in findings:
        by_kind[item["kind"]] = by_kind.get(item["kind"], 0) + 1

    risk = "none"
    if findings:
        high = {"credit_card", "iban", "api_key", "aws_key", "private_key", "ssn_sk"}
        risk = "high" if any(item["kind"] in high for item in findings) else "medium"

    return {
        "findings": findings[:limit],
        "count": len(findings[:limit]),
        "byKind": by_kind,
        "risk": risk,
        "safeToShare": risk == "none",
        "source": "python",
    }
