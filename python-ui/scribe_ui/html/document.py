"""Full HTML document wrapper (parity with Rust ``render::shell``)."""

from __future__ import annotations

from html import escape
from importlib import resources
from pathlib import Path

BRIDGE_JS = r"""
(function () {
  var ALLOWED = {
    'surface-closed': 1,
    'whats-new-acked': 1,
    'welcome-new-document': 1,
    'welcome-today': 1,
    'welcome-import': 1,
    'welcome-open-docs': 1,
    'welcome-open-document': 1,
    'about-replay-tour': 1,
    'about-open-privacy': 1,
    'docs-open-topic': 1
  };

  function emit(event, arg) {
    if (!event || !ALLOWED[event]) return;
    var payload = { event: event, arg: arg || null };
    try {
      if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
        window.__TAURI__.core.invoke('ui_surface_event', { payload: payload });
        return;
      }
    } catch (e) {}
    try {
      if (window.parent && window.parent !== window) {
        var target = window.location.origin && window.location.origin !== 'null'
          ? window.location.origin
          : window.parent.location.origin;
        window.parent.postMessage({ source: 'scribe-ui', ...payload }, target);
      }
    } catch (e2) {}
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-sui-event]');
    if (!el) return;
    ev.preventDefault();
    emit(el.getAttribute('data-sui-event'), el.getAttribute('data-sui-arg'));
  });

  var filter = document.querySelector('[data-sui-filter="docs"]');
  if (filter) {
    filter.addEventListener('input', function () {
      var q = (filter.value || '').trim().toLowerCase();
      document.querySelectorAll('.docs-topic').forEach(function (node) {
        var text = (node.textContent || '').toLowerCase();
        node.style.display = !q || text.indexOf(q) !== -1 ? '' : 'none';
      });
    });
  }

  window.scribeUiBridge = { emit: emit };
})();
"""


def chrome_css() -> str:
    """Load shared chrome.css shipped next to this package."""
    try:
        return resources.files(__package__).joinpath("chrome.css").read_text(encoding="utf-8")
    except (FileNotFoundError, TypeError, AttributeError, OSError):
        here = Path(__file__).with_name("chrome.css")
        return here.read_text(encoding="utf-8")


def wrap_document(body_html: str, surface_id: str, *, lang: str = "en") -> str:
    surface = escape(surface_id, quote=True)
    return f"""<!doctype html>
<html lang="{escape(lang, quote=True)}" data-sui-surface="{surface}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Scribe UI · {escape(surface_id)}</title>
<style>{chrome_css()}</style>
</head>
<body>
<div class="sui-root" id="scribe-ui-bridge">
  <div class="sui-toolbar">
    <button type="button" data-sui-event="surface-closed">Close</button>
  </div>
  {body_html}
</div>
<script>{BRIDGE_JS}</script>
</body>
</html>
"""
