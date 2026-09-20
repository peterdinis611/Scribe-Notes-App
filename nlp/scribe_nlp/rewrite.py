from __future__ import annotations

import re
from typing import Any


def rewrite_selection(
    text: str,
    mode: str = "rephrase_professional",
    custom_instruction: str | None = None,
) -> dict[str, Any]:
    from .extras import fix_unicode

    text = fix_unicode(text).strip()
    if not text:
        return {"output": "", "mode": mode, "original": text}

    mode_lower = mode.lower().strip()

    if mode_lower in {"rephrase_professional", "rephrase", "professional"}:
        output = _rephrase_professional(text)
    elif mode_lower in {"summarize_bullets", "bullets", "summarize"}:
        output = _summarize_bullets(text)
    elif mode_lower in {"shorten", "concise", "make_concise"}:
        output = _shorten(text)
    elif mode_lower in {"simplify", "plain"}:
        output = _simplify(text)
    elif mode_lower in {"expand_bullets", "from_bullets"}:
        output = _expand_bullets(text)
    elif mode_lower in {"translate_sk", "to_sk", "sk"}:
        output = _translate_to_sk(text)
    elif mode_lower in {"translate_en", "to_en", "en"}:
        output = _translate_to_en(text)
    elif mode_lower in {"custom_prompt", "custom"} and custom_instruction:
        output = _apply_custom_instruction(text, custom_instruction)
    else:
        output = text

    return {
        "output": output,
        "mode": mode,
        "original": text,
    }


def _rephrase_professional(text: str) -> str:
    replacements = [
        (r"\bimo\b", "in my estimation"),
        (r"\basap\b", "at your earliest convenience"),
        (r"\bbtw\b", "incidentally"),
        (r"\bthx\b|\bthanks\b", "thank you"),
        (r"\bpls\b", "kindly"),
        (r"\bplease\b", "please"),
        (r"\bgonna\b", "going to"),
        (r"\bwanna\b", "want to"),
        (r"\bchcem\b", "rád by som"),
        (r"\bdaj vedieť\b", "prosím informujte ma"),
        (r"\bsuper\b", "výborne"),
        (r"\bok\b", "v poriadku"),
        (r"\bnie je problem\b|\bnp\b", "nie je problém"),
    ]
    result = text
    for pat, rep in replacements:
        result = re.sub(pat, rep, result, flags=re.IGNORECASE)

    if result and result[0].islower():
        result = result[0].upper() + result[1:]

    return result


def _summarize_bullets(text: str) -> str:
    sentences = [s.strip() for s in re.split(r"[.!?\n]+", text) if len(s.strip()) > 3]
    if not sentences:
        return f"- {text}"
    return "\n".join(f"- {s}" for s in sentences)


def _shorten(text: str) -> str:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    if len(sentences) <= 1:
        words = text.split()
        keep = max(8, len(words) * 2 // 3)
        return " ".join(words[:keep]).rstrip(",;") + ("…" if len(words) > keep else "")
    keep_n = max(1, (len(sentences) + 1) // 2)
    return " ".join(sentences[:keep_n])


def _simplify(text: str) -> str:
    replacements = [
        (r"\butilize\b", "use"),
        (r"\bfacilitate\b", "help"),
        (r"\bin order to\b", "to"),
        (r"\bdue to the fact that\b", "because"),
        (r"\bat this point in time\b", "now"),
        (r"\bprior to\b", "before"),
        (r"\bsubsequent to\b", "after"),
        (r"\bvzhľadom na skutočnosť,?\s*že\b", "pretože"),
        (r"\bza účelom\b", "na"),
        (r"\bv rámci\b", "v"),
    ]
    result = text
    for pat, rep in replacements:
        result = re.sub(pat, rep, result, flags=re.IGNORECASE)
    # Drop filler commas around "however," / "moreover,"
    result = re.sub(r"\b(however|moreover|furthermore|additionally),?\s+", "", result, flags=re.IGNORECASE)
    return result.strip()


def _expand_bullets(text: str) -> str:
    lines = [re.sub(r"^[-*•]\s*", "", line).strip() for line in text.splitlines()]
    lines = [line for line in lines if line]
    if len(lines) <= 1 and ("\n" not in text) and not re.match(r"^[-*•]\s*", text):
        # Already prose — return lightly polished.
        return _rephrase_professional(text)
    sentences = []
    for line in lines:
        sentence = line[0].upper() + line[1:] if line else line
        if not sentence.endswith((".", "!", "?")):
            sentence = f"{sentence}."
        sentences.append(sentence)
    return " ".join(sentences)


def _translate_to_sk(text: str) -> str:
    try:
        from .argos_translate import translate_argos

        translated = translate_argos(text, source="en", target="sk")
        if translated:
            return translated
    except Exception:
        pass
    return _translate_mock_sk(text)


def _translate_to_en(text: str) -> str:
    try:
        from .argos_translate import translate_argos

        translated = translate_argos(text, source="sk", target="en")
        if translated:
            return translated
    except Exception:
        pass
    return _translate_mock_en(text)


def _translate_mock_sk(text: str) -> str:
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
        "introduction": "Úvod",
        "conclusion": "Záver",
        "please": "prosím",
        "thank you": "ďakujem",
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
        "úvod": "Introduction",
        "záver": "Conclusion",
        "prosím": "please",
        "ďakujem": "thank you",
    }
    result = text
    for sk, en in dict_sk_en.items():
        result = re.sub(rf"\b{sk}\b", en, result, flags=re.IGNORECASE)
    return result


def _apply_custom_instruction(text: str, instruction: str) -> str:
    inst_lower = instruction.lower()
    if any(token in inst_lower for token in ("skráť", "shorten", "concise", "stručne")):
        return _shorten(text)
    if any(token in inst_lower for token in ("veľké", "uppercase", "caps")):
        return text.upper()
    if any(token in inst_lower for token in ("malé", "lowercase")):
        return text.lower()
    if any(token in inst_lower for token in ("bullet", "odrážk", "zoznam")):
        return _summarize_bullets(text)
    if any(token in inst_lower for token in ("simplif", "zjednoduš", "plain")):
        return _simplify(text)
    if any(token in inst_lower for token in ("expand", "rozšír", "prose", "odsek")):
        return _expand_bullets(text)
    if any(token in inst_lower for token in ("profession", "formál", "formal")):
        return _rephrase_professional(text)
    return f"{text} ({instruction.strip()})"
