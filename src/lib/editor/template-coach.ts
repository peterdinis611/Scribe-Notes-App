type JsonNode = {
  type?: string
  text?: string
  attrs?: { level?: number }
  content?: JsonNode[]
}

export type TemplateCoachResult = {
  present: number
  expected: number
  templateId: string
}

const TEMPLATES: Array<{ id: string; headings: string[] }> = [
  { id: 'meeting-sk', headings: ['Účastníci', 'Agenda', 'Poznámky', 'Úlohy'] },
  { id: 'meeting-en', headings: ['Participants', 'Agenda', 'Notes', 'Action items'] },
  { id: 'journal-morning', headings: ['Intentions', 'Notes'] },
  { id: 'journal-evening', headings: ['Highlights', 'Reflection'] },
  { id: 'session-en', headings: ['Goal', 'Context', 'Next steps', 'Summary'] },
  { id: 'session-sk', headings: ['Cieľ', 'Kontext', 'Ďalšie kroky', 'Zhrnutie'] },
]

const PLACEHOLDERS = new Set(
  [
    'meno 1',
    'meno 2',
    'bod 1',
    'bod 2',
    'záznam diskusie a rozhodnutí.',
    'úloha — zodpovedný · termín',
    'dátum · čas · miesto',
    'name 1',
    'name 2',
    'item 1',
    'item 2',
  ].map((item) => item.toLowerCase()),
)

function nodeText(node: JsonNode | undefined): string {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  if (!Array.isArray(node.content)) return ''
  return node.content.map(nodeText).join(' ')
}

function extractSections(contentJson: string): Array<{ heading: string; body: string }> {
  let parsed: JsonNode
  try {
    parsed = JSON.parse(contentJson) as JsonNode
  } catch {
    return []
  }
  const blocks = Array.isArray(parsed.content) ? parsed.content : []
  const sections: Array<{ heading: string; body: string }> = []
  let current: { heading: string; body: string } | null = null

  for (const block of blocks) {
    if (block.type === 'heading' && (block.attrs?.level ?? 2) >= 2) {
      if (current) sections.push(current)
      current = { heading: nodeText(block).trim(), body: '' }
      continue
    }
    if (!current) continue
    const extra = nodeText(block).trim()
    if (!extra) continue
    current.body = current.body ? `${current.body} ${extra}` : extra
  }
  if (current) sections.push(current)
  return sections
}

function isFilled(body: string): boolean {
  const compact = body.replace(/\s+/g, ' ').trim()
  if (compact.length < 8) return false
  const leftover = compact
    .split(/[·•|,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part && !PLACEHOLDERS.has(part))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return leftover.length >= 8 && !PLACEHOLDERS.has(leftover.toLowerCase())
}

/** Count filled meeting/journal sections. Null when the note does not look like those templates. */
export function templateCoachFromJson(contentJson: string | null | undefined): TemplateCoachResult | null {
  if (!contentJson) return null
  const sections = extractSections(contentJson)
  if (sections.length === 0) return null
  const byHeading = new Map(sections.map((section) => [section.heading.toLowerCase(), section]))

  let best: (TemplateCoachResult & { matched: number }) | null = null
  for (const template of TEMPLATES) {
    const matched = template.headings.filter((heading) => byHeading.has(heading.toLowerCase()))
    const needed = Math.min(2, template.headings.length)
    if (matched.length < needed) continue
    const present = template.headings.filter((heading) => {
      const section = byHeading.get(heading.toLowerCase())
      return Boolean(section && isFilled(section.body))
    }).length
    const candidate = {
      present,
      expected: template.headings.length,
      templateId: template.id,
      matched: matched.length,
    }
    if (!best || candidate.matched > best.matched || (candidate.matched === best.matched && present > best.present)) {
      best = candidate
    }
  }
  if (!best) return null
  return { present: best.present, expected: best.expected, templateId: best.templateId }
}
