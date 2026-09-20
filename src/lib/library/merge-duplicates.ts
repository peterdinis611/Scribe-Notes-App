import { deleteDocument, getDocument, updateDocument } from '@/lib/db/api'

function parseDoc(contentJson: string): { type: string; content: unknown[] } {
  try {
    const parsed = JSON.parse(contentJson) as { type?: string; content?: unknown[] }
    return { type: parsed.type ?? 'doc', content: Array.isArray(parsed.content) ? parsed.content : [] }
  } catch {
    return { type: 'doc', content: [] }
  }
}

export function mergeDuplicateContent(keepJson: string, dropJson: string, dropTitle: string): string {
  const keepDoc = parseDoc(keepJson)
  const dropDoc = parseDoc(dropJson)
  const heading = {
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text: dropTitle.trim() || 'Untitled' }],
  }
  return JSON.stringify({
    type: 'doc',
    content: [...keepDoc.content, { type: 'horizontalRule' }, heading, ...dropDoc.content],
  })
}

/** Append the dropped note under a heading, then move it to trash. */
export async function mergeDuplicateNotes(keepId: string, dropId: string): Promise<void> {
  if (keepId === dropId) return
  const [keep, drop] = await Promise.all([getDocument(keepId), getDocument(dropId)])
  await updateDocument({
    id: keepId,
    contentJson: mergeDuplicateContent(keep.contentJson, drop.contentJson, drop.title),
  })
  await deleteDocument(dropId)
}
