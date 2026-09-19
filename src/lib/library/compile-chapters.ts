type TipTapDoc = { type?: string; content?: unknown[] }

export function mergeChapters(chapters: { title: string; contentJson: string }[]): string {
  const content: unknown[] = []
  for (const chapter of chapters) {
    content.push({
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: chapter.title }],
    })
    try {
      const parsed = JSON.parse(chapter.contentJson) as TipTapDoc
      if (Array.isArray(parsed.content)) content.push(...parsed.content)
    } catch {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: chapter.contentJson }],
      })
    }
  }
  return JSON.stringify({ type: 'doc', content })
}
