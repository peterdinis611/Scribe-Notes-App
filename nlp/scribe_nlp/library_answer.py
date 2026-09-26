from __future__ import annotations

from typing import Any

from .normalize import fold_diacritics, stem_lite
from .rerank import rerank_passages
from .text_utils import STOP_WORDS, normalize_text, split_sentences, tokenize

MAX_SENTENCES = 5
MAX_PASSAGES = 40
MAX_CANDIDATE_PASSAGES = 96
MAX_FOLLOWUPS = 5

# Cue words that boost sentence relevance for a detected question intent.
_INTENT_CUES: dict[str, tuple[str, ...]] = {
    "dates": (
        "deadline",
        "due",
        "date",
        "termín",
        "termin",
        "dátum",
        "datum",
        "zajtra",
        "tomorrow",
        "today",
        "week",
        "mesiac",
        "month",
        "202",
        "do ",
    ),
    "tasks": (
        "todo",
        "task",
        "úloha",
        "uloha",
        "checklist",
        "- [ ]",
        "[ ]",
        "action",
        "next step",
        "ďalej",
        "dalej",
        "finish",
        "dokonči",
        "dokonci",
    ),
    "people": (
        "@",
        "mention",
        "with ",
        "from ",
        "s ",
        "od ",
        "person",
        "people",
        "ľud",
        "lud",
        "meno",
        "meeting with",
    ),
    "decisions": (
        "decid",
        "decision",
        "conclude",
        "conclusion",
        "agreed",
        "rozhod",
        "záver",
        "zaver",
        "we will",
        "budeme",
        "chosen",
        "vybran",
    ),
    "projects": (
        "project",
        "projekt",
        "goal",
        "cieľ",
        "ciel",
        "milestone",
        "roadmap",
        "okruh",
        "epic",
    ),
    "meetings": (
        "meeting",
        "call",
        "schôdz",
        "schodz",
        "hovor",
        "standup",
        "sync",
        "agenda",
        "notes from",
    ),
    "ideas": (
        "idea",
        "nápad",
        "napad",
        "brainstorm",
        "could",
        "what if",
        "hypothesis",
        "explore",
        "skús",
        "skus",
    ),
    "definitions": (
        "means",
        "define",
        "definition",
        "is a ",
        "refers to",
        "znamená",
        "znamena",
        "definíc",
        "definic",
        "pojem",
    ),
    "connections": (
        "related",
        "similar",
        "see also",
        "[[",
        "linked",
        "súvis",
        "suvis",
        "prepoj",
        "also in",
        "connect",
    ),
    "risks": (
        "risk",
        "blocker",
        "problem",
        "issue",
        "rizik",
        "blok",
        "problém",
        "problem",
        "concern",
        "obava",
        "blocked",
        "stuck",
    ),
    "themes": (
        "theme",
        "téma",
        "tema",
        "across",
        "pattern",
        "recurring",
        "opakuj",
    ),
    "recent": (
        "today",
        "yesterday",
        "this week",
        "recent",
        "naposledy",
        "dnes",
        "včera",
        "vcera",
        "tento týždeň",
        "tento tyzden",
    ),
}

