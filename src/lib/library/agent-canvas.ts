import { buildCanvasTemplate, type CanvasTemplateId } from '@/lib/canvas/templates'
import { canvasObjectsToTiptapDoc } from '@/lib/canvas/to-tiptap'
import { parseCanvasDocument, serializeCanvasDocument, type CanvasDocument } from '@/lib/canvas/types'
import { createDocument, getDocument, updateDocument } from '@/lib/db/api'
import type { LibraryChatCitation, LibraryChatResult } from '@/lib/library/library-chat'

function bullets(lines: string[]): string {
  return lines.map((line) => `- ${line}`).join('\n')
}

async function loadCanvas(documentId: string): Promise<{
  title: string
  doc: CanvasDocument
}> {
  const document = await getDocument(documentId)
  const parsed = parseCanvasDocument(document.contentJson)
  if (!parsed) {
    throw new Error('agent.needsCanvas')
  }
  return { title: document.title, doc: parsed }
}

/** Summarize notes, text, frames, and docLinks on a canvas document. */
export async function runAgentCanvasSummarize(documentId: string): Promise<LibraryChatResult> {
  const { title, doc } = await loadCanvas(documentId)
  const notes: string[] = []
  const texts: string[] = []
  const frames: string[] = []
  const links: string[] = []

  for (const obj of doc.objects) {
    if (obj.kind === 'note' && obj.text.trim()) notes.push(obj.text.trim().slice(0, 160))
    if (obj.kind === 'text' && obj.text.trim()) texts.push(obj.text.trim().slice(0, 120))
    if (obj.kind === 'frame' && obj.label.trim()) frames.push(obj.label.trim())
    if (obj.kind === 'docLink') {
      const label = obj.documentTitle?.trim() || obj.documentId || 'link'
      links.push(label)
    }
  }

  const sections: string[] = [`**Canvas: ${title}**`, `${doc.objects.length} objects`]
  if (frames.length) sections.push(`**Frames**\n${bullets(frames.slice(0, 12))}`)
  if (texts.length) sections.push(`**Titles / text**\n${bullets(texts.slice(0, 12))}`)
  if (notes.length) sections.push(`**Notes**\n${bullets(notes.slice(0, 16))}`)
  if (links.length) sections.push(`**Doc links**\n${bullets(links.slice(0, 12))}`)
  if (notes.length + texts.length + frames.length + links.length === 0) {
    sections.push('_Empty board — add notes or a template._')
  }

  const citations: LibraryChatCitation[] = [
    {
      documentId,
      title,
      snippet: `${doc.objects.length} objects`,
    },
  ]

  return { answer: sections.join('\n\n'), citations }
}

/** Convert canvas objects into a new TipTap note. */
export async function runAgentCanvasToNote(documentId: string): Promise<LibraryChatResult> {
  const { title, doc } = await loadCanvas(documentId)
  const tiptap = canvasObjectsToTiptapDoc(doc.objects)
  const contentJson = JSON.stringify(tiptap)
  const created = await createDocument({
    title: `${title} — from canvas`,
    contentJson,
  })
  return {
    answer: `Created note **${created.title}** from the canvas board.`,
    citations: [
      {
        documentId: created.id,
        title: created.title,
        snippet: 'From canvas',
      },
    ],
    followups: ['Open the new note', 'Summarize the canvas again'],
  }
}

/** Canonical: `scribe_ui::pick_canvas_template_id` (Tauri `pick_canvas_template_id_ui`). */
function pickTemplateId(goal: string): CanvasTemplateId {
  const folded = goal
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (folded.includes('roadmap') || folded.includes('cestovn') || folded.includes('roadmapa')) {
    return 'roadmap'
  }
  if (folded.includes('blank') || folded.includes('prazdn') || folded.includes('empty')) {
    return 'blank'
  }
  return 'brainstorm'
}

/** Replace canvas content with a built-in template. */
export async function runAgentCanvasTemplate(
  documentId: string,
  goal: string,
): Promise<LibraryChatResult> {
  await loadCanvas(documentId)
  const templateId = pickTemplateId(goal)
  const next = buildCanvasTemplate(templateId)
  const contentJson = serializeCanvasDocument(next)
  await updateDocument({ id: documentId, contentJson })
  return {
    answer: `Applied canvas template **${templateId}** (${next.objects.length} objects).`,
    citations: [
      {
        documentId,
        title: `Template: ${templateId}`,
        snippet: `${next.objects.length} objects`,
      },
    ],
  }
}
