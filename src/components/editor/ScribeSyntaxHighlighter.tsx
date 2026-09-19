import { useEffect, useState } from 'react'
import SyntaxHighlighter from 'react-syntax-highlighter'
import atomOneDark from 'react-syntax-highlighter/dist/esm/styles/hljs/atom-one-dark'
import github from 'react-syntax-highlighter/dist/esm/styles/hljs/github'
import { highlighterLanguage, isDocumentDark } from '@/lib/editor/syntax-highlight'
import { cn } from '@/lib/utils'

const CODE_FONT = {
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  lineHeight: 1.55,
} as const

type ScribeSyntaxHighlighterProps = {
  code: string
  language?: string | null
  className?: string
  overlay?: boolean
}

export function ScribeSyntaxHighlighter({
  code,
  language,
  className,
  overlay = false,
}: ScribeSyntaxHighlighterProps) {
  const [dark, setDark] = useState(isDocumentDark)

  useEffect(() => {
    const root = document.documentElement
    const sync = () => setDark(root.classList.contains('dark'))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const source = code.length > 0 ? code : ' '
  const resolved = highlighterLanguage(language)

  return (
    <SyntaxHighlighter
      language={resolved}
      style={dark ? atomOneDark : github}
      PreTag="div"
      className={cn('scribe-syntax', overlay && 'scribe-syntax--overlay', className)}
      customStyle={{
        margin: 0,
        padding: overlay ? '14px 16px' : '14px 16px',
        background: 'transparent',
        ...CODE_FONT,
      }}
      codeTagProps={{
        style: {
          ...CODE_FONT,
          background: 'transparent',
        },
      }}
    >
      {source}
    </SyntaxHighlighter>
  )
}
