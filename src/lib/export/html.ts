import { highlightCode } from '@/lib/editor/lowlight'
import { resolveCodeLanguage } from '@/lib/editor/code-languages'
import { evaluateMathExpression } from '@/lib/editor/math-js'
import { renderMermaidSource } from '@/lib/editor/mermaid'
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
  DOCUMENT_HIGHLIGHT_CSS,
  DOCUMENT_TIPTAP_CSS,
  buildDocumentContentCss,
  buildWatermarkCss,
} from '@/lib/export/document-styles'
import { colorForExport } from '@/lib/export/export-colors'
import {
  extractFontFamiliesFromContentJson,
  googleFontsLinkTags,
  primaryFontFamilyName,
} from '@/lib/editor/google-fonts'

type TipTapNode = {
  type?: string
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
}

type RenderContext = {
  mermaidSvgBySource: Map<string, string>
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
        if (mark.attrs?.color) styles.push(`color:${colorForExport(String(mark.attrs.color))}`)
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

function calloutColors(variant: string): { accent: string; bg: string; border: string } {
  switch (variant) {
    case 'tip':
      return { accent: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)' }
    case 'warning':
      return { accent: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.34)' }
    case 'danger':
      return { accent: '#ef4444', bg: 'rgba(239,68,68,0.11)', border: 'rgba(239,68,68,0.32)' }
    default:
      return { accent: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)' }
  }
}

function renderInline(nodes: TipTapNode[] | undefined, ctx: RenderContext): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'text') {
        return renderMarks(node.text ?? '', node.marks)
      }
      if (node.type === 'hardBreak') return '<br />'
      if (node.type === 'wikiLink') {
        const label = String(node.attrs?.label ?? 'document')
        return `<a class="wiki-link" style="color:#007aff;text-decoration:underline;">[[${escapeHtml(label)}]]</a>`
      }
      if (node.type === 'footnote') {
        const number = Number(node.attrs?.number ?? 1)
        const id = String(node.attrs?.id ?? number)
        return `<sup id="fnref-${escapeHtml(id)}"><a href="#fn-${escapeHtml(id)}" style="text-decoration:none;">[${number}]</a></sup>`
      }
      if (node.type === 'mathInline') {
        const expression = String(node.attrs?.expression ?? '')
        const evaluation = evaluateMathExpression(expression)
        const result = evaluation.ok ? ` = ${evaluation.result}` : ''
        return `<span class="math-inline">${escapeHtml(expression)}${escapeHtml(result)}</span>`
      }
      if (node.type === 'emoji') {
        return escapeHtml(String(node.attrs?.name ?? '🙂'))
      }
      return renderNodes(node.content, ctx)
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

function renderMermaidFigure(source: string, ctx: RenderContext): string {
  const svg = ctx.mermaidSvgBySource.get(source.trim())
  if (svg) {
    return `<figure class="mermaid-diagram" style="margin:16pt 0;text-align:center;overflow:auto;">${svg}</figure>`
  }
  return `<figure class="mermaid-diagram" style="margin:16pt 0;"><pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:10pt;padding:12pt;background:#f5f5f7;border-radius:8pt;">${escapeHtml(source)}</pre></figure>`
}