_INTENT_PATTERNS: dict[str, tuple[str, ...]] = {
    "dates": (
        "deadline",
        "deadlines",
        "date",
        "dates",
        "due",
        "schedule",
        "termín",
        "termin",
        "dátum",
        "datum",
        "termíny",
        "terminy",
    ),
    "tasks": (
        "task",
        "tasks",
        "todo",
        "todos",
        "checklist",
        "action item",
        "open loop",
        "unfinished",
        "úloha",
        "uloha",
        "úlohy",
        "ulohy",
        "what should i do",
        "nedokončen",
        "nedokoncen",
    ),
    "people": (
        "who",
        "people",
        "person",
        "mention",
        "mentions",
        "kto",
        "ľudia",
        "ludia",
        "spomín",
        "spomin",
    ),
    "decisions": (
        "decision",
        "decisions",
        "conclude",
        "conclusion",
        "agreed",
        "rozhodnut",
        "záver",
        "zaver",
    ),
    "projects": (
        "project",
        "projects",
        "goal",
        "goals",
        "milestone",
        "projekt",
        "projekty",
        "cieľ",
        "ciel",
    ),
    "meetings": (
        "meeting",
        "meetings",
        "call",
        "calls",
        "standup",
        "schôdz",
        "schodz",
        "hovor",
    ),
    "ideas": (
        "idea",
        "ideas",
        "brainstorm",
        "nápad",
        "napad",
        "nápady",
        "napady",
    ),
    "definitions": (
        "define",
        "definition",
        "definitions",
        "term",
        "terms",
        "means",
        "definíc",
        "definic",
        "pojem",
        "pojmy",
    ),
    "connections": (
        "related",
        "connect",
        "connected",
        "link",
        "links",
        "súvis",
        "suvis",
        "prepoj",
        "podobn",
    ),
    "risks": (
        "risk",
        "risks",
        "blocker",
        "problem",
        "problems",
        "issue",
        "rizik",
        "blok",
        "problém",
        "problem",
    ),
    "themes": (
        "theme",
        "themes",
        "topic",
        "topics",
        "téma",
        "tema",
        "témy",
        "temy",
        "across",
    ),
    "recent": (
        "recent",
        "recently",
        "lately",
        "naposledy",
        "posledn",
        "dnes",
        "this week",
    ),
}


def detect_question_intent(question: str) -> str | None:
    """Detect a high-level ask intent (SK/EN) for ranking and follow-ups."""
    folded = fold_diacritics(question or "").lower()
    if not folded.strip():
        return None
    scores: dict[str, int] = {}
    for intent, patterns in _INTENT_PATTERNS.items():
        score = 0
        for pattern in patterns:
            needle = fold_diacritics(pattern).lower()
            if needle and needle in folded:
                score += 2 if " " in needle or len(needle) >= 6 else 1
        if score:
            scores[intent] = score
    if not scores:
        return None
    return max(scores.items(), key=lambda item: item[1])[0]


def library_answer(
    question: str,
    passages: list[dict[str, object]],
    *,
    max_sentences: int = MAX_SENTENCES,
    scope: str = "library",
    answer_embed_backend: str | None = None,
) -> dict[str, object]:
    """Extractive multi-doc answer + citations (no cloud LLM)."""
    query = normalize_text(question)
    intent = detect_question_intent(question)
    prefix = (
        "Based on this document"
        if scope == "document"
        else "Based on your notes"
    )
    if not query:
        return {
            "answer": f"{prefix}: No matching passages were found.",
            "citations": [],
            "sentences": [],
            "followups": [],
            "intent": intent,
        }

    # Keep a wide pool so BM25 can prune before embed rerank (not after a hard cut).
    pool_cap = MAX_CANDIDATE_PASSAGES if scope == "document" else MAX_PASSAGES
    cleaned: list[dict[str, Any]] = []
    for item in passages[:pool_cap]:
        if not isinstance(item, dict):
            continue
        document_id = str(item.get("documentId") or item.get("document_id") or "").strip()
        title = normalize_text(str(item.get("title") or ""))
        snippet = normalize_text(str(item.get("snippet") or item.get("text") or ""))
        if not document_id:
            continue
        if not snippet and not title:
            continue
        entry: dict[str, Any] = {
            "documentId": document_id,
            "title": title or "Untitled",
            "snippet": snippet or title,
        }
        if item.get("score") is not None:
            entry["score"] = item.get("score")
        chunk_index = item.get("chunkIndex", item.get("chunk_index"))
        if chunk_index is not None:
            try:
                entry["chunkIndex"] = int(chunk_index)
            except (TypeError, ValueError):
                pass
        cleaned.append(entry)

    cleaned = rerank_passages(
        question,
        cleaned,
        limit=MAX_PASSAGES,
        embed_backend=answer_embed_backend,
    )
    if intent:
        cleaned = _boost_passages_for_intent(cleaned, intent)
    query_terms = _query_terms(query)
    sentence_budget = max_sentences + (1 if intent in {"themes", "projects", "ideas", "risks"} else 0)
    sentences, used = _pick_sentences(
        query_terms,
        cleaned,
        max_sentences=sentence_budget,
        intent=intent,
    )
    answer = _format_answer(sentences, prefix=prefix, intent=intent)
    citations = []
    seen_ids: set[str] = set()
    for item in used:
        document_id = item["documentId"]
        title = item.get("title") or "Untitled"
        if "chat memory" in title.lower() or "earlier chat" in title.lower() or "library memory" in title.lower() or "note memory" in title.lower():
            continue
        if document_id in seen_ids:
            continue
        seen_ids.add(document_id)
        cite: dict[str, Any] = {
            "documentId": document_id,
            "title": title,
            "snippet": item["snippet"][:240],
        }
        if item.get("chunkIndex") is not None:
            cite["chunkIndex"] = item["chunkIndex"]
        citations.append(cite)
        if len(citations) >= 4:
            break
    followups = suggest_followups(question, sentences, cleaned, scope=scope, intent=intent)
    return {
        "answer": answer,
        "citations": citations,
        "sentences": sentences,
        "followups": followups,
        "intent": intent,
    }


