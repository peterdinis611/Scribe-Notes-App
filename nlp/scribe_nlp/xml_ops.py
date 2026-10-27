"""XML → TipTap outline helpers for the NLP sidecar.

Mirrors Rust ``scribe_core::xml_import`` (structured headings/text, not a raw
code dump). ``.svg`` stays on the source-code path. Stdlib only.
"""

from __future__ import annotations

import base64
import json
import xml.etree.ElementTree as ET
from typing import Any
from xml.etree.ElementTree import ParseError

from .config import get_config

MAX_CHARS = 800_000
MAX_NODES = 2_000
MAX_INPUT_BYTES = get_config().code.max_source_bytes

XML_DOCUMENT_EXTENSIONS = frozenset(
    {"xml", "xsd", "xsl", "xslt", "rss", "atom", "plist"}
)


class XmlOpsError(ValueError):
    """Invalid XML payload or limits exceeded."""


def is_xml_document_extension(ext: str) -> bool:
    key = ext.strip().lstrip(".").lower()
    return key in XML_DOCUMENT_EXTENSIONS


def _decode_text(params: dict[str, Any]) -> str:
    if isinstance(params.get("text"), str):
        text = params["text"]
        if text.startswith("\ufeff"):
            text = text[1:]
        return text

    raw: bytes | None = None
    if isinstance(params.get("bytes"), (bytes, bytearray)):
        raw = bytes(params["bytes"])
    elif isinstance(params.get("base64"), str) and params["base64"].strip():
        try:
            raw = base64.b64decode(params["base64"], validate=False)
        except Exception as exc:  # noqa: BLE001
            raise XmlOpsError(f"Invalid base64 XML payload: {exc}") from exc
    elif isinstance(params.get("sourcePath"), str) and params["sourcePath"].strip():
        path = params["sourcePath"].strip()
        try:
            with open(path, "rb") as handle:
                raw = handle.read(MAX_INPUT_BYTES + 1)
        except OSError as exc:
            raise XmlOpsError(f"Cannot read XML path: {exc}") from exc

    if raw is None:
        raise XmlOpsError("Provide text, base64, bytes, or sourcePath")
    if len(raw) > MAX_INPUT_BYTES:
        raise XmlOpsError(f"XML exceeds {MAX_INPUT_BYTES} byte limit")
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    if b"\x00" in raw[: min(len(raw), 8 * 1024)]:
        raise XmlOpsError("File looks binary — not imported as XML")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("utf-8", errors="replace")


def _local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    if ":" in tag:
        return tag.rsplit(":", 1)[-1]
    return tag


def _heading(level: int, text: str) -> dict[str, Any]:
    return {
        "type": "heading",
        "attrs": {"level": max(1, min(6, level))},
        "content": [{"type": "text", "text": text}],
    }


def _paragraph(text: str) -> dict[str, Any]:
    trimmed = text.strip()
    if not trimmed:
        return {"type": "paragraph"}
    return {
        "type": "paragraph",
        "content": [{"type": "text", "text": trimmed}],
    }


def _code_block(source: str) -> dict[str, Any]:
    content: list[dict[str, Any]] = []
    if source.strip():
        content.append({"type": "text", "text": source})
    return {
        "type": "codeBlock",
        "attrs": {"language": "xml"},
        "content": content,
    }


def _walk_element(el: ET.Element, depth: int, nodes: list[dict[str, Any]]) -> None:
    if len(nodes) >= MAX_NODES:
        return
    name = _local_name(el.tag)
    if not name:
        return
    label = name
    if el.attrib:
        attrs = [f"{_local_name(k)}={v}" for k, v in el.attrib.items()]
        label = f"{name} ({', '.join(attrs)})"
    nodes.append(_heading(depth, label))

    text = (el.text or "").strip()
    if text and len(nodes) < MAX_NODES:
        nodes.append(_paragraph(text))

    for child in list(el):
        if len(nodes) >= MAX_NODES:
            nodes.append(_paragraph("…"))
            return
        _walk_element(child, min(depth + 1, 6), nodes)
        tail = (child.tail or "").strip()
        if tail and len(nodes) < MAX_NODES:
            nodes.append(_paragraph(tail))


def xml_text_to_tiptap_doc(text: str) -> dict[str, Any]:
    source = text.replace("\r\n", "\n").replace("\r", "\n")
    if len(source) > MAX_CHARS:
        source = source[:MAX_CHARS] + "\n…"

    nodes: list[dict[str, Any]] = []
    try:
        root = ET.fromstring(source)
        _walk_element(root, 1, nodes)
    except ParseError:
        nodes = [_code_block(source)]

    if not nodes:
        nodes = [_code_block(source)] if source.strip() else [{"type": "paragraph"}]

    return {"type": "doc", "content": nodes}


def inspect_xml(params: dict[str, Any]) -> dict[str, Any]:
    text = _decode_text(params)
    truncated = len(text) > MAX_CHARS
    probe = text if not truncated else text[:MAX_CHARS]
    try:
        root = ET.fromstring(probe)
        root_name = _local_name(root.tag)
        child_count = len(list(root))
        attr_count = len(root.attrib)
        ok_parse = True
        error = None
    except ParseError as exc:
        root_name = None
        child_count = 0
        attr_count = 0
        ok_parse = False
        error = str(exc)

    return {
        "ok": True,
        "wellFormed": ok_parse,
        "rootTag": root_name,
        "childCount": child_count,
        "attributeCount": attr_count,
        "charCount": len(text),
        "truncated": truncated,
        "error": error,
    }


def xml_to_tiptap(params: dict[str, Any]) -> dict[str, Any]:
    text = _decode_text(params)
    doc = xml_text_to_tiptap_doc(text)
    well_formed = True
    try:
        ET.fromstring(text[:MAX_CHARS] if len(text) > MAX_CHARS else text)
    except ParseError:
        well_formed = False
    return {
        "ok": True,
        "contentJson": json.dumps(doc, ensure_ascii=False),
        "wellFormed": well_formed,
        "nodeCount": len(doc.get("content") or []),
    }
