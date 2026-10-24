"""Central NLP sidecar configuration.

Resolution order (later wins):
1. Built-in defaults
2. Optional config file (TOML or JSON)
3. Environment variables ``SCRIBE_NLP_*`` / legacy ``SCRIBE_*``

Config file search (first hit):
- ``$SCRIBE_NLP_CONFIG``
- ``./scribe-nlp.toml`` / ``./scribe-nlp.json`` (cwd)
- ``$XDG_CONFIG_HOME/scribe/nlp.toml`` (or ``~/.config/scribe/nlp.toml``)
- ``~/Library/Application Support/com.scribe.app/nlp.toml`` (macOS)
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict, dataclass, fields, replace
from pathlib import Path
from typing import Any


def _env_int(name: str, default: int, *, minimum: int | None = None, maximum: int | None = None) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        value = default
    else:
        try:
            value = int(raw)
        except ValueError:
            value = default
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


def _env_float(name: str, default: float, *, minimum: float | None = None, maximum: float | None = None) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        value = default
    else:
        try:
            value = float(raw)
        except ValueError:
            value = default
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return default


def _env_str(name: str, default: str = "") -> str:
    return os.environ.get(name, "").strip() or default


@dataclass(frozen=True)
class RpcLimits:
    max_text_chars: int = 120_000
    max_embed_batch: int = 128
    max_report_documents: int = 5_000
    embed_cache_size: int = 256


@dataclass(frozen=True)
class FilesLimits:
    max_file_bytes: int = 5_000_000
    max_docx_xml_bytes: int = 30_000_000
    pdf_max_pages: int = 40
    scan_limit_default: int = 200
    hybrid_alpha: float = 0.7
    ann_min_chunks: int = 24
    files_api_base_url: str = "http://127.0.0.1:8787"


@dataclass(frozen=True)
class CodeLimits:
    max_source_bytes: int = 2 * 1024 * 1024
    max_csv_bytes: int = 16 * 1024 * 1024
    max_csv_rows: int = 5_000
    max_csv_cols: int = 128
    code_brief_max_symbols: int = 12
    code_brief_preview_lines: int = 8


@dataclass(frozen=True)
class AgentLimits:
    tool_limit: int = 3
    tool_limit_hard: int = 6
    brief_workers: int = 4


@dataclass(frozen=True)
class EmbedPrefs:
    """Defaults only — runtime backend still follows SCRIBE_EMBED_BACKEND / RPC."""

    default_backend: str = "hash"  # hash | fast | quality
    warmup_on_start: bool = True


@dataclass(frozen=True)
class NlpConfig:
    rpc: RpcLimits = RpcLimits()
    files: FilesLimits = FilesLimits()
    code: CodeLimits = CodeLimits()
    agent: AgentLimits = AgentLimits()
    embed: EmbedPrefs = EmbedPrefs()
    debug: bool = False
    config_path: str | None = None

    def snapshot(self) -> dict[str, Any]:
        data = asdict(self)
        data["configPath"] = self.config_path
        return data


_CONFIG: NlpConfig | None = None
_CONFIG_PATH: str | None = None


def candidate_config_paths() -> list[Path]:
    paths: list[Path] = []
    override = os.environ.get("SCRIBE_NLP_CONFIG", "").strip()
    if override:
        paths.append(Path(override).expanduser())
    cwd = Path.cwd()
    paths.extend(
        [
            cwd / "scribe-nlp.toml",
            cwd / "scribe-nlp.json",
            cwd / ".scribe" / "nlp.toml",
            cwd / ".scribe" / "nlp.json",
        ]
    )
    xdg = os.environ.get("XDG_CONFIG_HOME", "").strip()
    if xdg:
        paths.append(Path(xdg) / "scribe" / "nlp.toml")
        paths.append(Path(xdg) / "scribe" / "nlp.json")
    else:
        paths.append(Path.home() / ".config" / "scribe" / "nlp.toml")
        paths.append(Path.home() / ".config" / "scribe" / "nlp.json")
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / "com.scribe.app"
        paths.append(base / "nlp.toml")
        paths.append(base / "nlp.json")
    # Deduplicate while preserving order.
    seen: set[str] = set()
    unique: list[Path] = []
    for path in paths:
        key = str(path.resolve()) if path.exists() else str(path)
        if key in seen:
            continue
        seen.add(key)
        unique.append(path)
    return unique


def find_config_file() -> Path | None:
    for path in candidate_config_paths():
        if path.is_file():
            return path
    return None


def _load_toml(path: Path) -> dict[str, Any]:
    try:
        import tomllib  # Python 3.11+
    except ModuleNotFoundError:  # pragma: no cover
        try:
            import tomli as tomllib  # type: ignore
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                f"TOML config requires Python 3.11+ or tomli (file: {path})"
            ) from exc
    with path.open("rb") as handle:
        data = tomllib.load(handle)
    if not isinstance(data, dict):
        raise ValueError("TOML root must be a table")
    return data


def _load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("JSON root must be an object")
    return data


def load_config_file(path: Path) -> dict[str, Any]:
    suffix = path.suffix.lower()
    if suffix == ".toml":
        return _load_toml(path)
    if suffix == ".json":
        return _load_json(path)
    # Peek for TOML vs JSON.
    head = path.read_text(encoding="utf-8", errors="replace").lstrip()[:1]
    if head == "{":
        return _load_json(path)
    return _load_toml(path)


def _merge_section(section: Any, payload: dict[str, Any] | None) -> Any:
    if not payload:
        return section
    allowed = {f.name for f in fields(section)}
    updates = {key: value for key, value in payload.items() if key in allowed}
    if not updates:
        return section
    return replace(section, **updates)


def _from_file_dict(raw: dict[str, Any], *, path: str | None) -> NlpConfig:
    cfg = NlpConfig(config_path=path)
    rpc = raw.get("rpc") if isinstance(raw.get("rpc"), dict) else raw
    files = raw.get("files") if isinstance(raw.get("files"), dict) else None
    code = raw.get("code") if isinstance(raw.get("code"), dict) else None
    agent = raw.get("agent") if isinstance(raw.get("agent"), dict) else None
    embed = raw.get("embed") if isinstance(raw.get("embed"), dict) else None
    debug = raw.get("debug")
    return replace(
        cfg,
        rpc=_merge_section(cfg.rpc, rpc if isinstance(rpc, dict) else None),
        files=_merge_section(cfg.files, files),
        code=_merge_section(cfg.code, code),
        agent=_merge_section(cfg.agent, agent),
        embed=_merge_section(cfg.embed, embed),
        debug=bool(debug) if isinstance(debug, bool) else cfg.debug,
        config_path=path,
    )


def _apply_env(cfg: NlpConfig) -> NlpConfig:
    rpc = replace(
        cfg.rpc,
        max_text_chars=_env_int(
            "SCRIBE_NLP_MAX_TEXT_CHARS", cfg.rpc.max_text_chars, minimum=1_000, maximum=2_000_000
        ),
        max_embed_batch=_env_int(
            "SCRIBE_NLP_MAX_EMBED_BATCH", cfg.rpc.max_embed_batch, minimum=1, maximum=2048
        ),
        max_report_documents=_env_int(
            "SCRIBE_NLP_MAX_REPORT_DOCUMENTS",
            cfg.rpc.max_report_documents,
            minimum=10,
            maximum=50_000,
        ),
        embed_cache_size=_env_int(
            "SCRIBE_NLP_EMBED_CACHE_SIZE", cfg.rpc.embed_cache_size, minimum=16, maximum=10_000
        ),
    )
    files = replace(
        cfg.files,
        max_file_bytes=_env_int(
            "SCRIBE_NLP_MAX_FILE_BYTES", cfg.files.max_file_bytes, minimum=64_000, maximum=200_000_000
        ),
        max_docx_xml_bytes=_env_int(
            "SCRIBE_NLP_MAX_DOCX_XML_BYTES",
            cfg.files.max_docx_xml_bytes,
            minimum=1_000_000,
            maximum=500_000_000,
        ),
        pdf_max_pages=_env_int(
            "SCRIBE_NLP_PDF_MAX_PAGES", cfg.files.pdf_max_pages, minimum=1, maximum=500
        ),
        scan_limit_default=_env_int(
            "SCRIBE_NLP_FILES_SCAN_LIMIT", cfg.files.scan_limit_default, minimum=10, maximum=5_000
        ),
        hybrid_alpha=_env_float(
            "SCRIBE_NLP_HYBRID_ALPHA", cfg.files.hybrid_alpha, minimum=0.0, maximum=1.0
        ),
        ann_min_chunks=_env_int(
            "SCRIBE_NLP_ANN_MIN_CHUNKS", cfg.files.ann_min_chunks, minimum=1, maximum=10_000
        ),
        files_api_base_url=_env_str("SCRIBE_FILES_API_URL", cfg.files.files_api_base_url),
    )
    code = replace(
        cfg.code,
        max_source_bytes=_env_int(
            "SCRIBE_NLP_MAX_SOURCE_BYTES",
            cfg.code.max_source_bytes,
            minimum=16_000,
            maximum=50_000_000,
        ),
        max_csv_bytes=_env_int(
            "SCRIBE_NLP_MAX_CSV_BYTES", cfg.code.max_csv_bytes, minimum=16_000, maximum=100_000_000
        ),
        max_csv_rows=_env_int(
            "SCRIBE_NLP_MAX_CSV_ROWS", cfg.code.max_csv_rows, minimum=10, maximum=100_000
        ),
        max_csv_cols=_env_int(
            "SCRIBE_NLP_MAX_CSV_COLS", cfg.code.max_csv_cols, minimum=1, maximum=2_048
        ),
        code_brief_max_symbols=_env_int(
            "SCRIBE_NLP_CODE_BRIEF_SYMBOLS",
            cfg.code.code_brief_max_symbols,
            minimum=1,
            maximum=100,
        ),
        code_brief_preview_lines=_env_int(
            "SCRIBE_NLP_CODE_BRIEF_PREVIEW",
            cfg.code.code_brief_preview_lines,
            minimum=1,
            maximum=80,
        ),
    )
    agent = replace(
        cfg.agent,
        tool_limit=_env_int(
            "SCRIBE_NLP_AGENT_TOOL_LIMIT", cfg.agent.tool_limit, minimum=1, maximum=6
        ),
        tool_limit_hard=_env_int(
            "SCRIBE_NLP_AGENT_TOOL_LIMIT_HARD", cfg.agent.tool_limit_hard, minimum=1, maximum=12
        ),
        brief_workers=_env_int(
            "SCRIBE_NLP_AGENT_BRIEF_WORKERS", cfg.agent.brief_workers, minimum=1, maximum=16
        ),
    )
    backend = _env_str("SCRIBE_EMBED_BACKEND", cfg.embed.default_backend).lower()
    if backend not in {"hash", "fast", "quality"}:
        backend = cfg.embed.default_backend
    embed = replace(
        cfg.embed,
        default_backend=backend,
        warmup_on_start=_env_bool("SCRIBE_NLP_WARMUP", cfg.embed.warmup_on_start),
    )
    debug = _env_bool("SCRIBE_NLP_DEBUG", cfg.debug)
    return replace(cfg, rpc=rpc, files=files, code=code, agent=agent, embed=embed, debug=debug)


def build_config(*, reload: bool = False) -> NlpConfig:
    global _CONFIG, _CONFIG_PATH
    if _CONFIG is not None and not reload:
        return _CONFIG

    path = find_config_file()
    cfg = NlpConfig()
    if path is not None:
        try:
            raw = load_config_file(path)
            cfg = _from_file_dict(raw, path=str(path))
            _CONFIG_PATH = str(path)
        except Exception as exc:  # noqa: BLE001
            # Keep defaults; surface path in snapshot for debugging.
            cfg = replace(cfg, config_path=f"{path} (error: {exc})")
            _CONFIG_PATH = cfg.config_path
    cfg = _apply_env(cfg)
    _CONFIG = cfg
    return cfg


def _publish_compat_constants(cfg: NlpConfig) -> None:
    global MAX_TEXT_CHARS, MAX_EMBED_BATCH, MAX_REPORT_DOCUMENTS, EMBED_CACHE_SIZE
    MAX_TEXT_CHARS = cfg.rpc.max_text_chars
    MAX_EMBED_BATCH = cfg.rpc.max_embed_batch
    MAX_REPORT_DOCUMENTS = cfg.rpc.max_report_documents
    EMBED_CACHE_SIZE = cfg.rpc.embed_cache_size


# Back-compat names used across the package.
MAX_TEXT_CHARS = 120_000
MAX_EMBED_BATCH = 128
MAX_REPORT_DOCUMENTS = 5_000
EMBED_CACHE_SIZE = 256


def get_config() -> NlpConfig:
    return build_config()


def reload_config() -> NlpConfig:
    cfg = build_config(reload=True)
    _publish_compat_constants(cfg)
    return cfg


_publish_compat_constants(build_config())