def suggest_followups(
    question: str,
    sentences: list[str],
    passages: list[dict[str, str]],
    *,
    scope: str = "library",
    intent: str | None = None,
    limit: int = MAX_FOLLOWUPS,
) -> list[str]:
    """Heuristic follow-up questions from answer sentences / passage titles (offline)."""
    limit = max(1, min(int(limit), 8))
    asked = {stem_lite(token) for token in tokenize(fold_diacritics(question).lower())}
    candidates: list[str] = []
    intent = intent or detect_question_intent(question)

    for sentence in sentences:
        for cue in ("because", "pretože", "lebo", "when", "keď", "ak ", "if ", "so that", "aby "):
            if cue in sentence.lower() and len(sentence) >= 24:
                candidates.append(f"What else is known about: {sentence[:96].rstrip('.')}?")
                break

    titles = []
    for item in passages:
        title = (item.get("title") or "").strip()
        if not title or "· chat memory" in title:
            continue
        titles.append(title)

    for title in titles[:6]:
        stems = {stem_lite(token) for token in tokenize(fold_diacritics(title).lower())}
        if stems and stems.isdisjoint(asked):
            if scope == "document":
                candidates.append(f"Where in this note is {title} explained?")
            else:
                candidates.append(f"What do my notes say about {title}?")

    candidates.extend(_intent_followups(intent, scope=scope))

    if scope == "document":
        candidates.extend(
            [
                "What are the key action items in this document?",
                "Which dates or deadlines are mentioned?",
                "Who is mentioned in this note?",
                "What decisions or conclusions are in this note?",
            ]
        )
    else:
        candidates.extend(
            [
                "Which related notes should I open next?",
                "Are there open tasks connected to this?",
                "Any deadlines or dates in my notes?",
                "Who do I mention across my notes?",
                "What decisions or conclusions did I capture?",
            ]
        )

    seen: set[str] = set()
    picked: list[str] = []
    for item in candidates:
        key = fold_diacritics(item).lower()
        if key in seen:
            continue
        seen.add(key)
        picked.append(item)
        if len(picked) >= limit:
            break
    return picked


