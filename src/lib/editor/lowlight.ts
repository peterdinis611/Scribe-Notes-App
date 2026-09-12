import { createLowlight, all } from 'lowlight'
import hljs from 'highlight.js'
import { resolveCodeLanguage } from '@/lib/editor/code-languages'

/**
 * Full [highlight.js](https://highlightjs.org/) grammar set (~192 languages)
 * for TipTap CodeBlockLowlight + HTML export highlighting.
 */
const lowlight = createLowlight(all)

export { lowlight, hljs }

export function highlightCode(code: string, language?: string | null): string {
  const resolved = resolveCodeLanguage(language)
  if (resolved && hljs.getLanguage(resolved)) {
    return hljs.highlight(code, { language: resolved }).value
  }
  return hljs.highlightAuto(code).value
}
