/** TipTap JSON for the in-app MCP demo note (EN + SK via language). */

type McpDemoCopy = {
  title: string
  intro: string
  whatTitle: string
  whatBody: string
  setupTitle: string
  setupSteps: string[]
  toolsTitle: string
  tools: Array<{ name: string; hint: string }>
  tryTitle: string
  tryPrompts: string[]
  tipTitle: string
  tipBody: string
}

function paragraph(text: string) {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  }
}

function heading(level: 1 | 2 | 3, text: string) {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  }
}

function bulletList(items: string[]) {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [paragraph(item)],
    })),
  }
}

function codeBlock(text: string) {
  return {
    type: 'codeBlock',
    attrs: { language: null },
    content: [{ type: 'text', text }],
  }
}

export function buildMcpDemoContentJson(copy: McpDemoCopy): string {
  const toolLines = copy.tools.map((tool) => `${tool.name} — ${tool.hint}`)
  const doc = {
    type: 'doc',
    content: [
      heading(1, copy.title),
      paragraph(copy.intro),
      heading(2, copy.whatTitle),
      paragraph(copy.whatBody),
      heading(2, copy.setupTitle),
      bulletList(copy.setupSteps),
      heading(2, copy.toolsTitle),
      bulletList(toolLines),
      heading(2, copy.tryTitle),
      ...copy.tryPrompts.flatMap((prompt) => [codeBlock(prompt)]),
      heading(2, copy.tipTitle),
      paragraph(copy.tipBody),
    ],
  }
  return JSON.stringify(doc)
}

export const MCP_DEMO_GUIDE_ID = 'scribe-mcp-demo'
