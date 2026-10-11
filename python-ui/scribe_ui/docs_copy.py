"""English fallback copy for in-app Docs (mirrors ``settings.docs`` in en.json)."""

from __future__ import annotations

from typing import TypedDict


class DocsTopicCopy(TypedDict):
    title: str
    summary: str
    paragraphs: list[str]
    points: list[str]


DOCS_PAGE = {
    "pageTitle": "Scribe {{version}}",
    "pageDescription": (
        "A field guide to writing, linking, and keeping your library on this Mac "
        "— Local AI and agents when you want them."
    ),
    "searchPlaceholder": "Search topics…",
}

DOCS_GROUP_LABELS: dict[str, str] = {
    "basics": "Basics",
    "organize": "Organize",
    "write": "Write",
    "power": "Power tools",
}

DOCS_TOPICS: dict[str, DocsTopicCopy] = {
    "overview": {
        "title": "What is Scribe {{version}}?",
        "summary": "Write documents. Link notes. Stay local.",
        "paragraphs": [
            "Scribe {{version}} is a local document editor for macOS. Write and export on this Mac — your library lives in SQLite, with optional .scribe backups on disk.",
            "As notes grow, link them with wiki links. Specialist agents, Local AI, Revision AI, the connection map, and MCP (Cursor / Claude) are power tools — useful when you need them, not required to start writing.",
        ],
        "points": [
            "{{version}} highlights — specialist agents, handoffs, digests & recipes, calendar spawn, files ingest",
            "Everything below works offline except optional embeds or MCP hosts you choose to connect",
        ],
    },
    "privacy": {
        "title": "Privacy",
        "summary": "What stays on this Mac",
        "paragraphs": [
            "Scribe stores your library locally. There is no Scribe account and no analytics sent to the developer.",
            "Optional features you start — Google Fonts, remote embeds, MCP hosts, or mobile capture on your LAN — are described in Settings → Privacy.",
        ],
        "points": [],
    },
    "documents": {
        "title": "Documents and saving",
        "summary": "Create notes and trust auto-save",
        "paragraphs": [
            "Create documents from New, templates, Demo, Quick note, or Journal. Edits auto-save to the app database."
        ],
        "points": [
            "A green Saved indicator means the in-app copy is current.",
            "Disk .scribe writes can fail without losing your work — check Settings → Storage if you see a disk warning.",
        ],
    },
    "library": {
        "title": "Library",
        "summary": "Folders, favorites, tags, and pins",
        "paragraphs": [
            "The left Library sidebar organizes your notes. Pin documents or folders from the tree or command palette so they stay easy to reach."
        ],
        "points": [
            "Folders — nested folder tree; pin important folders to the top",
            "Favorites — starred documents",
            "Tags — filter by tags",
            "Link graph — visual map of wiki links",
        ],
    },
    "linkGraph": {
        "title": "Link graph",
        "summary": "See how documents connect",
        "paragraphs": [
            "Library → Link graph shows documents connected by wiki links. The summary line reports documents, links, and orphans."
        ],
        "points": [
            "Around — only the active document and its neighbors",
            "Orphans — documents with no wiki links (shown off the linked cluster)",
            "Zoom / Reset — pan and zoom the canvas; reset restores the default view",
            "An empty canvas with Orphans on usually means you only have unlinked notes and no edges yet",
        ],
    },
    "wikiLinks": {
        "title": "Wiki links",
        "summary": "Connect notes by title",
        "paragraphs": [
            "Type [[Title]] (or use the wiki-link insert) to link to another document by title. Clicking a wiki link opens that document.",
            "Links power the graph, backlinks, and related navigation in the right utility rail.",
        ],
        "points": [],
    },
    "editor": {
        "title": "Editor",
        "summary": "Rich text, paste cleanup, media, and focus",
        "paragraphs": [
            "The center page is a TipTap rich-text editor with a formatting toolbar for styles, lists, tables, images, and colors.",
            "Scribe {{version}} also cleans messy Word / Pages / web HTML on paste, and can embed local 3D models (GLB / GLTF) beside diagrams and media blocks.",
        ],
        "points": [
            "Text vs MD — switch between rich text and Markdown",
            "Slash /continue — Local AI continue-writing from your own library (when enabled)",
            "Smart paste — Rust normalizes dirty HTML before TipTap insert",
            "3D model — insert GLB / GLTF from the slash menu or Insert toolbar",
            "Reading mode and focus mode hide chrome for fewer distractions",
            "Layout / Page — continuous vs paginated layout",
            "Microphone in the toolbar (⌘⇧M) dictates at the cursor using macOS speech recognition",
        ],
    },
    "search": {
        "title": "Search",
        "summary": "Jump to documents and matches",
        "paragraphs": [
            "The command palette jumps to documents, runs commands, and searches inside content. Find and Find & Replace search within the open document.",
            "Choosing a content hit from the palette opens that document and jumps to the first match.",
        ],
        "points": [
            "Fuzzy find — approximate matching in Find (⌘F) and the palette",
            "Library find & replace — scoped search across many notes (dry-run by default in MCP)",
        ],
    },
    "localAi": {
        "title": "Scribe Local AI",
        "summary": "The app’s own intelligence — on this Mac, never in the cloud",
        "paragraphs": [
            "Scribe has its own Local AI. It is not ChatGPT and not an online chatbot. When you enable it in Settings → Local AI, Scribe starts a small Python process on this Mac. Indexing, search, and answers over your notes all happen in your computer’s memory. Your text is never sent anywhere.",
            "The Rust core stays primary: database, editor, saving, and full-text search work without AI. Local AI adds meaning-based search, note Q&A, tag suggestions, weekly journal overview, and library analysis — so you can use the app without expecting a cloud LLM.",
            "Optional Local LLM (Ollama on localhost) can polish selected heuristics — summarize, writing coach, rewrite, explain, simplify — when you turn on Enhance heuristics in Settings. Model picker and a connectivity test live on the same page.",
            "Storage Files API exposes your documents folder’s files/ sandbox on loopback. With the API running, Local AI can list, search, summarize, and answer questions over those text files with path citations — still never leaving this Mac.",
            "After enabling, documents are indexed into vectors (model scribe-hash-v4). If you update Scribe and the model changes, a reindex banner appears — mixing old and new vectors would give inconsistent results.",
            "In document chat and the Local Agent you can run study and style actions: flashcards, takeaways, glossary, explain, simplify, action items, terminology, and a writing coach — plus the Deep read recipe (outline → glossary → takeaways → flashcards).",
        ],
        "points": [
            "Built into Scribe — enable once in Settings → Local AI, no third-party account",
            "Local intelligence status shows NLP · Ollama · Files API together",
            "⌘K All scope — combines full-text (FTS) and semantic hits via hybrid ranking",
            "Ask library / Ask this note — extractive answers with citations from your notes",
            "Ask files/ — when Local Files API is running (Storage Mode)",
            "Flashcards / Takeaways / Glossary / Explain / Writing coach — chips in Local AI chat and Agent",
            "/continue — n-gram suggestions from your library corpus",
            "Requires Python 3.10+ on your system; Ollama optional for LLM polish",
        ],
    },
    "revisions": {
        "title": "History and Revision AI",
        "summary": "Snapshots, diffs, and offline change reports",
        "paragraphs": [
            "Every meaningful save can leave a revision snapshot. Open History in the right rail to preview, compare, restore, or delete revisions.",
            "Revision AI classifies what changed between two versions — expansion, trim, rewrite, structural edits — and lists risks and bullets. With Local AI on it uses the Python module; otherwise a Rust fallback still works on this Mac.",
        ],
        "points": [
            "Word-level highlights and paired replacements in the diff view",
            "Prefer Revision AI when you want changeKind and risks, not only bullet summaries",
            "Restoring a revision saves the current body as a new snapshot first",
        ],
    },
    "mcp": {
        "title": "MCP (Cursor / Claude)",
        "summary": "Let agents read and write your local library",
        "paragraphs": [
            "Scribe Memory MCP is an optional local bridge. Cursor or Claude Desktop talk to a Rust stdio server that reads the same SQLite library — notes never leave this Mac unless the host model fetches them into its own chat.",
            "Enable and copy config from Settings → MCP. Build the binary once with npm run mcp:install from the repo. Tools cover search, notes, tasks, Local AI study actions, Revision AI, and wiki health.",
        ],
        "points": [
            "Default vault scope is no-vault — encrypted notes stay hidden from agents",
            "SCRIBE_MCP_WRITE=0 forces read-only if you want search without edits",
            "Prompts such as study_flashcards and revision_review guide common workflows",
            "If the DB is locked while Scribe is open, retry or check scribe_status",
        ],
    },
    "plugins": {
        "title": "Plugins",
        "summary": "Presets, toggles, and .scribe-ext packages",
        "paragraphs": [
            "Open Plugins from the left icon rail (puzzle icon). It lists first-party extensions (slash blocks, ⌘K commands, exports, themes). Use presets (Writing, Study, Workspace) to enable or disable a set at once, or flip each plugin with its On/Off switch.",
            "Create plugin opens a template wizard (⌘K command, slash block, or both). Scribe installs it locally and can download a .scribe-ext.json package. You can also import a zip/JSON package from disk.",
            "The host API covers blocks, commands, storage, export/import, UI panels, TipTap nodes, NLP/MCP bridges, lifecycle hooks, notify toasts, and the active document snapshot.",
        ],
        "points": [
            "Plugins rail icon — top-level page next to Docs and Settings",
            "Create plugin — template wizard on the Plugins page",
            "Writing / Study / Workspace presets — batch enable or disable",
            "Installed plugins can be toggled, reloaded, or uninstalled anytime",
        ],
    },
    "journal": {
        "title": "Journal and quick note",
        "summary": "Dated entries and scratch notes",
        "paragraphs": [
            "Today note and Weekly note create dated entries under a Journal folder — also available from the sidebar calendar.",
            "Quick note opens a scratch document for fleeting thoughts without creating a new titled page first.",
        ],
        "points": [],
    },
    "backup": {
        "title": "Backup and restore",
        "summary": "Full library archives",
        "paragraphs": [
            "Settings → Storage can export or import a full library archive (.scribe-backup.zip), including the database and on-disk files."
        ],
        "points": [
            "Import replaces the current library; the previous database is kept as a .bak file",
            "Change the documents folder, sync with disk, or clear all data from the same page",
            "Automatic backups can keep rotating zip archives under Documents/Scribe/Backups",
        ],
    },
    "shortcuts": {
        "title": "Shortcuts and settings",
        "summary": "Customize how you work",
        "paragraphs": [
            "Settings → Shortcuts lists and remaps keyboard shortcuts for new document, save, palette, find, journal, theme, and more."
        ],
        "points": [
            "Appearance — themes and language",
            "Diagnostics — database health, paths, and pending disk writes",
            "Docs — this guide, searchable by topic",
        ],
    },
}


def fill_version(value: str, version: str) -> str:
    return value.replace("{{version}}", version)


def topic_copy(topic_id: str, *, version: str) -> DocsTopicCopy:
    raw = DOCS_TOPICS.get(topic_id)
    if raw is None:
        return {
            "title": topic_id,
            "summary": "",
            "paragraphs": [],
            "points": [],
        }
    return {
        "title": fill_version(raw["title"], version),
        "summary": fill_version(raw["summary"], version),
        "paragraphs": [fill_version(p, version) for p in raw["paragraphs"]],
        "points": [fill_version(p, version) for p in raw["points"]],
    }