def _intent_followups(intent: str | None, *, scope: str) -> list[str]:
    if not intent:
        return []
    library = {
        "dates": [
            "Which notes have the soonest deadlines?",
            "Are any of those dates overdue?",
        ],
        "tasks": [
            "Which open tasks have due dates?",
            "What unfinished threads connect to these tasks?",
        ],
        "people": [
            "What did I write after meeting those people?",
            "Are there open tasks involving them?",
        ],
        "decisions": [
            "What options did I consider before deciding?",
            "Are there follow-up tasks from those decisions?",
        ],
        "projects": [
            "What open tasks belong to those projects?",
            "Any risks or blockers for these projects?",
        ],
        "meetings": [
            "What action items came out of those meetings?",
            "Who attended or was mentioned?",
        ],
        "ideas": [
            "Which ideas turned into projects or decisions?",
            "What related notes expand on these ideas?",
        ],
        "definitions": [
            "Where else do I use these terms?",
            "Are there related wiki links for these definitions?",
        ],
        "connections": [
            "What themes tie those notes together?",
            "Which of those notes should I open next?",
        ],
        "risks": [
            "Are there open tasks to resolve these risks?",
            "Which projects do these risks affect?",
        ],
        "themes": [
            "Which notes best represent each theme?",
            "Any open tasks under those themes?",
        ],
        "recent": [
            "What themes appear in my recent notes?",
            "Any deadlines in what I wrote recently?",
        ],
    }
    document = {
        "dates": [
            "What should I do before those dates?",
            "Are there open tasks tied to these dates?",
        ],
        "tasks": [
            "Which dates or deadlines relate to these tasks?",
            "What feels unfinished beyond the checklist?",
        ],
        "people": [
            "What decisions involve these people?",
            "Are there open tasks mentioning them?",
        ],
        "decisions": [
            "What evidence supports those decisions?",
            "What should I do next based on this note?",
        ],
        "projects": [
            "What open tasks belong to this project?",
            "Any risks mentioned for this project?",
        ],
        "meetings": [
            "What action items came from this meeting?",
            "Who should follow up?",
        ],
        "ideas": [
            "What would it take to act on these ideas?",
            "How does this connect to other notes?",
        ],
        "definitions": [
            "Where else in this note are these terms used?",
            "How does this note connect to others?",
        ],
        "connections": [
            "What themes tie this note to others?",
            "Which related note should I open next?",
        ],
        "risks": [
            "What should I do next to address these risks?",
            "Which people are involved in resolving them?",
        ],
        "themes": [
            "What are the main claims in this note?",
            "What should I do next based on this note?",
        ],
        "recent": [
            "What decisions are captured here?",
            "What should I do next based on this note?",
        ],
    }
    table = document if scope == "document" else library
    return list(table.get(intent, []))


def _boost_passages_for_intent(
    passages: list[dict[str, Any]],
    intent: str,
) -> list[dict[str, Any]]:
    cues = _INTENT_CUES.get(intent) or ()
    if not cues:
        return passages
    scored: list[tuple[float, dict[str, Any]]] = []
    for item in passages:
        text = fold_diacritics(f"{item.get('title', '')} {item.get('snippet', '')}").lower()
        boost = 0.0
        for cue in cues:
            if fold_diacritics(cue).lower() in text:
                boost += 0.08
        try:
            base = float(item.get("score") or 0.0)
        except (TypeError, ValueError):
            base = 0.0
        next_item = dict(item)
        next_item["score"] = base + min(0.4, boost)
        scored.append((float(next_item["score"]), next_item))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [item for _, item in scored]


def _query_terms(question: str) -> set[str]:
    folded = fold_diacritics(question).lower()
    return {
        token
        for token in tokenize(folded)
        if token not in STOP_WORDS and len(token) >= 2
    }


