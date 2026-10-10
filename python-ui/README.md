# Scribe Python UI

Python twin of [`crates/scribe-ui`](../crates/scribe-ui) — UI domain catalogs and pure helpers (stdlib-first).

Not a GUI framework. React/Dioxus still render chrome; this package shares ids, manifests, and string helpers with the NLP sidecar and scripts.

## Install

```bash
cd python-ui
pip install -e .
# optional better fuzzy ranking
pip install -e '.[fuzzy]'
```

## Dev

```bash
npm run ui:py:test
# or
PYTHONPATH=python-ui python3 -m unittest discover -s python-ui/tests -p 'test_*.py'
```

## Modules

| Module | Mirrors |
|--------|---------|
| `version` / `whats_new` / `settings_nav` / `privacy` / `docs_nav` | Rust catalogs |
| `agent_catalog` / `smart_filters` / `tag_meta` / `skin` / `routes` / `theme_presets` | Agent + chrome catalogs |
| `manifest` | `ui_manifest()` |
| `filenames` / `snippet` / `fuzzy` | Rust helpers |
| `heading_levels` / `paragraph_styles` | Editor catalogs |

Keep ids in sync with `crates/scribe-ui` and FE locale keys.
