import { createLowlight, common } from 'lowlight'
import hljs from 'highlight.js/lib/common'
import dart from 'highlight.js/lib/languages/dart'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import elixir from 'highlight.js/lib/languages/elixir'
import haskell from 'highlight.js/lib/languages/haskell'
import powershell from 'highlight.js/lib/languages/powershell'
import scala from 'highlight.js/lib/languages/scala'
import xml from 'highlight.js/lib/languages/xml'
import { resolveCodeLanguage } from '@/lib/editor/code-languages'

const lowlight = createLowlight(common)

const extraLanguages = {
  dart,
  dockerfile,
  elixir,
  haskell,
  powershell,
  scala,
  html: xml,
} as const

for (const [name, grammar] of Object.entries(extraLanguages)) {
  lowlight.register(name, grammar)
  hljs.registerLanguage(name, grammar)
}

export { lowlight }

export function highlightCode(code: string, language?: string | null): string {
  const resolved = resolveCodeLanguage(language)
  if (resolved && hljs.getLanguage(resolved)) {
    return hljs.highlight(code, { language: resolved }).value
  }
  return hljs.highlightAuto(code).value
}
