import type { MermaidConfig } from 'mermaid'

export const MERMAID_DEFAULT_SOURCE = `flowchart TD
  A[Start] --> B[End]`

let mermaidReady: Promise<typeof import('mermaid').default> | null = null
let renderSeq = 0

function resolveTheme(): MermaidConfig['theme'] {
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

export async function renderMermaidSource(source: string): Promise<MermaidRenderResult> {
  const trimmed = source.trim()
  if (!trimmed) {
    return { ok: false, error: 'Prázdny diagram' }
  }

  try {
    const mermaid = await getMermaid()
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: resolveTheme(),
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    })
    const id = `scribe-mermaid-${++renderSeq}`
    const { svg } = await mermaid.render(id, trimmed)
    return { ok: true, svg }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Neplatný Mermaid diagram',
    }
  }
}
