import { writeFile, mkdir } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import type { DocumentSummary } from '@/lib/db/api'
import { getDocument } from '@/lib/db/api'
import { tiptapJsonToHtml } from '@/lib/export/html'
import { sanitizeFileStem } from '@/lib/filenames'
import { saveScopedFile } from '@/lib/fs/scoped-dialog'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pageShell(title: string, body: string, nav: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; --fg:#1a1814; --muted:#6b6560; --bg:#f7f4ef; --line:#ddd6cb; --accent:#0f766e; }
  @media (prefers-color-scheme: dark) {
    :root { --fg:#f4efe6; --muted:#a39a8f; --bg:#161411; --line:#2c2823; --accent:#5eead4; }
  }
  body { margin:0; font:16px/1.55 "Iowan Old Style", "Palatino Linotype", Palatino, serif; color:var(--fg); background:var(--bg); }
  .wrap { max-width: 920px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  nav { display:flex; flex-wrap:wrap; gap:.75rem 1.25rem; margin-bottom:2rem; padding-bottom:1rem; border-bottom:1px solid var(--line); font-size:.92rem; }
  nav a { color:var(--accent); text-decoration:none; }
  nav a:hover { text-decoration:underline; }
  h1 { font-size:2rem; letter-spacing:-.02em; margin:0 0 1rem; }
  .muted { color:var(--muted); font-size:.9rem; }
  article :is(h1,h2,h3) { letter-spacing:-.01em; }
  article a { color:var(--accent); }
  article img, article video { max-width:100%; height:auto; }
  article table { border-collapse:collapse; width:100%; margin:1rem 0; }
  article th, article td { border:1px solid var(--line); padding:.4rem .55rem; text-align:left; }
</style>
</head>
<body>
<div class="wrap">
<nav>${nav}</nav>
${body}
</div>
</body>
</html>`
}

/** Export selected (or all) notes as a static HTML wiki folder. */
export async function publishLocalWikiSite(args: {
  documents: DocumentSummary[]
  siteTitle?: string
  dialogTitle?: string
}): Promise<string | null> {
  const live = args.documents.filter((doc) => !doc.deletedAt).slice(0, 200)
  if (live.length === 0) return null

  const indexPath = await saveScopedFile({
    title: args.dialogTitle ?? 'Publish local wiki',
    defaultPath: 'scribe-wiki/index.html',
  })
  if (!indexPath) return null

  const folder = indexPath.replace(/[/\\][^/\\]+$/, '')
  const pagesDir = await join(folder, 'pages')
  await mkdir(pagesDir, { recursive: true })

  const siteTitle = args.siteTitle?.trim() || 'Scribe wiki'
  const pageMeta: Array<{ id: string; title: string; file: string }> = []

  for (const summary of live) {
    const doc = await getDocument(summary.id)
    if (!doc) continue
    const stem = sanitizeFileStem(doc.title || summary.id)
    const file = `${stem}-${summary.id.slice(0, 8)}.html`
    const fullHtml = tiptapJsonToHtml(doc.contentJson, doc.title, { includeTitleHeading: false })
    const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    const htmlBody = bodyMatch?.[1]?.trim() || fullHtml
    pageMeta.push({ id: summary.id, title: doc.title.trim() || 'Untitled', file })
    const nav = `<a href="../index.html">${escapeHtml(siteTitle)}</a>`
    const page = pageShell(
      doc.title,
      `<article>${htmlBody}</article>`,
      nav,
    )
    await writeFile(await join(pagesDir, file), new TextEncoder().encode(page))
  }

  const nav = pageMeta
    .map((page) => `<a href="pages/${escapeHtml(page.file)}">${escapeHtml(page.title)}</a>`)
    .join('')
  const list = pageMeta
    .map(
      (page) =>
        `<li><a href="pages/${escapeHtml(page.file)}">${escapeHtml(page.title)}</a></li>`,
    )
    .join('')
  const index = pageShell(
    siteTitle,
    `<h1>${escapeHtml(siteTitle)}</h1><p class="muted">${pageMeta.length} notes</p><ul>${list}</ul>`,
    nav,
  )
  await writeFile(indexPath, new TextEncoder().encode(index))
  return folder
}
