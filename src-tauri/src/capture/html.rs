//! Mobile capture page (single inline HTML document, no external assets).
//!
//! Features:
//! - title, kind (note / task / idea), tags, note body
//! - live word / character counter, reading time, auto-growing textarea
//! - draft autosave and restore
//! - offline queue with exponential backoff, manual retry, and per-item discard
//! - queued notes get a stable `client_id`, so a server can de-duplicate retries
//! - tag suggestions built from the tags used most on this phone
//! - list of recent captures (sent and still waiting)
//! - Ctrl/Cmd+Enter to send, haptic feedback where supported
//!
//! POST body sent to `/api/capture`:
//!
//! ```json
//! {
//!   "title": "str",
//!   "body": "str",
//!   "tags": ["str"],
//!   "kind": "note" | "task" | "idea",
//!   "client_id": "str",
//!   "created_at": "RFC 3339 timestamp"
//! }
//! ```
//!
//! Older servers that only read `title` and `body` keep working as long as they
//! ignore unknown fields (the serde default).

/// The page template. `__TOKEN_JSON__` and `__NONCE_JSON__` are replaced with
/// JSON string literals by [`capture_page`]. A plain template (instead of
/// `format!`) means CSS and JS braces never need escaping.

const TEMPLATE: &str = r##"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" content="#0f766e" />
  <title>Scribe · Capture</title>
  <style>
    :root {
      --bg: #f4f1ea;
      --fg: #1c1917;
      --muted: #78716c;
      --accent: #0f766e;
      --accent-fg: #f0fdfa;
      --card: #fffcf7;
      --border: #e7e5e4;
      --err: #dc2626;
      --warn: #b45309;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0c0a09;
        --fg: #fafaf9;
        --muted: #a8a29e;
        --accent: #2dd4bf;
        --accent-fg: #042f2e;
        --card: #1c1917;
        --border: #292524;
        --err: #f87171;
        --warn: #fbbf24;
      }
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100dvh;
      font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
      background:
        radial-gradient(1200px 600px at 10% -10%, color-mix(in srgb, var(--accent) 18%, transparent), transparent),
        var(--bg);
      color: var(--fg);
      padding: calc(24px + env(safe-area-inset-top, 0px)) 18px calc(40px + env(safe-area-inset-bottom, 0px));
    }

    main {
      max-width: 420px;
      margin: 0 auto;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 22px 18px 18px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, .08);
    }

    header.top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }

    .brand {
      font-size: 11px;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: var(--muted);
      margin: 0 0 6px;
    }

    h1 { font-size: 1.55rem; margin: 0 0 8px; font-weight: 600; }

    p.lead {
      margin: 0 0 18px;
      color: var(--muted);
      font-size: .95rem;
      line-height: 1.45;
    }

    label {
      display: block;
      font-size: .78rem;
      font-weight: 600;
      margin: 12px 0 6px;
    }

    input, textarea, select {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: transparent;
      color: var(--fg);
      font: inherit;
      padding: 12px;
    }

    input:focus-visible, textarea:focus-visible, select:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    textarea {
      min-height: 160px;
      max-height: 55dvh;
      resize: vertical;
      line-height: 1.5;
    }

    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

    .meta {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-top: 6px;
      font-size: .78rem;
      color: var(--muted);
    }

    .hint { font-size: .75rem; color: var(--muted); margin: 6px 0 0; }

    /* Tags ---------------------------------------------------------------- */
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .chips:empty { display: none; }

    .chip {
      font: inherit;
      font-size: .78rem;
      padding: 3px 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
    }

    button.chip { cursor: pointer; }
    .chip.on {
      color: var(--accent);
      border-color: var(--accent);
    }

    /* Buttons ------------------------------------------------------------- */
    button.primary {
      margin-top: 16px;
      width: 100%;
      border: 0;
      border-radius: 999px;
      background: var(--accent);
      color: var(--accent-fg);
      font: inherit;
      font-weight: 700;
      padding: 14px 16px;
      cursor: pointer;
    }

    button.link {
      border: 0;
      background: none;
      color: var(--muted);
      font: inherit;
      font-size: .78rem;
      text-decoration: underline;
      padding: 0;
      cursor: pointer;
    }

    button:disabled { opacity: .55; }

    .pending {
      font-size: .75rem;
      color: var(--warn);
      border: 1px solid currentColor;
      border-radius: 999px;
      padding: 2px 9px;
      background: transparent;
      margin: 0;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
    }
    .pending[hidden] { display: none; }

    /* Status -------------------------------------------------------------- */
    .status {
      margin-top: 14px;
      min-height: 1.3em;
      font-size: .9rem;
      color: var(--muted);
    }
    .status.ok { color: var(--accent); }
    .status.warn { color: var(--warn); }
    .status.err { color: var(--err); }

    .conn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: .75rem;
      color: var(--muted);
    }
    .conn::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent);
    }
    .conn.off::before { background: var(--warn); }

    /* Recent -------------------------------------------------------------- */
    section.recent {
      margin-top: 22px;
      padding-top: 14px;
      border-top: 1px solid var(--border);
    }

    .recent-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 8px;
    }

    section.recent h2 { font-size: .9rem; margin: 0; font-weight: 600; }
    section.recent ul { list-style: none; margin: 0; padding: 0; }

    section.recent li {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      font-size: .88rem;
    }
    section.recent li:last-child { border-bottom: 0; }

    section.recent .t {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    section.recent .kind { color: var(--muted); font-size: .75rem; margin-right: 6px; }
    section.recent .when { color: var(--muted); white-space: nowrap; font-size: .8rem; }
    section.recent li.queued .when { color: var(--warn); }

    .empty { color: var(--muted); font-size: .85rem; margin: 0; }

    @media (prefers-reduced-motion: no-preference) {
      button.primary { transition: transform .12s ease; }
      button.primary:active { transform: scale(.98); }
    }
  </style>
</head>
<body>
  <main>
    <header class="top">
      <p class="brand">Scribe</p>
      <button type="button" class="pending" id="pending" hidden title="Tap to retry now"></button>
    </header>

    <h1>Capture to Inbox</h1>
    <p class="lead">
      Notes land in the Inbox folder on your Mac. Same Wi‑Fi required; if the Mac is
      unreachable, notes wait on this phone and send later.
    </p>

    <form id="form">
      <div class="row">
        <div>
          <label for="kind">Type</label>
          <select id="kind" name="kind">
            <option value="note">Note</option>
            <option value="task">Task</option>
            <option value="idea">Idea</option>
          </select>
        </div>
        <div>
          <label for="tags">Tags</label>
          <input id="tags" name="tags" autocomplete="off" autocapitalize="none"
                 placeholder="work, read" />
        </div>
      </div>
      <div class="chips" id="chips" aria-label="Tags in this note"></div>
      <div class="chips" id="suggest" aria-label="Frequently used tags"></div>

      <label for="title">Title (optional)</label>
      <input id="title" name="title" autocomplete="off" placeholder="Quick thought…" />

      <label for="body">Note</label>
      <textarea id="body" name="body" required placeholder="Write here…"></textarea>
      <div class="meta">
        <span id="count">0 words</span>
        <span id="draft">No draft</span>
      </div>

      <button type="submit" class="primary" id="submit">Send to Scribe</button>
      <div class="meta">
        <span class="hint">Ctrl or Cmd + Enter also sends.</span>
        <button type="button" class="link" id="discard" hidden>Discard draft</button>
      </div>
      <p class="status" id="status" aria-live="polite"></p>
    </form>

    <section class="recent" aria-labelledby="recent-h">
      <div class="recent-head">
        <h2 id="recent-h">Sent from this phone</h2>
        <span class="conn" id="conn">Online</span>
      </div>
      <ul id="recent"></ul>
      <p class="empty" id="recent-empty">Nothing sent yet.</p>
    </section>
  </main>

  <script>
    'use strict';

    // ---- Config ----------------------------------------------------------
    function tokenFromHash() {
      try {
        const h = (location.hash || '').replace(/^#/, '');
        const params = new URLSearchParams(h.includes('=') ? h : ('t=' + h));
        return (params.get('t') || params.get('token') || '').trim();
      } catch (_) { return ''; }
    }

    const TOKEN = tokenFromHash() || __TOKEN_JSON__;
    let FORM_NONCE = __NONCE_JSON__;

    const KEY_DRAFT = 'scribe.draft';
    const KEY_QUEUE = 'scribe.queue';
    const KEY_RECENT = 'scribe.recent';
    const KEY_TAGS = 'scribe.tagcount';
    const MAX_RECENT = 8;
    const MAX_TAGS = 12;
    const MAX_SUGGESTED = 6;
    const BACKOFF_BASE_MS = 3000;
    const BACKOFF_MAX_MS = 60000;

    const PLACEHOLDERS = {
      note: 'Write here…',
      task: 'What needs doing?',
      idea: 'What if…',
    };

    // ---- DOM / storage helpers -------------------------------------------
    const $ = (id) => document.getElementById(id);
    const form = $('form');
    const statusEl = $('status');
    const submit = $('submit');
    const pendingEl = $('pending');
    const bodyEl = $('body');

    function load(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (_) {
        return fallback;
      }
    }
    function save(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
    }
    function drop(key) {
      try { localStorage.removeItem(key); } catch (_) {}
    }

    function setStatus(kind, text) {
      statusEl.className = kind ? 'status ' + kind : 'status';
      statusEl.textContent = text;
    }

    function haptic(pattern) {
      try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
    }

    function newId() {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    // ---- Tags ------------------------------------------------------------
    function parseTags(raw) {
      const seen = new Set();
      return raw
        .split(/[,\s]+/)
        .map((t) => t.replace(/^#+/, '').trim().toLowerCase())
        .filter((t) => t && !seen.has(t) && seen.add(t))
        .slice(0, MAX_TAGS);
    }

    function renderChips() {
      const chips = $('chips');
      chips.textContent = '';
      parseTags($('tags').value).forEach((t) => {
        const span = document.createElement('span');
        span.className = 'chip on';
        span.textContent = '#' + t;
        chips.appendChild(span);
      });
    }

    function bumpTagCounts(tags) {
      const counts = load(KEY_TAGS, {});
      tags.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
      save(KEY_TAGS, counts);
    }

    function toggleTag(tag) {
      const current = parseTags($('tags').value);
      const next = current.includes(tag)
        ? current.filter((t) => t !== tag)
        : current.concat(tag);
      $('tags').value = next.join(', ');
      renderChips();
      renderSuggestions();
      saveDraft();
    }

    function renderSuggestions() {
      const box = $('suggest');
      box.textContent = '';
      const active = new Set(parseTags($('tags').value));
      const counts = load(KEY_TAGS, {});
      Object.keys(counts)
        .sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))
        .slice(0, MAX_SUGGESTED)
        .forEach((tag) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'chip' + (active.has(tag) ? ' on' : '');
          btn.textContent = '#' + tag;
          btn.setAttribute('aria-pressed', active.has(tag) ? 'true' : 'false');
          btn.addEventListener('click', () => toggleTag(tag));
          box.appendChild(btn);
        });
    }

    // ---- Counter / textarea ----------------------------------------------
    function renderCount() {
      const text = bodyEl.value.trim();
      const words = text ? text.split(/\s+/).length : 0;
      let out = words + (words === 1 ? ' word' : ' words') + ' · ' + text.length + ' chars';
      if (words >= 200) out += ' · ~' + Math.max(1, Math.round(words / 200)) + ' min read';
      $('count').textContent = out;
    }

    function autoGrow() {
      bodyEl.style.height = 'auto';
      const max = Math.round(window.innerHeight * 0.55);
      bodyEl.style.height = Math.min(bodyEl.scrollHeight + 2, max) + 'px';
    }

    function applyKind() {
      bodyEl.placeholder = PLACEHOLDERS[$('kind').value] || PLACEHOLDERS.note;
    }

    // ---- Draft -----------------------------------------------------------
    function currentFields() {
      return {
        kind: $('kind').value,
        tags: $('tags').value,
        title: $('title').value,
        body: bodyEl.value,
      };
    }

    function saveDraft() {
      const f = currentFields();
      const empty = !f.title && !f.body && !f.tags;
      $('discard').hidden = empty;
      if (empty) {
        drop(KEY_DRAFT);
        $('draft').textContent = 'No draft';
        return;
      }
      save(KEY_DRAFT, f);
      $('draft').textContent = 'Draft saved';
    }

    function restoreDraft() {
      const f = load(KEY_DRAFT, null);
      if (!f) return;
      $('kind').value = f.kind || 'note';
      $('tags').value = f.tags || '';
      $('title').value = f.title || '';
      bodyEl.value = f.body || '';
      if (f.body || f.title) {
        $('draft').textContent = 'Draft restored';
        $('discard').hidden = false;
      }
    }

    function clearForm() {
      $('title').value = '';
      bodyEl.value = '';
      $('tags').value = '';
      drop(KEY_DRAFT);
      $('draft').textContent = 'No draft';
      $('discard').hidden = true;
      renderChips();
      renderSuggestions();
      renderCount();
      autoGrow();
    }

    function buildPayload(f) {
      return {
        title: f.title.trim(),
        body: f.body,
        tags: parseTags(f.tags),
        kind: f.kind,
        client_id: newId(),
        created_at: new Date().toISOString(),
      };
    }

    // ---- Network ---------------------------------------------------------
    // Network failures and 5xx are retryable; 4xx (bad token, empty body) are not.
    async function send(payload) {
      if (!TOKEN) {
        const err = new Error('Missing capture token. Open the QR link from Scribe.');
        err.retryable = false;
        throw err;
      }
      if (!FORM_NONCE) {
        const err = new Error('Missing form nonce. Reload the capture page.');
        err.retryable = false;
        throw err;
      }

      let res;
      try {
        res = await fetch('/api/capture', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + TOKEN,
            'X-Scribe-Capture-Nonce': FORM_NONCE,
          },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        err.retryable = true;
        throw err;
      }

      const data = await res.json().catch(() => ({}));
      if (data && data.nonce) FORM_NONCE = data.nonce;
      if (!res.ok) {
        const err = new Error(data.error || ('HTTP ' + res.status));
        err.retryable = res.status >= 500;
        throw err;
      }
      return data;
    }

    // ---- Recent list -----------------------------------------------------
    function timeAgo(ts) {
      const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + ' min ago';
      if (s < 86400) return Math.floor(s / 3600) + ' h ago';
      return Math.floor(s / 86400) + ' d ago';
    }

    function recentRow(title, kind, whenText, queued) {
      const li = document.createElement('li');
      if (queued) li.className = 'queued';

      const t = document.createElement('span');
      t.className = 't';
      const k = document.createElement('span');
      k.className = 'kind';
      k.textContent = kind;
      t.appendChild(k);
      t.appendChild(document.createTextNode(title));

      const w = document.createElement('span');
      w.className = 'when';
      w.textContent = whenText;

      li.appendChild(t);
      li.appendChild(w);
      return li;
    }

    function renderRecent() {
      const list = $('recent');
      list.textContent = '';

      const waiting = queue();
      const sent = load(KEY_RECENT, []);

      waiting.slice().reverse().forEach((item) => {
        const p = item.payload;
        list.appendChild(recentRow(p.title || firstLine(p.body), p.kind, 'waiting', true));
      });
      sent.forEach((it) => {
        list.appendChild(recentRow(it.title, it.kind || 'note', timeAgo(it.at), false));
      });

      $('recent-empty').hidden = list.children.length > 0;
    }

    function firstLine(text) {
      const line = (text || '').trim().split('\n')[0];
      return line.length > 60 ? line.slice(0, 57) + '…' : (line || 'note');
    }

    function pushRecent(title, kind) {
      const items = load(KEY_RECENT, []);
      items.unshift({ title: title || 'note', kind: kind || 'note', at: Date.now() });
      save(KEY_RECENT, items.slice(0, MAX_RECENT));
    }

    // ---- Offline queue ---------------------------------------------------
    // Item shape: { id, payload, at, tries }. Older builds stored bare payloads;
    // those are migrated on read.
    function queue() {
      const raw = load(KEY_QUEUE, []);
      return raw.map((item) => {
        if (item && item.payload) return item;
        const payload = Object.assign({}, item);
        if (!payload.client_id) payload.client_id = newId();
        return { id: payload.client_id, payload, at: Date.now(), tries: 0 };
      });
    }

    function saveQueue(q) { save(KEY_QUEUE, q); }

    function renderPending() {
      const n = queue().length;
      pendingEl.hidden = n === 0;
      pendingEl.textContent = n + ' waiting · retry';
    }

    function enqueue(payload) {
      const q = queue();
      q.push({ id: payload.client_id, payload, at: Date.now(), tries: 0 });
      saveQueue(q);
      renderPending();
      renderRecent();
      scheduleRetry();
    }

    let flushing = false;
    let retryTimer = null;

    function scheduleRetry() {
      clearTimeout(retryTimer);
      const q = queue();
      if (!q.length) return;
      const tries = Math.max.apply(null, q.map((i) => i.tries || 0));
      const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(2, tries));
      retryTimer = setTimeout(flushQueue, delay);
    }

    async function flushQueue() {
      if (flushing) return;
      flushing = true;
      clearTimeout(retryTimer);
      try {
        const q = queue();
        let sent = 0;
        let dropped = 0;
        let lastError = '';

        while (q.length) {
          const item = q[0];
          try {
            const data = await send(item.payload);
            pushRecent(data.title || item.payload.title || firstLine(item.payload.body),
                       item.payload.kind);
            q.shift();
            sent += 1;
            saveQueue(q);
            setOnline(true);
          } catch (err) {
            if (err.retryable) {
              item.tries = (item.tries || 0) + 1;
              saveQueue(q);
              setOnline(false);
              break;
            }
            // Permanent failure: drop it so it cannot block the queue.
            q.shift();
            dropped += 1;
            lastError = err.message;
            saveQueue(q);
          }
        }

        renderPending();
        renderRecent();

        if (dropped > 0) {
          setStatus('err', dropped + ' queued note' + (dropped === 1 ? '' : 's') +
                           ' rejected: ' + lastError);
        } else if (sent > 0) {
          haptic(15);
          setStatus('ok', sent === 1 ? 'Sent 1 waiting note.' : 'Sent ' + sent + ' waiting notes.');
        }
      } finally {
        flushing = false;
        scheduleRetry();
      }
    }

    // ---- Connection indicator --------------------------------------------
    function setOnline(ok) {
      const el = $('conn');
      el.textContent = ok ? 'Online' : 'Mac unreachable';
      el.className = ok ? 'conn' : 'conn off';
    }

    // ---- Submit ----------------------------------------------------------
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fields = currentFields();
      if (!fields.body.trim()) {
        setStatus('err', 'Write something first.');
        bodyEl.focus();
        return;
      }

      const payload = buildPayload(fields);
      setStatus('', 'Sending…');
      submit.disabled = true;

      try {
        const data = await send(payload);
        const title = data.title || payload.title || firstLine(payload.body);
        pushRecent(title, payload.kind);
        bumpTagCounts(payload.tags);
        setOnline(true);
        haptic(15);
        setStatus('ok', 'Saved as “' + title + '”.');
        clearForm();
        renderRecent();
        flushQueue();
      } catch (err) {
        if (err.retryable) {
          bumpTagCounts(payload.tags);
          enqueue(payload);
          clearForm();
          setOnline(false);
          haptic([10, 40, 10]);
          setStatus('warn', 'Mac not reachable. Kept on this phone and will retry.');
        } else {
          haptic([30, 40, 30]);
          setStatus('err', String(err.message || err));
        }
      } finally {
        submit.disabled = false;
      }
    });

    // ---- Events ----------------------------------------------------------
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    $('tags').addEventListener('input', () => {
      renderChips();
      renderSuggestions();
      saveDraft();
    });
    bodyEl.addEventListener('input', () => { renderCount(); autoGrow(); saveDraft(); });
    $('title').addEventListener('input', saveDraft);
    $('kind').addEventListener('change', () => { applyKind(); saveDraft(); });

    $('discard').addEventListener('click', () => {
      if (!window.confirm('Discard this draft?')) return;
      clearForm();
      setStatus('', 'Draft discarded.');
    });

    pendingEl.addEventListener('click', flushQueue);

    window.addEventListener('online', flushQueue);
    window.addEventListener('offline', () => setOnline(false));
    window.addEventListener('resize', autoGrow);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        flushQueue();
        renderRecent();
      }
    });

    // ---- Boot ------------------------------------------------------------
    restoreDraft();
    applyKind();
    renderChips();
    renderSuggestions();
    renderCount();
    autoGrow();
    renderRecent();
    renderPending();
    setOnline(navigator.onLine !== false);
    flushQueue();
  </script>
