import { highlightCode } from '@/lib/editor/lowlight'
import { resolveCodeLanguage } from '@/lib/editor/code-languages'
import { evaluateMathExpression } from '@/lib/editor/math-js'
import {
  DEFAULT_PAGE_SETUP,
  normalizePageSetup,
  PAPER_SIZES,
  type PageSetup,
} from '@/lib/editor/page-setup'
import {
  buildHeaderFooterLines,
  formatExportDate,
} from '@/lib/editor/page-header-footer'
import { getPageMargins, shouldShowHeaderFooter } from '@/lib/editor/page-segments'
import {
  DOCUMENT_BODY_FONT,
  DOCUMENT_CONTENT_CSS,
  DOCUMENT_HIGHLIGHT_CSS,
  DOCUMENT_TIPTAP_CSS,
  buildWatermarkCss,
} from '@/lib/export/document-styles'

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
          const tag = `h${Math.min(Math.max(level, 1), 6)}`
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
        case 'mathInline': {
          const expression = String(node.attrs?.expression ?? '')
          const evaluation = evaluateMathExpression(expression)
          const result = evaluation.ok ? ` = ${evaluation.result}` : ''
          return `<span class="math-inline">${escapeHtml(expression)}${escapeHtml(result)}</span>`
        }
        case 'mathBlock': {
          const expression = String(node.attrs?.expression ?? '')
          const evaluation = evaluateMathExpression(expression)
          const result = evaluation.ok ? ` = ${evaluation.result}` : ''
          return `<div class="math-block" style="margin:12pt 0;text-align:center;font-family:ui-monospace,monospace;">${escapeHtml(expression)}${escapeHtml(result)}</div>`
        }
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

export type HtmlExportOptions = {
  pageSetup?: PageSetup
  includeTitleHeading?: boolean
  forPrint?: boolean
}

function buildFirstPageMarginCss(pageSetup: PageSetup): string {
  if (!pageSetup.firstPage.different) return ''

  const first = getPageMargins(pageSetup, 1)
  const standard = getPageMargins(pageSetup, 2)

  if (
    first.top === standard.top &&
    first.right === standard.right &&
    first.bottom === standard.bottom &&
    first.left === standard.left
  ) {
    return ''
  }

  return `
    @page :first {
      margin: ${first.top}px ${first.right}px ${first.bottom}px ${first.left}px;
    }
  `
}

export function tiptapJsonToHtml(
  contentJson: string,
  title: string,
  options?: HtmlExportOptions,
): string {
  const pageSetup = normalizePageSetup(options?.pageSetup ?? DEFAULT_PAGE_SETUP)
  const includeTitleHeading = options?.includeTitleHeading ?? true
  const forPrint = options?.forPrint ?? false
  const paper = PAPER_SIZES[pageSetup.paperSize]
  let doc: TipTapNode = { type: 'doc', content: [] }
  try {
    doc = JSON.parse(contentJson) as TipTapNode
  } catch {
    // fallback empty doc
  }

  const body = renderNodes(doc.content)
  const exportDate = formatExportDate()
  const showHeaderFooter = shouldShowHeaderFooter(pageSetup, 1)
  const headerFooter = showHeaderFooter
    ? buildHeaderFooterLines(pageSetup.headerFooter, {
        title,
        page: 1,
        pages: 1,
        date: exportDate,
      })
    : { header: '', footer: '' }

  const watermarkHtml =
    pageSetup.watermark.enabled && pageSetup.watermark.text.trim()
      ? `<div class="export-watermark print-watermark"><span>${escapeHtml(pageSetup.watermark.text.trim())}</span></div>`
      : ''

  return `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: ${pageSetup.paperSize === 'letter' ? 'letter' : pageSetup.paperSize};
      margin: ${pageSetup.marginTop}px ${pageSetup.marginRight}px ${pageSetup.marginBottom}px ${pageSetup.marginLeft}px;
    }
    ${buildFirstPageMarginCss(pageSetup)}
    html, body {
      margin: 0;
      padding: 0;
      background: ${forPrint ? '#ffffff' : '#f3f4f6'};
    }
    body {
      font-family: ${DOCUMENT_BODY_FONT};
      ${DOCUMENT_CONTENT_CSS}
      max-width: ${paper.width}px;
      margin: 0 auto;
      padding: ${forPrint ? '0' : `${pageSetup.marginTop}px ${pageSetup.marginRight}px ${pageSetup.marginBottom}px ${pageSetup.marginLeft}px`};
      position: relative;
    }
    .document-content {
      position: relative;
      z-index: 1;
      max-width: ${paper.width - pageSetup.marginLeft - pageSetup.marginRight}px;
      margin: 0 auto;
      padding: ${forPrint ? `${pageSetup.marginTop}px ${pageSetup.marginRight}px ${pageSetup.marginBottom}px ${pageSetup.marginLeft}px` : '0'};
    }
    .export-header, .export-footer {
      font-size: 9pt;
      color: #666;
      text-align: center;
    }
    .export-header { margin-bottom: 18pt; padding-bottom: 6pt; border-bottom: 1px solid #ddd; }
    .export-footer { margin-top: 24pt; padding-top: 6pt; border-top: 1px solid #ddd; }
    ${DOCUMENT_TIPTAP_CSS}
    ${DOCUMENT_HIGHLIGHT_CSS}
    ${buildWatermarkCss(pageSetup.watermark.opacity, pageSetup.watermark.angle)}
    @media print {
      html, body { background: #ffffff; }
      body { padding: 0; }
      .document-content { padding: 0; max-width: none; }
      .export-header {
        position: fixed;
        top: ${Math.max(12, pageSetup.marginTop * 0.35)}px;
        left: ${pageSetup.marginLeft}px;
        right: ${pageSetup.marginRight}px;
      }
      .export-footer {
        position: fixed;
        bottom: ${Math.max(12, pageSetup.marginBottom * 0.35)}px;
        left: ${pageSetup.marginLeft}px;
        right: ${pageSetup.marginRight}px;
      }
    }
  </style>
</head>
<body>
  ${watermarkHtml}
  ${showHeaderFooter && headerFooter.header ? `<div class="export-header">${escapeHtml(headerFooter.header)}</div>` : ''}
  <div class="document-content">
    ${includeTitleHeading ? `<h1>${escapeHtml(title)}</h1>` : ''}
    ${body}
  </div>
  ${showHeaderFooter && headerFooter.footer ? `<div class="export-footer">${escapeHtml(headerFooter.footer)}</div>` : ''}
</body>
</html>`
}
