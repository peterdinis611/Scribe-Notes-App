//! OpenAPI 3.0 spec + lightweight Swagger-style demo UI for the loopback Files API.

use serde_json::{json, Value};

pub fn openapi_document(port: u16) -> Value {
    let server_url = format!("http://127.0.0.1:{port}");
    json!({
        "openapi": "3.0.3",
        "info": {
            "title": "Scribe Files API",
            "description": "Loopback-only REST API for the Storage Mode files sandbox (`{documentsDir}/files/`). No auth. GraphQL at `/graphql`.",
            "version": "1.0.0"
        },
        "servers": [{ "url": server_url, "description": "Loopback (this machine only)" }],
        "tags": [
            { "name": "meta", "description": "Health and discovery" },
            { "name": "read", "description": "List, read, search" },
            { "name": "write", "description": "Create, mutate, delete" },
            { "name": "docs", "description": "Interactive API docs" }
        ],
        "paths": paths(),
        "components": {
            "schemas": {
                "Error": {
                    "type": "object",
                    "properties": { "error": { "type": "string" } },
                    "required": ["error"]
                },
                "FsEntry": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "name": { "type": "string" },
                        "kind": { "type": "string", "enum": ["file", "dir"] },
                        "sizeBytes": { "type": "integer" }
                    }
                }
            }
        }
    })
}

fn path_q() -> Value {
    json!({
        "name": "path",
        "in": "query",
        "required": false,
        "schema": { "type": "string", "default": "" },
        "description": "Relative path under files/ (no ..)"
    })
}

fn op(
    summary: &str,
    tag: &str,
    parameters: Value,
    request_body: Option<Value>,
) -> Value {
    let mut obj = json!({
        "summary": summary,
        "tags": [tag],
        "responses": {
            "200": {
                "description": "OK",
                "content": { "application/json": { "schema": { "type": "object" } } }
            },
            "400": {
                "description": "Bad request",
                "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Error" } } }
            }
        }
    });
    if !parameters.is_null() && parameters.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
        obj["parameters"] = parameters;
    }
    if let Some(body) = request_body {
        obj["requestBody"] = body;
    }
    obj
}

fn json_body(schema: Value, example: Value) -> Value {
    json!({
        "required": true,
        "content": {
            "application/json": {
                "schema": schema,
                "example": example
            }
        }
    })
}