def _pick_sentences(
    query_terms: set[str],
    passages: list[dict[str, Any]],
    *,
    max_sentences: int,
    intent: str | None = None,
) -> tuple[list[str], list[dict[str, Any]]]:
    scored: list[tuple[float, str, dict[str, Any]]] = []
    intent_cues = _INTENT_CUES.get(intent or "", ())
    for hit_index, passage in enumerate(passages):
        source = passage["snippet"] or passage["title"]
        parts = split_sentences(source)
        candidates = parts if parts else [source]
        rank_boost = 0.12 / (hit_index + 1)
        title = (passage.get("title") or "").lower()
        if "chat memory" in title or "earlier chat" in title or "library memory" in title or "note memory" in title:
            rank_boost += 0.08
        try:
            rank_boost += min(0.35, max(0.0, float(passage.get("score") or 0))) * 0.25
        except (TypeError, ValueError):
            pass
        for sentence in candidates:
            cleaned = normalize_text(sentence)
            if len(cleaned) < 8 or _is_noisy_sentence(cleaned):
                continue
            score = _score_sentence(cleaned, query_terms) + rank_boost
            if intent_cues:
                folded_sentence = fold_diacritics(cleaned).lower()
                cue_hits = sum(
                    1 for cue in intent_cues if fold_diacritics(cue).lower() in folded_sentence
                )
                if cue_hits:
                    score += min(0.35, 0.1 * cue_hits)
            scored.append((score, cleaned, passage))

    scored.sort(key=lambda item: item[0], reverse=True)
    picked: list[str] = []
    used: list[dict[str, Any]] = []
    for score, sentence, passage in scored:
        if len(picked) >= max_sentences:
            break
        lower = sentence.lower()
        duplicate = any(
            existing.lower() == lower
            or existing.lower().find(lower[: min(48, len(lower))]) >= 0
            or lower.find(existing.lower()[: min(48, len(existing))]) >= 0
            for existing in picked
        )
        if duplicate:
            continue
        if picked and score < 0.12 and scored and scored[0][0] >= 0.2:
            continue
        picked.append(sentence)
        used.append(passage)

    if len(picked) >= 1:
        return picked[:max_sentences], used

    fallback: list[str] = []
    fallback_used: list[dict[str, Any]] = []
    for item in passages:
        text = normalize_text(item["snippet"] or item["title"])
        if not text.strip() or _is_noisy_sentence(text):
            continue
        fallback.append(text)
        fallback_used.append(item)
        if len(fallback) >= 2:
            break
    return fallback, fallback_used


def _is_noisy_sentence(sentence: str) -> bool:
    stripped = sentence.strip()
    if stripped.count("|") >= 2 or "\t\t" in stripped:
        return True
    if set(stripped) <= {"|", "-", ":", " "}:
        return True
    letters = sum(1 for char in stripped if char.isalpha())
    digits = sum(1 for char in stripped if char.isdigit())
    if len(stripped) >= 24 and digits > letters and digits / max(len(stripped), 1) >= 0.35:
        return True
    return False


def _score_sentence(sentence: str, query_terms: set[str]) -> float:
    if not query_terms:
        return 0.0
    tokens = set(tokenize(fold_diacritics(sentence).lower()))
    token_stems = {stem_lite(token) for token in tokens}
    overlap = 0.0
    for term in query_terms:
        term_stem = stem_lite(term)
        if term in tokens:
            overlap += 1.0
            continue
        if term_stem in token_stems:
            overlap += 0.85
            continue
        if any(term in token or token in term for token in tokens):
            overlap += 0.45
            continue
        if any(
            term_stem in stem or stem in term_stem
            for stem in token_stems
            if len(stem) >= 4 and len(term_stem) >= 4
        ):
            overlap += 0.35
    length_bonus = 0.08 if 40 <= len(sentence) <= 220 else 0.0
    return overlap / len(query_terms) + length_bonus


def _format_answer(
    sentences: list[str],
    *,
    prefix: str = "Based on your notes",
    intent: str | None = None,
) -> str:
    if not sentences:
        return f"{prefix}: No matching passages were found."
    label = {
        "dates": "Dates & deadlines",
        "tasks": "Tasks & open loops",
        "people": "People & mentions",
        "decisions": "Decisions & conclusions",
        "projects": "Projects & goals",
        "meetings": "Meetings & calls",
        "ideas": "Ideas",
        "definitions": "Definitions",
        "connections": "Connections",
        "risks": "Risks & blockers",
        "themes": "Themes",
        "recent": "Recent notes",
    }.get(intent or "", "")
    heading = f"{prefix}" + (f" ({label})" if label else "")
    if len(sentences) == 1:
        return f"{heading}: {sentences[0]}"
    bullets = "\n".join(f"• {sentence}" for sentence in sentences)
    return f"{heading}:\n{bullets}"