function renderNodes(nodes: TipTapNode[] | undefined, ctx: RenderContext): string {
  return (nodes ?? [])
    .map((node) => {
      switch (node.type) {
        case 'paragraph':
          return `<p${textAlignStyle(node.attrs)}>${renderInline(node.content, ctx)}</p>`
        case 'heading': {
          const level = Number(node.attrs?.level ?? 1)
          const tag = `h${Math.min(Math.max(level, 1), 6)}`
          return `<${tag}${textAlignStyle(node.attrs)}>${renderInline(node.content, ctx)}</${tag}>`
        }
        case 'bulletList':
          return `<ul>${renderNodes(node.content, ctx)}</ul>`
        case 'orderedList':
          return `<ol>${renderNodes(node.content, ctx)}</ol>`
        case 'listItem':
          return `<li>${renderNodes(node.content, ctx)}</li>`
        case 'blockquote':
          return `<blockquote>${renderNodes(node.content, ctx)}</blockquote>`
        case 'callout': {
          const variant = String(node.attrs?.variant ?? 'info')
          const colors = calloutColors(variant)
          return `<div data-callout data-variant="${escapeHtml(variant)}" style="margin:12pt 0;padding:10pt 12pt;border:1px solid ${colors.border};border-left:4px solid ${colors.accent};border-radius:8pt;background:${colors.bg};">${renderNodes(node.content, ctx)}</div>`
        }
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
          return '<div style="page-break-after:always;border-top:1px dashed #ccc;margin:24pt 0;padding-top:8pt;color:#888;font-size:10pt;">Page break</div>'
        case 'details':
          return `<details open style="margin:12pt 0;border:1px solid #ddd;border-radius:8px;padding:8pt 12pt;">${renderNodes(node.content, ctx)}</details>`
        case 'detailsSummary':
          return `<summary style="font-weight:600;cursor:pointer;margin-bottom:8pt;">${renderInline(node.content, ctx)}</summary>`
        case 'detailsContent':
          return renderNodes(node.content, ctx)
        case 'emoji':
          return escapeHtml(String(node.attrs?.name ?? '🙂'))
        case 'youtube': {
          const src = String(node.attrs?.src ?? '')
          return `<div style="margin:16pt 0;aspect-ratio:16/9;"><iframe src="${escapeHtml(src)}" width="100%" height="360" frameborder="0" allowfullscreen></iframe></div>`
        }
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
        case 'mermaidDiagram': {
          const source = String(node.attrs?.source ?? '')
          return renderMermaidFigure(source, ctx)
        }
        case 'table':
          return `<table style="border-collapse:collapse;width:100%;margin:12pt 0;">${renderNodes(node.content, ctx)}</table>`
        case 'tableRow':
          return `<tr>${renderNodes(node.content, ctx)}</tr>`
        case 'tableHeader': {
          const bg = node.attrs?.backgroundColor ? `background:${node.attrs.backgroundColor};` : ''
          return `<th style="border:1px solid #ccc;padding:8pt;text-align:left;${bg}">${renderNodes(node.content, ctx)}</th>`
        }
        case 'tableCell': {
          const bg = node.attrs?.backgroundColor ? `background:${node.attrs.backgroundColor};` : ''
          return `<td style="border:1px solid #ccc;padding:8pt;${bg}">${renderNodes(node.content, ctx)}</td>`
        }
        case 'image': {
          const src = String(node.attrs?.src ?? '')
          const alt = escapeHtml(String(node.attrs?.alt ?? ''))
          const caption = String(node.attrs?.caption ?? '').trim()
          const width = node.attrs?.width
            ? ` width="${node.attrs.width}" style="width:${node.attrs.width}"`
            : ''
          const align = String(node.attrs?.align ?? 'center')
          const textAlign =
            align === 'full'
              ? 'center'
              : align.includes('float')
                ? 'left'
                : align
          const captionHtml = caption
            ? `<figcaption>${escapeHtml(caption)}</figcaption>`
            : ''
          return `<figure data-align="${align}" style="text-align:${textAlign}"><img src="${escapeHtml(src)}" alt="${alt}"${width} />${captionHtml}</figure>`
        }
        case 'taskList':
          return `<ul data-type="taskList">${renderNodes(node.content, ctx)}</ul>`
        case 'taskItem': {
          const checked = node.attrs?.checked ? ' checked' : ''
          return `<li data-type="taskItem"><input type="checkbox"${checked} disabled />${renderNodes(node.content, ctx)}</li>`
        }
        case 'wikiLink':
        case 'footnote':
          return renderInline([node], ctx)
        default:
          return renderNodes(node.content, ctx)
      }
    })
    .join('')
}

type FootnoteRef = { id: string; number: number; content: string }

