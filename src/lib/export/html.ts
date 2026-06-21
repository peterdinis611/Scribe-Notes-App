import { highlightCode } from '@/lib/editor/lowlight'
import { resolveCodeLanguage } from '@/lib/editor/code-languages'

type TipTapNode = {
  type?: string
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function renderMarks(text: string, marks?: TipTapNode['marks']): string {
  if (!marks?.length) return escapeHtml(text)

  return marks.reduce((acc, mark) => {
    switch (mark.type) {
      case 'bold':
        return `<strong>${acc}</strong>`
      case 'italic':
        return `<em>${acc}</em>`
      case 'underline':
        return `<u>${acc}</u>`
      case 'strike':
        return `<s>${acc}</s>`
      case 'highlight': {
        const color = String(mark.attrs?.color ?? '#fff3a3')
        return `<mark style="background:${color}">${acc}</mark>`
      }
      case 'code':
        return `<code>${acc}</code>`
      case 'link': {
        const href = String(mark.attrs?.href ?? '#')
        return `<a href="${escapeHtml(href)}">${acc}</a>`
      }
      case 'subscript':
        return `<sub>${acc}</sub>`
      case 'superscript':
        return `<sup>${acc}</sup>`
      case 'textStyle': {
        const styles: string[] = []
        if (mark.attrs?.color) styles.push(`color:${mark.attrs.color}`)
        if (mark.attrs?.fontSize) styles.push(`font-size:${mark.attrs.fontSize}`)
        if (mark.attrs?.fontFamily) styles.push(`font-family:${mark.attrs.fontFamily}`)
        if (!styles.length) return acc
        return `<span style="${styles.join(';')}">${acc}</span>`
      }
      default:
        return acc
    }
  }, escapeHtml(text))
}

function renderInline(nodes?: TipTapNode[]): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'text') {
        return renderMarks(node.text ?? '', node.marks)
      }
      if (node.type === 'hardBreak') return '<br />'
      return renderNodes(node.content)
    })
    .join('')
}

function textAlignStyle(attrs?: Record<string, unknown>): string {
  const align = attrs?.textAlign
  if (align === 'center' || align === 'right' || align === 'justify') {
    return ` style="text-align:${align}"`
  }
  return ''
}

