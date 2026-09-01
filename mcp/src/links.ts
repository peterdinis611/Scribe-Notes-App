type TipTapNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
}

/** Collect unique wiki-link target ids from TipTap JSON (mirrors Rust `extract_wiki_link_targets`). */
export function extractWikiLinkTargets(contentJson: string): string[] {
  let value: unknown
  try {
    value = JSON.parse(contentJson)
  } catch {
    return []
  }

  const targets: string[] = []
  collectTargets(value, targets)
  targets.sort()
  return [...new Set(targets)]
}

function collectTargets(value: unknown, targets: string[]): void {
  if (!value || typeof value !== 'object') return

  if (Array.isArray(value)) {
    for (const item of value) collectTargets(item, targets)
    return
  }

  const record = value as Record<string, unknown>
  if (record.type === 'wikiLink') {
    const attrs = record.attrs as Record<string, unknown> | undefined
    const targetId = attrs?.targetId
    if (typeof targetId === 'string' && targetId.length > 0) {
      targets.push(targetId)
    }
  }

  if (record.content) collectTargets(record.content, targets)
}

type SqliteDatabase = {
  prepare: (sql: string) => {
    run: (...args: unknown[]) => unknown
  }
}

/** Rebuild outgoing wiki-link edges for a document (mirrors Rust `sync_document_links`). */
export function syncDocumentLinks(
  db: SqliteDatabase,
  sourceId: string,
  contentJson: string,
): void {
  db.prepare('DELETE FROM document_links WHERE source_id = ?').run(sourceId)

  for (const targetId of extractWikiLinkTargets(contentJson)) {
    if (targetId === sourceId) continue
    db.prepare(
      `INSERT OR IGNORE INTO document_links (source_id, target_id)
       SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM documents WHERE id = ?2)`,
    ).run(sourceId, targetId)
  }
}
