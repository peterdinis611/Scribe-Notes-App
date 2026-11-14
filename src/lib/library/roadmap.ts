import { nlpRoadmap, type RoadmapResult } from '@/lib/db/nlp-api'
import { editorRefs } from '@/store/editorRefs'

export function roadmapToMarkdown(plan: RoadmapResult): string {
  if (!plan.phases?.length) return ''
  const lines: string[] = ['## Roadmap', '']
  for (const phase of plan.phases) {
    lines.push(`### ${phase.title}`)
    if (!phase.items?.length) {
      lines.push(`- _${phase.horizon || 'phase'}_`)
    } else {
      for (const item of phase.items) {
        lines.push(`- [ ] ${item.text}`)
      }
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

export async function generateDocumentRoadmap(documentId: string, limit = 8): Promise<RoadmapResult> {
  return nlpRoadmap({ documentId, limit })
}

function roadmapToTipTapNodes(plan: RoadmapResult, title: string) {
  const nodes: Record<string, unknown>[] = [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: title }],
    },
  ]
  for (const phase of plan.phases) {
    nodes.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: phase.title }],
    })
    if (phase.items?.length) {
      nodes.push({
        type: 'taskList',
        content: phase.items.map((item) => ({
          type: 'taskItem',
          attrs: { checked: false },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: item.text }],
            },
          ],
        })),
      })
    } else {
      nodes.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: phase.horizon || 'phase',
            marks: [{ type: 'italic' }],
          },
        ],
      })
    }
  }
  nodes.push({ type: 'paragraph' })
  return nodes
}

/** Generate a roadmap from the active document and append structured headings + tasks. */
export async function insertDocumentRoadmap(
  documentId: string,
  options?: { limit?: number; title?: string },
): Promise<{ ok: boolean; plan: RoadmapResult; markdown: string }> {
  const plan = await generateDocumentRoadmap(documentId, options?.limit ?? 8)
  const markdown = roadmapToMarkdown(plan)
  if (!plan.phases?.length) {
    return { ok: false, plan, markdown: '' }
  }
  const editor = editorRefs.editor
  if (!editor || editor.isDestroyed) {
    return { ok: false, plan, markdown }
  }
  const title = options?.title?.trim() || 'Roadmap'
  const ok = editor
    .chain()
    .focus('end')
    .insertContent(roadmapToTipTapNodes(plan, title))
    .run()
  return { ok, plan, markdown }
}