fn paths() -> Value {
    json!({
        "/openapi.json": {
            "get": op("OpenAPI 3.0 document", "docs", json!([]), None)
        },
        "/docs": {
            "get": {
                "summary": "Swagger-style demo UI",
                "tags": ["docs"],
                "responses": {
                    "200": {
                        "description": "HTML playground",
                        "content": { "text/html": { "schema": { "type": "string" } } }
                    }
                }
            }
        },
        "/v1/fs/health": {
            "get": op("Health check + endpoint catalog", "meta", json!([]), None)
        },
        "/v1/fs/list": {
            "get": op("List directory entries", "read", json!([
                path_q(),
                {
                    "name": "recursive",
                    "in": "query",
                    "schema": { "type": "boolean", "default": false }
                },
                {
                    "name": "depth",
                    "in": "query",
                    "schema": { "type": "integer" }
                }
            ]), None)
        },
        "/v1/fs/tree": {
            "get": op("Directory tree", "read", json!([
                path_q(),
                { "name": "depth", "in": "query", "schema": { "type": "integer" } }
            ]), None)
        },
        "/v1/fs/stat": {
            "get": op("Stat a path", "read", json!([path_q()]), None)
        },
        "/v1/fs/exists": {
            "get": op("Check if path exists", "read", json!([path_q()]), None)
        },
        "/v1/fs/read": {
            "get": op("Read file as base64", "read", json!([path_q()]), None)
        },
        "/v1/fs/read-text": {
            "get": op("Read file as UTF-8 text", "read", json!([path_q()]), None)
        },
        "/v1/fs/read-json": {
            "get": op("Read and parse JSON file", "read", json!([path_q()]), None)
        },
        "/v1/fs/preview": {
            "get": op("Preview text (truncated)", "read", json!([
                path_q(),
                { "name": "maxChars", "in": "query", "schema": { "type": "integer" } }
            ]), None)
        },
        "/v1/fs/checksum": {
            "get": op("SHA-256 checksum", "read", json!([path_q()]), None)
        },
        "/v1/fs/search": {
            "get": op("Search files by name/query", "read", json!([
                {
                    "name": "query",
                    "in": "query",
                    "required": true,
                    "schema": { "type": "string" }
                },
                path_q(),
                { "name": "glob", "in": "query", "schema": { "type": "string" } },
                { "name": "limit", "in": "query", "schema": { "type": "integer" } }
            ]), None)
        },
        "/v1/fs/recent": {
            "get": op("Recently modified files", "read", json!([
                path_q(),
                { "name": "limit", "in": "query", "schema": { "type": "integer" } },
                {
                    "name": "filesOnly",
                    "in": "query",
                    "schema": { "type": "boolean", "default": true }
                }
            ]), None)
        },
        "/v1/fs/disk-usage": {
            "get": op("Disk usage under path", "read", json!([path_q()]), None)
        },
        "/v1/fs/mkdir": {
            "post": op(
                "Create directory",
                "write",
                json!([]),
                Some(json_body(
                    json!({
                        "type": "object",
                        "properties": { "path": { "type": "string" } },
                        "required": ["path"]
                    }),
                    json!({ "path": "scratch/demo" }),
                )),
            )
        },
        "/v1/fs/write-text": {
            "post": op(
                "Write UTF-8 text file",
                "write",
                json!([]),
                Some(json_body(
                    json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string" },
                            "text": { "type": "string" },
                            "overwrite": { "type": "boolean", "default": false }
                        },
                        "required": ["path", "text"]
                    }),
                    json!({ "path": "scratch/demo/hello.md", "text": "# hi\n", "overwrite": true }),
                )),
            )
        },
        "/v1/fs/write-json": {
            "post": op(
                "Write JSON file",
                "write",
                json!([]),
                Some(json_body(
                    json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string" },
                            "value": {},
                            "overwrite": { "type": "boolean" },
                            "pretty": { "type": "boolean", "default": true }
                        },
                        "required": ["path", "value"]
                    }),
                    json!({ "path": "scratch/demo/meta.json", "value": { "ok": true }, "overwrite": true }),
                )),
            )
        },
        "/v1/fs/write": {
            "post": op(
                "Write raw bytes (base64)",
                "write",
                json!([]),
                Some(json_body(
                    json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string" },
                            "dataBase64": { "type": "string" },
                            "overwrite": { "type": "boolean" }
                        },
                        "required": ["path", "dataBase64"]
                    }),
                    json!({ "path": "scratch/demo/bin.dat", "dataBase64": "aGVsbG8=", "overwrite": true }),
                )),
            )
        },
        "/v1/fs/append-text": {
            "post": op(
                "Append text to file",
                "write",
                json!([]),
                Some(json_body(
                    json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string" },
                            "text": { "type": "string" }
                        },
                        "required": ["path", "text"]
                    }),
                    json!({ "path": "scratch/demo/hello.md", "text": "more\n" }),
                )),
            )
        },
        "/v1/fs/append": {
            "post": op(
                "Append bytes (base64)",
                "write",
                json!([]),
                Some(json_body(
                    json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string" },
                            "dataBase64": { "type": "string" }
                        },
                        "required": ["path", "dataBase64"]
                    }),
                    json!({ "path": "scratch/demo/bin.dat", "dataBase64": "IQ==" }),
                )),
            )
        },
        "/v1/fs/touch": {
            "post": op(
                "Create empty file or update mtime",
                "write",
                json!([]),
                Some(json_body(
                    json!({
                        "type": "object",
                        "properties": { "path": { "type": "string" } },
                        "required": ["path"]
                    }),
                    json!({ "path": "scratch/demo/.keep" }),
                )),
            )
        },
        "/v1/fs/delete": {
            "post": op(
                "Delete file or directory",
                "write",
                json!([]),
                Some(json_body(
                    json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string" },
                            "recursive": { "type": "boolean", "default": false }
                        },
                        "required": ["path"]
                    }),
                    json!({ "path": "scratch/demo/hello.md", "recursive": false }),
                )),
            )
        },
        "/v1/fs/clear-dir": {
            "post": op(
                "Clear directory contents",
                "write",
                json!([]),
                Some(json_body(
                    json!({
                        "type": "object",
                        "properties": { "path": { "type": "string" } },
                        "required": ["path"]
                    }),
                    json!({ "path": "scratch/demo" }),
                )),
            )
        },
        "/v1/fs/rename": {
            "post": op(
                "Rename / move path",
                "write",
                json!([]),
                Some(json_body(
                    json!({
                        "type": "object",
                        "properties": {
                            "from": { "type": "string" },
                            "to": { "type": "string" }
                        },
                        "required": ["from", "to"]
                    }),
                    json!({ "from": "scratch/a.md", "to": "scratch/b.md" }),
                )),
            )
        },
        "/v1/fs/move-into": {
            "post": op(
                "Move into directory",
                "write",
                json!([]),
                Some(json_body(
                    json!({
                        "type": "object",
                        "properties": {
                            "from": { "type": "string" },
                            "dir": { "type": "string" }
                        },
                        "required": ["from", "dir"]
                    }),
                    json!({ "from": "scratch/a.md", "dir": "inbox" }),
                )),
            )
        },
        "/v1/fs/copy": {
            "post": op(
                "Copy file or directory",
                "write",
                json!([]),
                Some(json_body(
                    json!({
                        "type": "object",
                        "properties": {
                            "from": { "type": "string" },
                            "to": { "type": "string" },
                            "overwrite": { "type": "boolean" }
                        },
                        "required": ["from", "to"]
                    }),
                    json!({ "from": "scratch/a.md", "to": "scratch/a.copy.md", "overwrite": true }),
                )),
            )
        },
        "/v1/fs/ensure-defaults": {
            "post": op(
                "Ensure default sandbox folders",
                "write",
                json!([]),
                Some(json_body(json!({ "type": "object" }), json!({}))),
            )
        },
        "/graphql": {
            "get": {
                "summary": "GraphiQL playground",
                "tags": ["docs"],
                "responses": {
                    "200": {
                        "description": "HTML GraphiQL",
                        "content": { "text/html": { "schema": { "type": "string" } } }
                    }
                }
            },
            "post": op(
                "GraphQL query",
                "read",
                json!([]),
                Some(json_body(
                    json!({
                        "type": "object",
                        "properties": { "query": { "type": "string" } },
                        "required": ["query"]
                    }),
                    json!({ "query": "query { storageFsHealth { ok port } }" }),
                )),
            )
        }
    })
}

