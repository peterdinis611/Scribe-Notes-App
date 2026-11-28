function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** HTML TipTap turns back into a code block (`pre > code.language-*`). */
export function codeBlockClipboardHtml(code: string, language: string | null): string {
  const lang = language && language !== 'auto' ? language : null
  const className = lang ? ` class="language-${lang}"` : ''
  return `<pre><code${className}>${escapeHtml(code)}</code></pre>`
}

/** Plain text for IDEs, HTML so a paste lands as a highlighted code block. */
export async function copyCodeBlockToClipboard(
  code: string,
  language: string | null,
): Promise<void> {
  const html = codeBlockClipboardHtml(code, language)
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([code], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      }),
    ])
    return
  }
  await navigator.clipboard.writeText(code)
}
