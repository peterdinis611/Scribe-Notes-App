from __future__ import annotations

import re
from urllib.parse import urlparse

from .text_utils import WIKI_LINK_RE, normalize_text

MENTION_RE = re.compile(r"(?<!\w)@([\w\u00C0-\u024F][\w\u00C0-\u024F._-]{1,40})")
URL_RE = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
MD_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def extract_mentions(text: str) -> dict[str, object]:
    """Wiki links, @mentions, markdown links, and URL hosts for graph edges."""
    source = text or ""
    wiki: list[str] = []
    mentions: list[str] = []
    urls: list[dict[str, str]] = []
    hosts: list[str] = []
    md_links: list[dict[str, str]] = []
    seen_wiki: set[str] = set()
    seen_mentions: set[str] = set()
    seen_urls: set[str] = set()
    seen_hosts: set[str] = set()

    for match in WIKI_LINK_RE.finditer(source):
        target = normalize_text(match.group(1))
        key = target.lower()
        if key and key not in seen_wiki:
            seen_wiki.add(key)
            wiki.append(target)

    for match in MENTION_RE.finditer(source):
        name = match.group(1).rstrip(".,;:!?")
        if len(name) < 2:
            continue
        key = name.lower()
        if key not in seen_mentions:
            seen_mentions.add(key)
            mentions.append(name)

    for match in MD_LINK_RE.finditer(source):
        label = normalize_text(match.group(1))
        href = match.group(2).strip()
        md_links.append({"label": label, "href": href})
        _add_url(href, urls, hosts, seen_urls, seen_hosts)

    for match in URL_RE.finditer(source):
        _add_url(match.group(0), urls, hosts, seen_urls, seen_hosts)

    edges: list[dict[str, str]] = []
    for target in wiki:
        edges.append({"kind": "wiki", "target": target})
    for name in mentions:
        edges.append({"kind": "mention", "target": name})
    for host in hosts:
        edges.append({"kind": "host", "target": host})

    return {
        "wikiLinks": wiki,
        "mentions": mentions,
        "urls": urls[:40],
        "hosts": hosts,
        "markdownLinks": md_links[:40],
        "edges": edges,
        "edgeCount": len(edges),
    }


def _add_url(
    raw: str,
    urls: list[dict[str, str]],
    hosts: list[str],
    seen_urls: set[str],
    seen_hosts: set[str],
) -> None:
    href = raw.rstrip(").,;]")
    if href in seen_urls:
        return
    seen_urls.add(href)
    host = ""
    try:
        parsed = urlparse(href)
        host = (parsed.hostname or "").lower()
    except Exception:  # noqa: BLE001
        host = ""
    urls.append({"url": href, "host": host})
    if host and host not in seen_hosts:
        seen_hosts.add(host)
        hosts.append(host)