/// Self-contained Swagger-style explorer (no CDN) — Try-it against the live loopback server.
pub fn swagger_demo_html(port: u16) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Scribe Files API · Docs</title>
  <style>
    :root {{ color-scheme: dark; --bg:#12110f; --panel:#1a1916; --line:#333029;
      --ink:#e8e4dc; --muted:#9a9488; --accent:#c4a574; --get:#6ea8fe; --post:#49cc90; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      background: var(--bg); color: var(--ink); }}
    header {{ padding: 14px 18px; border-bottom: 1px solid var(--line);
      display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }}
    header strong {{ letter-spacing: 0.06em; text-transform: uppercase; font-size: 11px;
      color: var(--accent); }}
    header span {{ opacity: 0.7; font-size: 12px; }}
    header a {{ color: var(--get); }}
    main {{ display: grid; grid-template-columns: 280px 1fr; min-height: calc(100vh - 52px); }}
    @media (max-width: 860px) {{ main {{ grid-template-columns: 1fr; }} }}
    nav {{ border-right: 1px solid var(--line); padding: 12px; overflow: auto; max-height: calc(100vh - 52px); }}
    nav h2 {{ margin: 14px 0 6px; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }}
    nav button {{ display: block; width: 100%; text-align: left; margin: 0 0 4px; padding: 7px 8px;
      border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--ink);
      font: inherit; font-size: 11.5px; cursor: pointer; }}
    nav button:hover, nav button.is-active {{ background: var(--panel); border-color: var(--line); }}
    .m {{ display: inline-block; min-width: 42px; font-weight: 700; font-size: 10px; }}
    .m.get {{ color: var(--get); }} .m.post {{ color: var(--post); }}
    section {{ padding: 18px; overflow: auto; max-height: calc(100vh - 52px); }}
    .card {{ background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px; }}
    label {{ display: block; margin: 10px 0 4px; font-size: 11px; color: var(--muted); }}
    input, textarea {{ width: 100%; background: var(--bg); color: var(--ink); border: 1px solid var(--line);
      border-radius: 6px; padding: 8px 10px; font: inherit; font-size: 12px; }}
    textarea {{ min-height: 120px; }}
    .row {{ display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }}
    .go {{ background: var(--accent); color: #12110f; border: 0; border-radius: 6px;
      padding: 8px 14px; font-weight: 700; cursor: pointer; font: inherit; }}
    pre {{ background: var(--bg); border: 1px solid var(--line); border-radius: 8px;
      padding: 12px; overflow: auto; white-space: pre-wrap; font-size: 11.5px; margin: 12px 0 0; }}
    .status {{ font-size: 12px; color: var(--muted); }}
    .empty {{ color: var(--muted); font-size: 13px; }}
  </style>
</head>
<body>
  <header>
    <strong>Scribe Files API</strong>
    <span>http://127.0.0.1:{port}/docs · OpenAPI demo · loopback only</span>
    <a href="/openapi.json">openapi.json</a>
    <a href="/graphql">GraphiQL</a>
  </header>
  <main>
    <nav id="nav"><p class="empty">Loading openapi.json…</p></nav>
    <section id="panel"><p class="empty">Pick an operation.</p></section>
  </main>
  <script>
    const nav = document.getElementById('nav');
    const panel = document.getElementById('panel');
    let spec = null;
    let activeKey = null;

    function methodClass(m) {{ return m.toLowerCase() === 'post' ? 'post' : 'get'; }}

    function renderNav() {{
      const byTag = {{}};
      for (const [path, methods] of Object.entries(spec.paths || {{}})) {{
        for (const [method, op] of Object.entries(methods)) {{
          if (!['get','post','put','delete','patch'].includes(method)) continue;
          const tag = (op.tags && op.tags[0]) || 'other';
          (byTag[tag] ||= []).push({{ path, method, op }});
        }}
      }}
      const order = ['meta','read','write','docs','other'];
      const tags = [...order.filter(t => byTag[t]), ...Object.keys(byTag).filter(t => !order.includes(t))];
      nav.innerHTML = '';
      for (const tag of tags) {{
        const h = document.createElement('h2');
        h.textContent = tag;
        nav.appendChild(h);
        for (const item of byTag[tag]) {{
          const key = item.method + ':' + item.path;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = key === activeKey ? 'is-active' : '';
          btn.innerHTML = '<span class="m ' + methodClass(item.method) + '">' +
            item.method.toUpperCase() + '</span> ' + item.path;
          btn.onclick = () => {{ activeKey = key; renderNav(); renderOp(item); }};
          nav.appendChild(btn);
        }}
      }}
    }}

    function defaultBody(op) {{
      const ex = op.requestBody?.content?.['application/json']?.example;
      return ex ? JSON.stringify(ex, null, 2) : '{{}}';
    }}

    function renderOp(item) {{
      const {{ path, method, op }} = item;
      const params = op.parameters || [];
      const hasBody = Boolean(op.requestBody);
      let html = '<div class="card"><h1 style="margin:0 0 6px;font-size:16px">' +
        '<span class="m ' + methodClass(method) + '">' + method.toUpperCase() + '</span> ' +
        path + '</h1><p class="status">' + (op.summary || '') + '</p>';
      for (const p of params) {{
        const def = p.schema?.default ?? '';
        html += '<label>' + p.name + (p.required ? ' *' : '') +
          ' <span>(' + p.in + ')</span></label>' +
          '<input data-param="' + p.name + '" data-in="' + p.in + '" value="' +
          String(def).replace(/"/g, '&quot;') + '" placeholder="' + (p.description || p.name) + '"/>';
      }}
      if (hasBody) {{
        html += '<label>JSON body</label><textarea id="body">' +
          defaultBody(op).replace(/</g, '&lt;') + '</textarea>';
      }}
      html += '<div class="row"><button class="go" id="try" type="button">Try it</button>' +
        '<span class="status" id="meta"></span></div><pre id="out">Ready.</pre></div>';
      panel.innerHTML = html;
      document.getElementById('try').onclick = async () => {{
        const out = document.getElementById('out');
        const meta = document.getElementById('meta');
        out.textContent = 'Running…';
        try {{
          let url = path;
          const qs = new URLSearchParams();
          for (const input of panel.querySelectorAll('[data-param]')) {{
            if (input.dataset.in === 'query' && input.value !== '') {{
              qs.set(input.dataset.param, input.value);
            }}
          }}
          const q = qs.toString();
          if (q) url += (url.includes('?') ? '&' : '?') + q;
          const init = {{ method: method.toUpperCase(), headers: {{}} }};
          if (hasBody) {{
            init.headers['content-type'] = 'application/json';
            init.body = document.getElementById('body').value;
          }}
          const t0 = performance.now();
          const res = await fetch(url, init);
          const text = await res.text();
          meta.textContent = res.status + ' · ' + Math.round(performance.now() - t0) + ' ms';
          try {{ out.textContent = JSON.stringify(JSON.parse(text), null, 2); }}
          catch {{ out.textContent = text; }}
        }} catch (e) {{
          meta.textContent = 'error';
          out.textContent = String(e);
        }}
      }};
    }}

    (async () => {{
      try {{
        const res = await fetch('/openapi.json');
        spec = await res.json();
        renderNav();
        const first = Object.entries(spec.paths || {{}})[0];
        if (first) {{
          const [path, methods] = first;
          const method = Object.keys(methods).find(m => ['get','post'].includes(m));
          if (method) {{
            activeKey = method + ':' + path;
            renderNav();
            renderOp({{ path, method, op: methods[method] }});
          }}
        }}
      }} catch (e) {{
        nav.innerHTML = '<p class="empty">' + String(e) + '</p>';
      }}
    }})();
  </script>
</body>
</html>"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn openapi_has_core_paths() {
        let doc = openapi_document(8787);
        assert_eq!(doc["openapi"], "3.0.3");
        assert!(doc["paths"]["/v1/fs/health"]["get"].is_object());
        assert!(doc["paths"]["/v1/fs/write-text"]["post"].is_object());
        assert!(doc["paths"]["/docs"]["get"].is_object());
        assert_eq!(doc["servers"][0]["url"], "http://127.0.0.1:8787");
    }

    #[test]
    fn swagger_html_mentions_openapi() {
        let html = swagger_demo_html(8787);
        assert!(html.contains("/openapi.json"));
        assert!(html.contains("Try it"));
    }
}
