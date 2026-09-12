//! Minimal mobile capture HTML (inline, no external assets).

pub fn capture_page(token: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="light dark" />
  <title>Scribe · Capture</title>
  <style>
    :root {{
      --bg: #f4f1ea;
      --fg: #1c1917;
      --muted: #78716c;
      --accent: #0f766e;
      --card: #fffcf7;
      --border: #e7e5e4;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #0c0a09;
        --fg: #fafaf9;
        --muted: #a8a29e;
        --accent: #2dd4bf;
        --card: #1c1917;
        --border: #292524;
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
      padding: 24px 18px 40px;
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
    .brand {{
      font-size: 11px;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: var(--muted);
      margin: 0 0 6px;
    }}
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
    input, textarea {{
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: transparent;
      color: var(--fg);
      font: inherit;
      padding: 12px 12px;
    }}
    textarea {{ min-height: 160px; resize: vertical; }}
    button {{
      margin-top: 16px;
      width: 100%;
      border: 0;
      border-radius: 999px;
      background: var(--accent);
      color: #042f2e;
      font: inherit;
      font-weight: 700;
      padding: 14px 16px;
    }}
    button:disabled {{ opacity: .55; }}
    .status {{
      margin-top: 14px;
      min-height: 1.3em;
      font-size: .9rem;
      color: var(--muted);
    }}
    .status.ok {{ color: var(--accent); }}
    .status.err {{ color: #dc2626; }}
  </style>
</head>
<body>
  <main>
    <p class="brand">Scribe</p>
    <h1>Capture to Inbox</h1>
    <p class="lead">Notes land in the Inbox folder on your Mac. Same Wi‑Fi required.</p>
    <form id="form">
      <label for="title">Title (optional)</label>
      <input id="title" name="title" autocomplete="off" placeholder="Quick thought…" />
      <label for="body">Note</label>
      <textarea id="body" name="body" required placeholder="Write here…"></textarea>
      <button type="submit" id="submit">Send to Scribe</button>
      <p class="status" id="status" aria-live="polite"></p>
    </form>
  </main>
  <script>
    const TOKEN = {token_json};
    const form = document.getElementById('form');
    const status = document.getElementById('status');
    const submit = document.getElementById('submit');
    form.addEventListener('submit', async (event) => {{
      event.preventDefault();
      status.className = 'status';
      status.textContent = 'Sending…';
      submit.disabled = true;
      try {{
        const title = document.getElementById('title').value.trim();
        const body = document.getElementById('body').value;
        const res = await fetch('/api/capture?token=' + encodeURIComponent(TOKEN), {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{ title, body }}),
        }});
        const data = await res.json().catch(() => ({{}}));
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
        status.className = 'status ok';
        status.textContent = 'Saved as “' + (data.title || 'note') + '”.';
        document.getElementById('body').value = '';
        document.getElementById('title').value = '';
      }} catch (err) {{
        status.className = 'status err';
        status.textContent = String(err.message || err);
      }} finally {{
        submit.disabled = false;
      }}
    }});
  </script>
</body>
</html>
"#,
        token_json = serde_json::to_string(token).unwrap_or_else(|_| "\"\"".to_string()),
    )
}