</body>
</html>
"##;

/// Serialise a string as a JSON literal that is safe to embed inside an inline
/// `<script>` element.
///
/// `serde_json` does not escape `<`, so a value containing `</script>` would
/// close the script block early. U+2028 / U+2029 are escaped as well, for
/// parsers that still treat them as line terminators.
fn json_for_script(value: &str) -> String {
    serde_json::to_string(value)
        .unwrap_or_else(|_| "\"\"".into())
        .replace("</", "<\\/")
        .replace("<!--", "<\\!--")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029")
}

/// Render the mobile capture page with the given bearer `token` and form
/// `form_nonce` embedded as JSON string literals.
pub fn capture_page(token: &str, form_nonce: &str) -> String {
    TEMPLATE
        .replace("__TOKEN_JSON__", &json_for_script(token))
        .replace("__NONCE_JSON__", &json_for_script(form_nonce))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embeds_token_and_nonce() {
        let html = capture_page("tok123", "nonce456");
        assert!(html.contains("\"tok123\""));
        assert!(html.contains("\"nonce456\""));
        assert!(!html.contains("__TOKEN_JSON__"));
        assert!(!html.contains("__NONCE_JSON__"));
    }

    #[test]
    fn script_breakout_is_escaped() {
        let html = capture_page("</script><script>alert(1)</script>", "n");
        assert!(!html.contains("</script><script>alert(1)"));
        assert!(html.contains("<\\/script>"));
    }

    #[test]
    fn json_literal_handles_quotes_and_separators() {
        let out = json_for_script("a\"b\u{2028}c");
        assert_eq!(out, "\"a\\\"b\\u2028c\"");
    }

    #[test]
    fn page_is_a_single_document() {
        let html = capture_page("t", "n");
        assert!(html.starts_with("<!DOCTYPE html>"));
        assert_eq!(html.matches("<script>").count(), 1);
    }
}