function renderNodes(nodes?: TipTapNode[]): string {
  return (nodes ?? [])
    .map((node) => {
      switch (node.type) {
        case 'paragraph':
          return `<p${textAlignStyle(node.attrs)}>${renderInline(node.content)}</p>`
        case 'heading': {
          const level = Number(node.attrs?.level ?? 1)
          const tag = `h${Math.min(Math.max(level, 1), 3)}`
          return `<${tag}${textAlignStyle(node.attrs)}>${renderInline(node.content)}</${tag}>`
        }
        case 'bulletList':
          return `<ul>${renderNodes(node.content)}</ul>`
        case 'orderedList':
          return `<ol>${renderNodes(node.content)}</ol>`
        case 'listItem':
          return `<li>${renderNodes(node.content)}</li>`
        case 'blockquote':
          return `<blockquote>${renderNodes(node.content)}</blockquote>`
        case 'codeBlock': {
          const raw = (node.content ?? []).map((n) => n.text ?? '').join('')
          const language = node.attrs?.language as string | undefined
          const resolved = resolveCodeLanguage(language)
          const className = resolved ? `hljs language-${resolved}` : 'hljs'
          return `<pre><code class="${className}">${highlightCode(raw, language)}</code></pre>`
        }
        case 'horizontalRule':
          return '<hr />'
        case 'pageBreak':
          return '<div style="page-break-after:always;border-top:1px dashed #ccc;margin:24pt 0;padding-top:8pt;color:#888;font-size:10pt;">Zalomenie strany</div>'
        case 'details':
          return `<details open style="margin:12pt 0;border:1px solid #ddd;border-radius:8px;padding:8pt 12pt;">${renderNodes(node.content)}</details>`
        case 'detailsSummary':
          return `<summary style="font-weight:600;cursor:pointer;margin-bottom:8pt;">${renderInline(node.content)}</summary>`
        case 'detailsContent':
          return renderNodes(node.content)
        case 'emoji':
          return escapeHtml(String(node.attrs?.name ?? '🙂'))
        case 'youtube': {
          const src = String(node.attrs?.src ?? '')
          return `<div style="margin:16pt 0;aspect-ratio:16/9;"><iframe src="${escapeHtml(src)}" width="100%" height="360" frameborder="0" allowfullscreen></iframe></div>`
        }
        case 'inlineMath':
          return `<span>$${escapeHtml(String(node.attrs?.latex ?? ''))}$</span>`
        case 'blockMath':
          return `<div style="margin:12pt 0;text-align:center;">$$${escapeHtml(String(node.attrs?.latex ?? ''))}$$</div>`
        case 'table':
          return `<table style="border-collapse:collapse;width:100%;margin:12pt 0;">${renderNodes(node.content)}</table>`
        case 'tableRow':
          return `<tr>${renderNodes(node.content)}</tr>`
        case 'tableHeader': {
          const bg = node.attrs?.backgroundColor ? `background:${node.attrs.backgroundColor};` : ''
          return `<th style="border:1px solid #ccc;padding:8pt;text-align:left;${bg}">${renderNodes(node.content)}</th>`
        }
        case 'tableCell': {
          const bg = node.attrs?.backgroundColor ? `background:${node.attrs.backgroundColor};` : ''
          return `<td style="border:1px solid #ccc;padding:8pt;${bg}">${renderNodes(node.content)}</td>`
        }
        case 'image': {
          const src = String(node.attrs?.src ?? '')
          const alt = escapeHtml(String(node.attrs?.alt ?? ''))
          const width = node.attrs?.width ? ` width="${node.attrs.width}" style="width:${node.attrs.width}"` : ''
          const align = String(node.attrs?.align ?? 'center')
          return `<figure data-align="${align}" style="text-align:${align.includes('float') ? 'left' : align.replace('float-', '')}"><img src="${escapeHtml(src)}" alt="${alt}"${width} /></figure>`
        }
        case 'taskList':
          return `<ul data-type="taskList">${renderNodes(node.content)}</ul>`
        case 'taskItem': {
          const checked = node.attrs?.checked ? ' checked' : ''
          return `<li data-type="taskItem"><input type="checkbox"${checked} disabled />${renderNodes(node.content)}</li>`
        }
        default:
          return renderNodes(node.content)
      }
    })
    .join('')
}

export function tiptapJsonToHtml(contentJson: string, title: string): string {
  let doc: TipTapNode = { type: 'doc', content: [] }
  try {
    doc = JSON.parse(contentJson) as TipTapNode
  } catch {
    // fallback empty doc
  }

  const body = renderNodes(doc.content)

  return `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; font-size: 12pt; line-height: 1.6; color: #111; margin: 48px; }
    h1 { font-size: 24pt; margin: 0 0 12pt; }
    h2 { font-size: 18pt; margin: 18pt 0 8pt; }
    h3 { font-size: 14pt; margin: 14pt 0 6pt; }
    p { margin: 0 0 10pt; }
    mark { background: #fff3a3; }
    blockquote { border-left: 3px solid #ccc; padding-left: 12pt; color: #555; }
    pre { background: #0d1117; padding: 10pt; border-radius: 6pt; overflow-x: auto; }
    pre code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10pt; }
    .hljs-comment, .hljs-quote { color: #8b949e; }
    .hljs-keyword, .hljs-selector-tag { color: #ff7b72; }
    .hljs-string, .hljs-addition { color: #a5d6ff; }
    .hljs-number, .hljs-literal { color: #79c0ff; }
    .hljs-title, .hljs-section { color: #d2a8ff; }
    .hljs-built_in, .hljs-type { color: #ffa657; }
    .hljs-attr, .hljs-variable { color: #79c0ff; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`
}
