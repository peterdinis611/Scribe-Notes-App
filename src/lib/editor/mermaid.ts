import type { MermaidConfig } from 'mermaid'

export const MERMAID_DEFAULT_SOURCE = `flowchart TD
  A[Start] --> B[End]`

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
    return { ok: false, error: 'Prázdny diagram' }
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
    return { ok: true, svg }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Neplatný Mermaid diagram',
    }
  }
}
