"""CSV / TSV helpers for import into TipTap tables and matrix export.

Stdlib only — no optional extras. Mirrors Rust ``csv_bytes_to_tiptap`` /
``matrix_to_csv`` so the NLP sidecar can convert tabular text without
shipping through the FE SheetJS path.
"""

from __future__ import annotations

import base64
import csv
import io
import json
from typing import Any

from .config import get_config


def _csv_limits() -> tuple[int, int, int]:
    code = get_config().code
    return code.max_csv_rows, code.max_csv_cols, code.max_csv_bytes


MAX_ROWS = get_config().code.max_csv_rows
MAX_COLS = get_config().code.max_csv_cols
MAX_INPUT_BYTES = get_config().code.max_csv_bytes


class CsvOpsError(ValueError):
    """Invalid CSV payload or limits exceeded."""


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
            raise CsvOpsError(f"Invalid base64 CSV payload: {exc}") from exc
    elif isinstance(params.get("sourcePath"), str) and params["sourcePath"].strip():
        path = params["sourcePath"].strip()
        try:
            with open(path, "rb") as handle:
                raw = handle.read(MAX_INPUT_BYTES + 1)
        except OSError as exc:
            raise CsvOpsError(f"Cannot read CSV path: {exc}") from exc

    if raw is None:
        raise CsvOpsError("Provide text, base64, bytes, or sourcePath")
    if len(raw) > MAX_INPUT_BYTES:
        raise CsvOpsError(f"CSV exceeds {MAX_INPUT_BYTES} byte limit")
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise CsvOpsError("CSV must be UTF-8") from exc


def detect_delimiter(text: str) -> str:
    sample = "\n".join(text.splitlines()[:8])
    scores = {",": sample.count(","), ";": sample.count(";"), "\t": sample.count("\t")}
    best = max(scores.items(), key=lambda item: item[1])
    return best[0] if best[1] > 0 else ","


def parse_csv_rows(text: str, delimiter: str | None = None) -> list[list[str]]:
    if not text.strip():
        return []
    delim = delimiter if delimiter else detect_delimiter(text)
    reader = csv.reader(io.StringIO(text), delimiter=delim, quotechar='"')
    rows: list[list[str]] = []
    for row in reader:
        if len(rows) >= MAX_ROWS:
            break
        cells = [str(cell) for cell in row[:MAX_COLS]]
        if cells and any(cell.strip() for cell in cells):
            rows.append(cells)
        elif cells and len(cells) > 1:
            rows.append(cells)
    return rows


def matrix_to_csv(rows: list[list[str]], delimiter: str = ",") -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=delimiter, quotechar='"', lineterminator="\n")
    for row in rows:
        writer.writerow([str(cell) for cell in row])
    return buf.getvalue()


def _paragraph_node(text: str) -> dict[str, Any]:
    if not text:
        return {"type": "paragraph"}
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]}


def _cell_node(text: str, header: bool) -> dict[str, Any]:
    return {
        "type": "tableHeader" if header else "tableCell",
        "attrs": {"colspan": 1, "rowspan": 1, "colwidth": None},
        "content": [_paragraph_node(text)],
    }


def rows_to_tiptap_table(rows: list[list[str]]) -> dict[str, Any] | None:
    if not rows:
        return None
    width = min(max((len(row) for row in rows), default=0), MAX_COLS)
    if width == 0:
        return None
    table_rows: list[dict[str, Any]] = []
    for row_index, row in enumerate(rows[:MAX_ROWS]):
        cells = [
            _cell_node(row[col] if col < len(row) else "", header=row_index == 0)
            for col in range(width)
        ]
        table_rows.append({"type": "tableRow", "content": cells})
    return {"type": "table", "content": table_rows}


def rows_to_tiptap_doc(rows: list[list[str]]) -> dict[str, Any]:
    table = rows_to_tiptap_table(rows)
    content: list[dict[str, Any]] = []
    if table is not None:
        content.append(table)
        content.append({"type": "paragraph"})
    return {"type": "doc", "content": content}


def inspect_csv(params: dict[str, Any]) -> dict[str, Any]:
    text = _decode_text(params)
    delimiter = params.get("delimiter")
    delim = str(delimiter) if isinstance(delimiter, str) and delimiter else detect_delimiter(text)
    rows = parse_csv_rows(text, delim)
    cols = max((len(row) for row in rows), default=0)
    preview = rows[:5]
    return {
        "ok": True,
        "delimiter": delim,
        "rowCount": len(rows),
        "columnCount": cols,
        "preview": preview,
        "truncated": len(rows) >= MAX_ROWS or cols >= MAX_COLS,
    }


def csv_to_tiptap(params: dict[str, Any]) -> dict[str, Any]:
    text = _decode_text(params)
    delimiter = params.get("delimiter")
    delim = str(delimiter) if isinstance(delimiter, str) and delimiter else None
    rows = parse_csv_rows(text, delim)
    doc = rows_to_tiptap_doc(rows)
    return {
        "ok": True,
        "contentJson": json.dumps(doc, ensure_ascii=False),
        "rowCount": len(rows),
        "columnCount": max((len(row) for row in rows), default=0),
        "delimiter": delim or detect_delimiter(text) if text.strip() else ",",
    }


def matrix_to_csv_rpc(params: dict[str, Any]) -> dict[str, Any]:
    rows_raw = params.get("rows")
    if not isinstance(rows_raw, list):
        raise CsvOpsError("rows must be a list of lists")
    rows: list[list[str]] = []
    for row in rows_raw[:MAX_ROWS]:
        if not isinstance(row, list):
            continue
        rows.append([str(cell) for cell in row[:MAX_COLS]])
    delimiter = params.get("delimiter")
    delim = str(delimiter) if isinstance(delimiter, str) and delimiter else ","
    if delim not in {",", ";", "\t"}:
        delim = ","
    text = matrix_to_csv(rows, delim)
    return {
        "ok": True,
        "text": text,
        "base64": base64.b64encode(text.encode("utf-8")).decode("ascii"),
        "rowCount": len(rows),
        "delimiter": delim,
    }