function collectFootnotes(nodes?: TipTapNode[]): FootnoteRef[] {
  const found: FootnoteRef[] = []

  const walk = (list?: TipTapNode[]) => {
    for (const node of list ?? []) {
      if (node.type === 'footnote') {
        found.push({
          id: String(node.attrs?.id ?? node.attrs?.number ?? found.length + 1),
          number: Number(node.attrs?.number ?? found.length + 1),
          content: String(node.attrs?.content ?? ''),
        })
      }
      walk(node.content)
    }
  }

  walk(nodes)
  return found.sort((a, b) => a.number - b.number)
}

function renderFootnotesSection(footnotes: FootnoteRef[]): string {
  if (!footnotes.length) return ''
  const items = footnotes
    .map(
      (note) =>
        `<li id="fn-${escapeHtml(note.id)}" style="margin:4pt 0;"><span style="font-weight:600;">[${note.number}]</span> ${escapeHtml(note.content)} <a href="#fnref-${escapeHtml(note.id)}" style="text-decoration:none;">↩</a></li>`,
    )
    .join('')
  return `<section class="footnotes" style="margin-top:28pt;padding-top:12pt;border-top:1px solid #ddd;"><h2 style="font-size:12pt;">Footnotes</h2><ol style="padding-left:18pt;font-size:10pt;color:#444;">${items}</ol></section>`
}

function collectMermaidSources(nodes?: TipTapNode[], into = new Set<string>()): Set<string> {
  for (const node of nodes ?? []) {
    if (node.type === 'mermaidDiagram') {
      const source = String(node.attrs?.source ?? '').trim()
      if (source) into.add(source)
    }
    collectMermaidSources(node.content, into)
  }
  return into
}

export async function buildMermaidSvgMap(
  contentJson: string,
  theme: 'neutral' | 'dark' = 'neutral',
): Promise<Map<string, string>> {
  let doc: TipTapNode = { type: 'doc', content: [] }
  try {
    doc = JSON.parse(contentJson) as TipTapNode
  } catch {
    return new Map()
  }

  const sources = [...collectMermaidSources(doc.content)]
  const map = new Map<string, string>()
  await Promise.all(
    sources.map(async (source) => {
      const result = await renderMermaidSource(source, { theme })
      if (result.ok) map.set(source, result.svg)
    }),
  )
  return map
}

export type HtmlExportOptions = {
  pageSetup?: PageSetup
  includeTitleHeading?: boolean
  forPrint?: boolean
  mermaidSvgBySource?: Map<string, string>
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

function buildHtmlDocument(
  contentJson: string,
  title: string,
  options: HtmlExportOptions | undefined,
  ctx: RenderContext,
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

  const body = renderNodes(doc.content, ctx)
  const footnotes = renderFootnotesSection(collectFootnotes(doc.content))
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

  const googleFamilies = [
    ...extractFontFamiliesFromContentJson(contentJson),
    primaryFontFamilyName(pageSetup.typography.fontFamily),
  ].filter(Boolean)
  const googleFontLinks = googleFontsLinkTags(googleFamilies)

  return `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  ${googleFontLinks}
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
      ${buildDocumentContentCss(pageSetup)}
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
    .mermaid-diagram svg { max-width: 100%; height: auto; }
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
    ${footnotes}
  </div>
  ${showHeaderFooter && headerFooter.footer ? `<div class="export-footer">${escapeHtml(headerFooter.footer)}</div>` : ''}
</body>
</html>`
}

/** Sync HTML export (Mermaid falls back to source `<pre>` unless `mermaidSvgBySource` is provided). */
export function tiptapJsonToHtml(
  contentJson: string,
  title: string,
  options?: HtmlExportOptions,
): string {
  return buildHtmlDocument(contentJson, title, options, {
    mermaidSvgBySource: options?.mermaidSvgBySource ?? new Map(),
  })
}

/** Async HTML export with Mermaid rendered to SVG (for PDF/DOCX/print). */
export async function tiptapJsonToHtmlAsync(
  contentJson: string,
  title: string,
  options?: HtmlExportOptions,
): Promise<string> {
  const mermaidSvgBySource =
    options?.mermaidSvgBySource ?? (await buildMermaidSvgMap(contentJson, 'neutral'))
  return buildHtmlDocument(contentJson, title, options, { mermaidSvgBySource })
}
