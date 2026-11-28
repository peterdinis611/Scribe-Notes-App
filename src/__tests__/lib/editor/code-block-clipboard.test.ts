import { describe, expect, it } from 'vitest'
import { codeBlockClipboardHtml } from '@/lib/editor/code-block-clipboard'

describe('codeBlockClipboardHtml', () => {
  it('wraps code so a paste becomes a language-tagged code block', () => {
    expect(codeBlockClipboardHtml('const n = 1', 'javascript')).toBe(
      '<pre><code class="language-javascript">const n = 1</code></pre>',
    )
  })

  it('escapes markup and omits a class when language is automatic', () => {
    expect(codeBlockClipboardHtml('a < b && c > d', null)).toBe(
      '<pre><code>a &lt; b &amp;&amp; c &gt; d</code></pre>',
    )
    expect(codeBlockClipboardHtml('const n = 1', 'auto')).toBe('<pre><code>const n = 1</code></pre>')
  })
})
