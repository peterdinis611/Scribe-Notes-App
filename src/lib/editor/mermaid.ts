import type { MermaidConfig } from 'mermaid'
import { sanitizeSvg } from '@/lib/sanitize-svg'

export const MERMAID_TEMPLATE_IDS = ['flowchart', 'sequence', 'gantt', 'class', 'state'] as const

export type MermaidTemplateId = (typeof MERMAID_TEMPLATE_IDS)[number]

export const MERMAID_TEMPLATES: Record<MermaidTemplateId, { labelKey: string; source: string }> = {
  flowchart: {
    labelKey: 'mermaid.templates.flowchart',
    source: `flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Do work]
  B -->|No| D[Skip]
  C --> E[End]
  D --> E`,
  },
  sequence: {
    labelKey: 'mermaid.templates.sequence',
    source: `sequenceDiagram
  participant User
  participant App
  participant API
  User->>App: Open note
  App->>API: Load document
  API-->>App: Content
  App-->>User: Render`,
  },
  gantt: {
    labelKey: 'mermaid.templates.gantt',
    source: `gantt
  title Sprint
  dateFormat  YYYY-MM-DD
  section Build
  Spec           :a1, 2026-01-01, 3d
  Implement      :after a1, 5d
  section Ship
  Review         :2026-01-10, 2d
  Release        :1d`,
  },
  class: {
    labelKey: 'mermaid.templates.class',
    source: `classDiagram
  class Document {
    +String id
    +String title
    +save()
  }
  class Folder {
    +String id
    +add(Document)
  }
  Folder "1" --> "*" Document`,
  },
  state: {
    labelKey: 'mermaid.templates.state',
    source: `stateDiagram-v2
  [*] --> Draft
  Draft --> Review: submit
  Review --> Published: approve
  Review --> Draft: revise
  Published --> [*]`,
  },
}

export const MERMAID_DEFAULT_SOURCE = MERMAID_TEMPLATES.flowchart.source

let mermaidReady: Promise<typeof import('mermaid').default> | null = null
let renderSeq = 0

function resolveTheme(explicit?: MermaidConfig['theme']): MermaidConfig['theme'] {
  if (explicit) return explicit
  return document.documentElement.classList.contains('dark') ? 'dark' : 'neutral'
}

async function getMermaid() {
  if (!mermaidReady) {
    mermaidReady = import('mermaid').then((mod) => {
      const mermaid = mod.default
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: resolveTheme(),
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      })
      return mermaid
    })
  }
  return mermaidReady
}

export type MermaidRenderResult =
  | { ok: true; svg: string }
  | { ok: false; error: string }

export type RenderMermaidOptions = {
  /** Force a theme (use `neutral` for print/PDF/DOCX). */
  theme?: MermaidConfig['theme']
}

export async function renderMermaidSource(
  source: string,
  options?: RenderMermaidOptions,
): Promise<MermaidRenderResult> {
  const trimmed = source.trim()
  if (!trimmed) {
    return { ok: false, error: 'Empty diagram' }
  }

  try {
    const mermaid = await getMermaid()
    const theme = resolveTheme(options?.theme)
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme,
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    })
    const id = `scribe-mermaid-${++renderSeq}`
    const { svg } = await mermaid.render(id, trimmed)
    const safe = sanitizeSvg(svg)
    if (!safe) {
      return { ok: false, error: 'Diagram produced unsafe SVG' }
    }
    return { ok: true, svg: safe }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid Mermaid diagram',
    }
  }
}
