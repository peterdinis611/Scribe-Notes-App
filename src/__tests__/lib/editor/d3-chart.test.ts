import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import '@/i18n'
import { D3Chart } from '@/lib/editor/d3-chart-extension'
import {
  D3_CHART_DEFAULT_SOURCE,
  parseD3ChartSpec,
  renderD3ChartSource,
} from '@/lib/editor/d3-chart'
import { collectDocumentOutline } from '@/lib/editor/document-outline'
import { promoteMarkdownSpecialBlocks } from '@/lib/editor/markdown-promote'
import { runSlashCommand, SLASH_COMMAND_DEFS } from '@/lib/editor/slash-commands'
import { tiptapJsonToHtml } from '@/lib/export/html'
import { tiptapJsonToMarkdown } from '@/lib/export/markdown'

describe('parseD3ChartSpec', () => {
  it('parses the default bar spec', () => {
    const parsed = parseD3ChartSpec(D3_CHART_DEFAULT_SOURCE)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.spec.type).toBe('bar')
    expect(parsed.spec.data).toHaveLength(3)
  })

  it('rejects invalid JSON, unknown types, and empty data', () => {
    expect(parseD3ChartSpec('not json').ok).toBe(false)
    expect(parseD3ChartSpec(JSON.stringify({ type: 'scatter', data: [{ x: 1 }] })).ok).toBe(false)
    expect(parseD3ChartSpec(JSON.stringify({ type: 'bar', data: [] })).ok).toBe(false)
  })
})

describe('renderD3ChartSource', () => {
  it('renders bar, line, and pie SVG without evaluating JS', () => {
    const bar = renderD3ChartSource(D3_CHART_DEFAULT_SOURCE, { print: true })
    expect(bar.ok).toBe(true)
    if (bar.ok) {
      expect(bar.svg).toContain('<svg')
      expect(bar.svg).toContain('d3-chart__bar')
      expect(bar.svg).toContain('Q1')
    }

    const line = renderD3ChartSource(
      JSON.stringify({
        type: 'line',
        title: 'Trend',
        x: 'month',
        y: 'value',
        data: [
          { month: 'Jan', value: 4 },
          { month: 'Feb', value: 8 },
        ],
      }),
    )
    expect(line.ok).toBe(true)
    if (line.ok) expect(line.svg).toContain('<path')

    const pie = renderD3ChartSource(
      JSON.stringify({
        type: 'pie',
        title: 'Share',
        x: 'name',
        y: 'value',
        data: [
          { name: 'A', value: 40 },
          { name: 'B', value: 60 },
        ],
      }),
    )
    expect(pie.ok).toBe(true)
    if (pie.ok) expect(pie.svg).toContain('<path')
  })
})

describe('slash, outline, and export', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
    document.body.replaceChildren()
  })

  it('includes chart and d3 slash commands', () => {
    expect(SLASH_COMMAND_DEFS.some((item) => item.id === 'chart')).toBe(true)
    expect(SLASH_COMMAND_DEFS.some((item) => item.id === 'd3')).toBe(true)
  })

  it('inserts a d3 chart block from /chart', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    editor = new Editor({
      element: host,
      extensions: [StarterKit, D3Chart],
      content: '<p></p>',
      editable: true,
    })

    runSlashCommand(editor as never, {
      id: 'chart',
      label: 'Chart',
      hint: 'D3',
    })

    const json = editor.getJSON()
    const chart = json.content?.find((node) => node.type === 'd3Chart')
    expect(chart).toBeTruthy()
    expect(String(chart?.attrs?.source ?? '')).toContain('"type": "bar"')
  })

  it('lists charts in the document outline', () => {
    editor = new Editor({
      extensions: [StarterKit, D3Chart],
      content: {
        type: 'doc',
        content: [{ type: 'd3Chart', attrs: { source: D3_CHART_DEFAULT_SOURCE } }],
      },
    })

    const items = collectDocumentOutline(editor as never)
    expect(items.some((item) => item.kind === 'd3Chart')).toBe(true)
    expect(items.find((item) => item.kind === 'd3Chart')?.label).toBe('Chart')
    expect(items.find((item) => item.kind === 'd3Chart')?.preview).toBe('Q1')
  })

  it('exports charts as fenced ```chart JSON', () => {
    const markdown = tiptapJsonToMarkdown(
      JSON.stringify({
        type: 'doc',
        content: [{ type: 'd3Chart', attrs: { source: D3_CHART_DEFAULT_SOURCE } }],
      }),
      'Doc',
    )

    expect(markdown).toContain('```chart')
    expect(markdown).toContain('"type": "bar"')
  })

  it('promotes ```chart and ```d3 fences', () => {
    const promoted = promoteMarkdownSpecialBlocks({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'chart' },
          content: [{ type: 'text', text: D3_CHART_DEFAULT_SOURCE }],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'd3' },
          content: [{ type: 'text', text: '{"type":"pie","data":[{"label":"A","value":1}]}' }],
        },
      ],
    })

    expect(promoted.content?.[0]).toMatchObject({ type: 'd3Chart' })
    expect(promoted.content?.[1]).toMatchObject({ type: 'd3Chart' })
  })

  it('exports HTML with an SVG figure', () => {
    const html = tiptapJsonToHtml(
      JSON.stringify({
        type: 'doc',
        content: [{ type: 'd3Chart', attrs: { source: D3_CHART_DEFAULT_SOURCE } }],
      }),
      'Doc',
      { includeTitleHeading: false },
    )

    expect(html).toContain('d3-chart')
    expect(html).toContain('<svg')
    expect(html).toContain('Q1')
  })
})
