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
npm run ui:py:html -- whats-new > /tmp/whats-new.html
# or
PYTHONPATH=python-ui python3 -m unittest discover -s python-ui/tests -p 'test_*.py'
```

## HTML chrome

```python
from scribe_ui.html import render_surface, sui_button, el, text

html = render_surface("whats-new", version="3.5.0")  # full document + chrome.css
fragment = render_surface("welcome", full_document=False)
button = sui_button("New", event="welcome-new-document", variant="primary").render()
```

Local AI RPC: `render_ui_surface` `{ surface, strings?, version?, fragment? }` → `{ html, engine: "python-ui" }`.
Markup uses the same `data-sui-event` bridge as Rust/Dioxus surfaces.

## Modules

| Module | Mirrors |
|--------|---------|
| `version` / `whats_new` / `settings_nav` / `privacy` / `docs_nav` | Rust catalogs |
| `agent_catalog` / `smart_filters` / `tag_meta` / `skin` / `routes` / `theme_presets` | Agent + chrome catalogs |
| `manifest` | `ui_manifest()` |
| `filenames` / `snippet` / `fuzzy` | Rust helpers |
| `heading_levels` / `paragraph_styles` | Editor catalogs |

Keep ids in sync with `crates/scribe-ui` and FE locale keys.
