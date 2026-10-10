//! Mobile capture HTML (inline, no external assets).
//!
//! Features: title, kind, tags, note, live counter, draft autosave,
//! offline queue with automatic retry, list of recent captures,
//! Ctrl/Cmd+Enter to send.
//!
//! The POST body is now:
//! `{ "title": str, "body": str, "tags": [str], "kind": "note"|"task"|"idea" }`
//! Older servers that only read `title` and `body` keep working.

pub fn capture_page(token: &str) -> String {
    format!(
        r##"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" content="#0f766e" />
  <title>Scribe · Capture</title>
  <style>
    :root {{
      --bg: #f4f1ea;
      --fg: #1c1917;
      --muted: #78716c;
      --accent: #0f766e;
      --accent-fg: #042f2e;
      --card: #fffcf7;
      --border: #e7e5e4;
      --err: #dc2626;
      --warn: #b45309;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #0c0a09;
        --fg: #fafaf9;
        --muted: #a8a29e;
        --accent: #2dd4bf;
        --card: #1c1917;
        --border: #292524;
        --err: #f87171;
        --warn: #fbbf24;
      }}
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100dvh;
      font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
      background:
        radial-gradient(1200px 600px at 10% -10%, color-mix(in srgb, var(--accent) 18%, transparent), transparent),
        var(--bg);
      color: var(--fg);
      padding: calc(24px + env(safe-area-inset-top, 0px)) 18px calc(40px + env(safe-area-inset-bottom, 0px));
    }}
    main {{
      max-width: 420px;
      margin: 0 auto;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 22px 18px 18px;
      box-shadow: 0 18px 40px rgba(0,0,0,.08);
    }}
    header.top {{
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }}
    .brand {{
      font-size: 11px;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: var(--muted);
      margin: 0 0 6px;
    }}
    .pending {{
      font-size: .75rem;
      color: var(--warn);
      border: 1px solid currentColor;
      border-radius: 999px;
      padding: 2px 9px;
      background: transparent;
      margin: 0;
      width: auto;
      font-weight: 600;
    }}
    .pending[hidden] {{ display: none; }}
    h1 {{
      font-size: 1.55rem;
      margin: 0 0 8px;
      font-weight: 600;
    }}
    p.lead {{
      margin: 0 0 18px;
      color: var(--muted);
      font-size: .95rem;
      line-height: 1.45;
    }}
    label {{
      display: block;
      font-size: .78rem;
      font-weight: 600;
      margin: 12px 0 6px;
    }}
    input, textarea, select {{
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: transparent;
      color: var(--fg);
      font: inherit;
      padding: 12px 12px;
    }}
    input:focus-visible, textarea:focus-visible, select:focus-visible, button:focus-visible {{
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }}
    textarea {{ min-height: 160px; resize: vertical; line-height: 1.5; }}
    .row {{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }}
    .meta {{
      display: flex;
      justify-content: space-between;
      margin-top: 6px;
      font-size: .78rem;
      color: var(--muted);
    }}
    .hint {{ font-size: .75rem; color: var(--muted); margin: 6px 0 0; }}
    .chips {{ display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }}
    .chips:empty {{ display: none; }}
    .chip {{
      font-size: .78rem;
      padding: 3px 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      color: var(--muted);
    }}
    button.primary {{
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
    }}
    button:disabled {{ opacity: .55; }}
    .status {{
      margin-top: 14px;
      min-height: 1.3em;
      font-size: .9rem;
      color: var(--muted);
    }}
    .status.ok {{ color: var(--accent); }}
    .status.warn {{ color: var(--warn); }}
    .status.err {{ color: var(--err); }}
    section.recent {{
      margin-top: 22px;
      padding-top: 14px;
      border-top: 1px solid var(--border);
    }}
    section.recent h2 {{
      font-size: .9rem;
      margin: 0 0 8px;
      font-weight: 600;
    }}
    section.recent ul {{ list-style: none; margin: 0; padding: 0; }}
    section.recent li {{
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      font-size: .88rem;
    }}
    section.recent li:last-child {{ border-bottom: 0; }}
    section.recent .t {{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
    section.recent .when {{ color: var(--muted); white-space: nowrap; }}
    .empty {{ color: var(--muted); font-size: .85rem; margin: 0; }}
    @media (prefers-reduced-motion: no-preference) {{
      button.primary {{ transition: transform .12s ease; }}
      button.primary:active {{ transform: scale(.98); }}
    }}
  </style>
</head>
<body>
  <main>
    <header class="top">
      <p class="brand">Scribe</p>
      <button type="button" class="pending" id="pending" hidden title="Tap to retry now"></button>
    </header>
    <h1>Capture to Inbox</h1>
    <p class="lead">Notes land in the Inbox folder on your Mac. Same Wi‑Fi required; if the Mac is unreachable, notes wait on this phone and send later.</p>
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
          <input id="tags" name="tags" autocomplete="off" autocapitalize="none" placeholder="work, read" />
        </div>
      </div>
      <div class="chips" id="chips" aria-hidden="true"></div>

      <label for="title">Title (optional)</label>
      <input id="title" name="title" autocomplete="off" placeholder="Quick thought…" />

      <label for="body">Note</label>
      <textarea id="body" name="body" required placeholder="Write here…"></textarea>
      <div class="meta">
        <span id="count">0 words</span>
        <span id="draft">No draft</span>
      </div>

      <button type="submit" class="primary" id="submit">Send to Scribe</button>
      <p class="hint">Ctrl or Cmd + Enter also sends.</p>
      <p class="status" id="status" aria-live="polite"></p>
    </form>

    <section class="recent" aria-labelledby="recent-h">
      <h2 id="recent-h">Sent from this phone</h2>
      <ul id="recent"></ul>
      <p class="empty" id="recent-empty">Nothing sent yet.</p>
    </section>
  </main>
  <script>
    function tokenFromHash() {{
      try {{
        const h = (location.hash || '').replace(/^#/, '');
        const params = new URLSearchParams(h.includes('=') ? h : ('t=' + h));
        return (params.get('t') || params.get('token') || '').trim();
      }} catch (_) {{ return ''; }}
    }}
    const TOKEN = tokenFromHash() || {token_json};
    const KEY_DRAFT = 'scribe.draft';
    const KEY_QUEUE = 'scribe.queue';
    const KEY_RECENT = 'scribe.recent';
    const MAX_RECENT = 6;

    const $ = (id) => document.getElementById(id);
    const form = $('form');
    const statusEl = $('status');
    const submit = $('submit');
    const pendingEl = $('pending');

    function load(key, fallback) {{
      try {{
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      }} catch (_) {{
        return fallback;
      }}
    }}
    function save(key, value) {{
      try {{ localStorage.setItem(key, JSON.stringify(value)); }} catch (_) {{}}
    }}
    function drop(key) {{
      try {{ localStorage.removeItem(key); }} catch (_) {{}}
    }}

    function setStatus(kind, text) {{
      statusEl.className = kind ? 'status ' + kind : 'status';
      statusEl.textContent = text;
    }}

    function parseTags(raw) {{
      const seen = new Set();
      return raw
        .split(/[,\s]+/)
        .map((t) => t.replace(/^#+/, '').trim().toLowerCase())
        .filter((t) => t && !seen.has(t) && seen.add(t))
        .slice(0, 12);
    }}

    function renderChips() {{
      const chips = $('chips');
      chips.textContent = '';
      parseTags($('tags').value).forEach((t) => {{
        const span = document.createElement('span');
        span.className = 'chip';
        span.textContent = '#' + t;
        chips.appendChild(span);
      }});
    }}

    function renderCount() {{
      const text = $('body').value.trim();
      const words = text ? text.split(/\s+/).length : 0;
      $('count').textContent = words + (words === 1 ? ' word' : ' words') + ' · ' + text.length + ' chars';
    }}

    function currentFields() {{
      return {{
        kind: $('kind').value,
        tags: $('tags').value,
        title: $('title').value,
        body: $('body').value,
      }};
    }}

    function saveDraft() {{
      const f = currentFields();
      if (!f.title && !f.body && !f.tags) {{
        drop(KEY_DRAFT);
        $('draft').textContent = 'No draft';
        return;
      }}
      save(KEY_DRAFT, f);
      $('draft').textContent = 'Draft saved';
    }}

    function restoreDraft() {{
      const f = load(KEY_DRAFT, null);
      if (!f) return;
      $('kind').value = f.kind || 'note';
      $('tags').value = f.tags || '';
      $('title').value = f.title || '';
      $('body').value = f.body || '';
      if (f.body || f.title) $('draft').textContent = 'Draft restored';
    }}

    function clearForm() {{
      $('title').value = '';
      $('body').value = '';
      $('tags').value = '';
      drop(KEY_DRAFT);
      $('draft').textContent = 'No draft';
      renderChips();
      renderCount();
    }}

    function buildPayload(f) {{
      return {{
        title: f.title.trim(),
        body: f.body,
        tags: parseTags(f.tags),
        kind: f.kind,
      }};
    }}

    // Network or 5xx errors are retryable; 4xx (bad token, empty body) are not.
    async function send(payload) {{
      let res;
      try {{
        if (!TOKEN) {{
          const err = new Error('Missing capture token. Open the QR link from Scribe.');
          err.retryable = false;
          throw err;
        }}
        res = await fetch('/api/capture', {{
          method: 'POST',
          headers: {{
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + TOKEN,
          }},
          body: JSON.stringify(payload),
        }});
      }} catch (err) {{
        err.retryable = true;
        throw err;
      }}
      const data = await res.json().catch(() => ({{}}));
      if (!res.ok) {{
        const err = new Error(data.error || ('HTTP ' + res.status));
        err.retryable = res.status >= 500;
        throw err;
      }}
      return data;
    }}

    // ---- Recent list -------------------------------------------------------
    function timeAgo(ts) {{
      const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + ' min ago';
      if (s < 86400) return Math.floor(s / 3600) + ' h ago';
      return Math.floor(s / 86400) + ' d ago';
    }}

    function renderRecent() {{
      const items = load(KEY_RECENT, []);
      const list = $('recent');
      list.textContent = '';
      $('recent-empty').hidden = items.length > 0;
      items.forEach((it) => {{
        const li = document.createElement('li');
        const t = document.createElement('span');
        t.className = 't';
        t.textContent = it.title;
        const w = document.createElement('span');
        w.className = 'when';
        w.textContent = timeAgo(it.at);
        li.appendChild(t);
        li.appendChild(w);
        list.appendChild(li);
      }});
    }}

    function pushRecent(title) {{
      const items = load(KEY_RECENT, []);
      items.unshift({{ title: title || 'note', at: Date.now() }});
      save(KEY_RECENT, items.slice(0, MAX_RECENT));
      renderRecent();
    }}

    // ---- Offline queue -----------------------------------------------------
    function queue() {{ return load(KEY_QUEUE, []); }}

    function renderPending() {{
      const n = queue().length;
      pendingEl.hidden = n === 0;
      pendingEl.textContent = n + ' waiting';
    }}

    function enqueue(payload) {{
      const q = queue();
      q.push(payload);
      save(KEY_QUEUE, q);
      renderPending();
    }}

    let flushing = false;
    async function flushQueue() {{
      if (flushing) return;
      flushing = true;
      try {{
        let q = queue();
        let sent = 0;
        while (q.length) {{
          try {{
            const data = await send(q[0]);
            pushRecent(data.title || q[0].title);
            q.shift();
            sent += 1;
            save(KEY_QUEUE, q);
          }} catch (err) {{
            if (err.retryable) break;
            // Permanent failure: drop the item so it does not block the queue.
            q.shift();
            save(KEY_QUEUE, q);
            setStatus('err', 'Dropped a queued note: ' + err.message);
          }}
        }}
        renderPending();
        if (sent > 0) {{
          setStatus('ok', sent === 1 ? 'Sent 1 waiting note.' : 'Sent ' + sent + ' waiting notes.');
        }}
      }} finally {{
        flushing = false;
      }}
    }}

    // ---- Submit ------------------------------------------------------------
    form.addEventListener('submit', async (event) => {{
      event.preventDefault();
      const fields = currentFields();
      if (!fields.body.trim()) {{
        setStatus('err', 'Write something first.');
        return;
      }}
      const payload = buildPayload(fields);
      setStatus('', 'Sending…');
      submit.disabled = true;
      try {{
        const data = await send(payload);
        pushRecent(data.title || payload.title);
        setStatus('ok', 'Saved as “' + (data.title || payload.title || 'note') + '”.');
        clearForm();
        flushQueue();
      }} catch (err) {{
        if (err.retryable) {{
          enqueue(payload);
          clearForm();
          setStatus('warn', 'Mac not reachable. Kept on this phone and will retry.');
        }} else {{
          setStatus('err', String(err.message || err));
        }}
      }} finally {{
        submit.disabled = false;
      }}
    }});

    form.addEventListener('keydown', (event) => {{
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {{
        event.preventDefault();
        form.requestSubmit();
      }}
    }});

    $('tags').addEventListener('input', () => {{ renderChips(); saveDraft(); }});
    $('body').addEventListener('input', () => {{ renderCount(); saveDraft(); }});
    $('title').addEventListener('input', saveDraft);
    $('kind').addEventListener('change', saveDraft);
    pendingEl.addEventListener('click', flushQueue);
    window.addEventListener('online', flushQueue);
    document.addEventListener('visibilitychange', () => {{
      if (document.visibilityState === 'visible') {{ flushQueue(); renderRecent(); }}
    }});

    restoreDraft();
    renderChips();
    renderCount();
    renderRecent();
    renderPending();
    flushQueue();
  </script>
</body>
</html>
"##,
        token_json = serde_json::to_string(token).unwrap_or_else(|_| "\"\"".to_string()),
    )
}