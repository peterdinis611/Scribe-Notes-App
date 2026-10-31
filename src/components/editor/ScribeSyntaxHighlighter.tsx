import { useEffect, useState } from 'react'
import { highlighterLanguage, isDocumentDark } from '@/lib/editor/syntax-highlight'
import { highlightCode } from '@/lib/editor/lowlight'
import { resolveCodeLanguage } from '@/lib/editor/code-languages'
import { invoke, isTauriRuntime } from '@/lib/tauri'
import { cn } from '@/lib/utils'

type ScribeSyntaxHighlighterProps = {
  code: string
  language?: string | null
  className?: string
  overlay?: boolean
}

const cache = new Map<string, string>()

function cacheKey(language: string | null | undefined, code: string, dark: boolean) {
  return `${dark ? '1' : '0'}\u0000${language ?? ''}\u0000${code}`
}

function lowlightFallbackHtml(code: string, language?: string | null): string {
  const resolved = resolveCodeLanguage(language)
  const className = resolved ? `hljs language-${resolved}` : 'hljs'
  const source = code.length > 0 ? code : ' '
  return `<pre class="scribe-syntax__pre"><code class="${className}">${highlightCode(source, language)}</code></pre>`
}

async function highlightHtml(
  code: string,
  language: string | null | undefined,
  dark: boolean,
): Promise<string> {
  const key = cacheKey(language, code, dark)
  const hit = cache.get(key)
  if (hit) return hit

  if (isTauriRuntime()) {
    try {
      const rustHtml = await invoke<string | null>('highlight_code', {
        language: language ?? '',
        code: code.length > 0 ? code : ' ',
        dark,
      })
      if (rustHtml) {
        cache.set(key, rustHtml)
        return rustHtml
      }
    } catch {
      // fall through
    }
  }

  const html = lowlightFallbackHtml(code, language)
  cache.set(key, html)
  return html
}

/** Syntect (Rust) code highlight overlay; lowlight fallback outside Tauri. */
export function ScribeSyntaxHighlighter({
  code,
  language,
  className,
  overlay = false,
}: ScribeSyntaxHighlighterProps) {
  const [dark, setDark] = useState(isDocumentDark)
  const [html, setHtml] = useState(() => lowlightFallbackHtml(code, language))

  useEffect(() => {
    const root = document.documentElement
    const sync = () => setDark(root.classList.contains('dark'))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    void highlightHtml(code, language, dark).then((next) => {
      if (!cancelled) setHtml(next)
    })
    return () => {
      cancelled = true
    }
  }, [code, language, dark])

  // Keep language resolution for CSS hooks / a11y.
  void highlighterLanguage(language)

  return (
    <div
      className={cn('scribe-syntax', overlay && 'scribe-syntax--overlay', className)}
      data-language={resolveCodeLanguage(language) ?? 'auto'}
      // Syntect / lowlight emit trusted highlight HTML from local code only.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
