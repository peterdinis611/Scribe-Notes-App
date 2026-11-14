"""Stable system / user prompt builders (parity with Rust ``scribe-ai::prompts``)."""

from __future__ import annotations

import json
from enum import Enum
from typing import Any

DEFAULT_PASSAGE_CHAR_BUDGET = 12_000


class PromptKind(str, Enum):
    DOCUMENT_CHAT = "document_chat"
    LIBRARY_CHAT = "library_chat"
    AGENT = "agent"
    REWRITE = "rewrite"


def _locale(language: str | None) -> str:
    raw = (language or "").strip().lower().replace("_", "-")
    primary = raw.split("-", 1)[0]
    if primary in {"sk", "cs", "hu", "pl"}:
        return primary
    return "en"


def system_prompt(kind: PromptKind | str, language: str | None = None) -> str:
    locale = _locale(language)
    key = PromptKind(kind) if not isinstance(kind, PromptKind) else kind
    table: dict[tuple[PromptKind, str], str] = {
        (PromptKind.DOCUMENT_CHAT, "en"): (
            "You are Scribe's document assistant. Answer only from the provided note passages. "
            "Cite titles when you use a passage. If the note does not contain the answer, say so."
        ),
        (PromptKind.DOCUMENT_CHAT, "sk"): (
            "Si asistent poznámky v Scribe. Odpovedaj len z poskytnutých pasáží. "
            "Cituj názvy, keď ich použiješ. Ak odpoveď v poznámke nie je, povedz to."
        ),
        (PromptKind.DOCUMENT_CHAT, "cs"): (
            "Jsi asistent poznámky ve Scribe. Odpovídej jen z poskytnutých pasáží. "
            "Cituj názvy, když je použiješ. Pokud odpověď v poznámce není, řekni to."
        ),
        (PromptKind.DOCUMENT_CHAT, "hu"): (
            "Te a Scribe jegyzet-asszisztense vagy. Csak a megadott részletekből válaszolj. "
            "Ha egy részt használsz, említsd a címet. Ha a válasz nincs a jegyzetben, mondd el."
        ),
        (PromptKind.DOCUMENT_CHAT, "pl"): (
            "Jesteś asystentem notatki w Scribe. Odpowiadaj tylko na podstawie podanych fragmentów. "
            "Cytuj tytuły, gdy z nich korzystasz. Jeśli odpowiedzi nie ma w notatce, powiedz o tym."
        ),
        (PromptKind.LIBRARY_CHAT, "en"): (
            "You are Scribe's library assistant. Use the ranked passages across notes. "
            "Prefer precise citations. Do not invent documents."
        ),
        (PromptKind.LIBRARY_CHAT, "sk"): (
            "Si asistent knižnice Scribe. Použi zoradené pasáže z poznámok. "
            "Preferuj presné citácie. Nevymýšľaj dokumenty."
        ),
        (PromptKind.LIBRARY_CHAT, "cs"): (
            "Jsi asistent knihovny Scribe. Použij seřazené pasáže z poznámek. "
            "Preferuj přesné citace. Nevymýšlej dokumenty."
        ),
        (PromptKind.LIBRARY_CHAT, "hu"): (
            "Te a Scribe könyvtár-asszisztense vagy. Használd a rangsorolt jegyzetrészleteket. "
            "Pontos idézeteket részesíts előnyben. Ne találj ki dokumentumokat."
        ),
        (PromptKind.LIBRARY_CHAT, "pl"): (
            "Jesteś asystentem biblioteki Scribe. Korzystaj z uszeregowanych fragmentów notatek. "
            "Preferuj precyzyjne cytaty. Nie wymyślaj dokumentów."
        ),
        (PromptKind.AGENT, "en"): (
            "You are Scribe's local agent planner. Propose concrete next tools and short answers. "
            "Stay within the user's library context."
        ),
        (PromptKind.AGENT, "sk"): (
            "Si lokálny agent plánovač Scribe. Navrhni konkrétne nástroje a krátke odpovede. "
            "Zostaň v kontexte knižnice používateľa."
        ),
        (PromptKind.AGENT, "cs"): (
            "Jsi lokální agent plánovač Scribe. Navrhni konkrétní nástroje a krátké odpovědi. "
            "Zůstaň v kontextu uživatelské knihovny."
        ),
        (PromptKind.AGENT, "hu"): (
            "Te a Scribe helyi ügynök-tervezője vagy. Javasolj konkrét következő eszközöket és rövid válaszokat. "
            "Maradj a felhasználó könyvtárának kontextusában."
        ),
        (PromptKind.AGENT, "pl"): (
            "Jesteś lokalnym agentem planującym Scribe. Proponuj konkretne kolejne narzędzia i krótkie odpowiedzi. "
            "Pozostań w kontekście biblioteki użytkownika."
        ),
        (PromptKind.REWRITE, "en"): (
            "You rewrite the user's note text. Preserve meaning and structure unless asked otherwise. "
            "Return only the rewritten text."
        ),
        (PromptKind.REWRITE, "sk"): (
            "Prepíšeš text poznámky. Zachovaj význam a štruktúru, pokiaľ nie je povedané inak. "
            "Vráť len prepísaný text."
        ),
        (PromptKind.REWRITE, "cs"): (
            "Přepíšeš text poznámky. Zachovej význam a strukturu, pokud není řečeno jinak. "
            "Vrať jen přepsaný text."
        ),
        (PromptKind.REWRITE, "hu"): (
            "Átírod a jegyzet szövegét. Őrizd meg a jelentést és a szerkezetet, hacsak mást nem kérnek. "
            "Csak az átírt szöveget add vissza."
        ),
        (PromptKind.REWRITE, "pl"): (
            "Przepisujesz tekst notatki. Zachowaj znaczenie i strukturę, chyba że poproszono inaczej. "
            "Zwróć tylko przepisany tekst."
        ),
    }
    return table[(key, locale)]


def _trim_passages(passages: Any, budget: int) -> str:
    raw = json.dumps(passages if passages is not None else [], ensure_ascii=False)
    if len(raw) <= budget:
        return raw
    if isinstance(passages, list):
        kept: list[Any] = []
        size = 2  # []
        for item in passages:
            chunk = json.dumps(item, ensure_ascii=False)
            if size + len(chunk) + (1 if kept else 0) > budget:
                break
            kept.append(item)
            size += len(chunk) + (1 if len(kept) > 1 else 0)
        return json.dumps(kept, ensure_ascii=False)
    return raw[:budget]


def user_prompt(
    kind: PromptKind | str,
    question_or_text: str,
    passages: Any | None = None,
    char_budget: int | None = None,
) -> str:
    q = (question_or_text or "").strip()
    key = PromptKind(kind) if not isinstance(kind, PromptKind) else kind
    if key is PromptKind.REWRITE:
        return q
    budget = char_budget if char_budget and char_budget > 0 else DEFAULT_PASSAGE_CHAR_BUDGET
    body = _trim_passages(passages, budget)
    return f"Question:\n{q}\n\nPassages (JSON):\n{body}"
