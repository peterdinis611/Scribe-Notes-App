from __future__ import annotations

import re
from typing import Any


def rewrite_selection(
    text: str,
    mode: str = "rephrase_professional",
    custom_instruction: str | None = None,
) -> dict[str, Any]:
    text = text.strip()
    if not text:
        return {"output": "", "mode": mode, "original": text}

    mode_lower = mode.lower().strip()

    if mode_lower == "rephrase_professional":
        output = _rephrase_professional(text)
    elif mode_lower == "summarize_bullets":
        output = _summarize_bullets(text)
    elif mode_lower == "translate_sk":
        output = _translate_mock_sk(text)
    elif mode_lower == "translate_en":
        output = _translate_mock_en(text)
    elif mode_lower == "custom_prompt" and custom_instruction:
        output = _apply_custom_instruction(text, custom_instruction)
    else:
        output = text

    return {
        "output": output,
        "mode": mode,
        "original": text,
    }


def _rephrase_professional(text: str) -> str:
    # Polish text structure, clean colloquial contractions or phrasing
    replacements = [
        (r"\bimo\b", "in my estimation"),
        (r"\basap\b", "at your earliest convenience"),
        (r"\bbtw\b", "incidentally"),
        (r"\bthx\b|\bthanks\b", "thank you"),
        (r"\bpls\b|\bplease\b", "kindly"),
        (r"\bchcem\b", "rád by som"),
        (r"\bdaj vedieť\b", "prosím informujte ma"),
    ]
    result = text
    for pat, rep in replacements:
        result = re.sub(pat, rep, result, flags=re.IGNORECASE)

    # Ensure clean sentence capitalization
    if result and result[0].islower():
        result = result[0].upper() + result[1:]

    return result


def _summarize_bullets(text: str) -> str:
    sentences = [s.strip() for s in re.split(r"[.!?\n]+", text) if len(s.strip()) > 3]
    if not sentences:
        return f"- {text}"
    return "\n".join(f"- {s}" for s in sentences)


def _translate_mock_sk(text: str) -> str:
    # Basic local dictionary replacements for quick UI demonstration
    dict_en_sk = {
        "hello": "Ahoj",
        "welcome": "Vitajte",
        "meeting": "Stretnutie",
        "notes": "Poznámky",
        "document": "Dokument",
        "project": "Projekt",
        "report": "Správa",
        "task": "Úloha",
        "summary": "Zhrnutie",
    }
    result = text
    for en, sk in dict_en_sk.items():
        result = re.sub(rf"\b{en}\b", sk, result, flags=re.IGNORECASE)
    return result


def _translate_mock_en(text: str) -> str:
    dict_sk_en = {
        "ahoj": "Hello",
        "vitajte": "Welcome",
        "stretnutie": "Meeting",
        "poznámky": "Notes",
        "dokument": "Document",
        "projekt": "Project",
        "správa": "Report",
        "úloha": "Task",
        "zhrnutie": "Summary",
    }
    result = text
    for sk, en in dict_sk_en.items():
        result = re.sub(rf"\b{sk}\b", en, result, flags=re.IGNORECASE)
    return result


def _apply_custom_instruction(text: str, instruction: str) -> str:
    inst_lower = instruction.lower()
    if "skráť" in inst_lower or "shorten" in inst_lower:
        words = text.split()
        return " ".join(words[: len(words) // 2]) if len(words) > 4 else text
    if "veľké" in inst_lower or "uppercase" in inst_lower:
        return text.upper()
    return f"{text} ({instruction})"
