import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import '@/i18n'
import { LeafletMap } from '@/lib/editor/map-extension'
import { MAP_DEFAULT_SOURCE, isMapUrl, parseMapSpec, specFromMapUrl } from '@/lib/editor/map'
import { collectDocumentOutline } from '@/lib/editor/document-outline'
import { promoteMarkdownSpecialBlocks } from '@/lib/editor/markdown-promote'
import { runSlashCommand, SLASH_COMMAND_DEFS } from '@/lib/editor/slash-commands'
import { tiptapJsonToHtml } from '@/lib/export/html'
import { tiptapJsonToMarkdown } from '@/lib/export/markdown'

describe('parseMapSpec', () => {
  it('parses the default Bratislava spec', () => {
    const parsed = parseMapSpec(MAP_DEFAULT_SOURCE)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.spec.title).toBe('Bratislava')
    expect(parsed.spec.markers).toHaveLength(1)
  })

  it('accepts center tuples and OSM / geo URLs', () => {
    const fromCenter = parseMapSpec(JSON.stringify({ center: [48.15, 17.11], zoom: 12 }))
    expect(fromCenter.ok).toBe(true)

    expect(isMapUrl('https://www.openstreetmap.org/#map=13/48.1486/17.1077')).toBe(true)
    const osm = specFromMapUrl('https://www.openstreetmap.org/#map=13/48.1486/17.1077')
    expect(osm?.lat).toBeCloseTo(48.1486)
    expect(osm?.lng).toBeCloseTo(17.1077)

    const geo = specFromMapUrl('geo:48.15,17.11?z=14')
    expect(geo?.zoom).toBe(14)
    expect(parseMapSpec('not a map').ok).toBe(false)
  })
})

describe('leaflet map block', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
    document.body.replaceChildren()
  })

  it('includes /map and /leaflet slash commands', () => {
    expect(SLASH_COMMAND_DEFS.some((item) => item.id === 'map')).toBe(true)
    expect(SLASH_COMMAND_DEFS.some((item) => item.id === 'leaflet')).toBe(true)
  })

  it('inserts a map block from slash', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    editor = new Editor({
      element: host,
      extensions: [StarterKit, LeafletMap],
      content: '<p></p>',
      editable: true,
    })

    runSlashCommand(editor as never, { id: 'map', label: 'Map', hint: 'OSM' })
    const node = editor.getJSON().content?.find((item) => item.type === 'leafletMap')
    expect(node).toBeTruthy()
    expect(String(node?.attrs?.source ?? '')).toContain('Bratislava')
  })

  it('lists maps in the outline', () => {
    editor = new Editor({
      extensions: [StarterKit, LeafletMap],
      content: {
        type: 'doc',
        content: [{ type: 'leafletMap', attrs: { source: MAP_DEFAULT_SOURCE } }],
      },
    })

    const items = collectDocumentOutline(editor as never)
    expect(items.some((item) => item.kind === 'leafletMap')).toBe(true)
    expect(items.find((item) => item.kind === 'leafletMap')?.preview).toBe('Bratislava')
  })

  it('exports markdown and an OSM embed', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [{ type: 'leafletMap', attrs: { source: MAP_DEFAULT_SOURCE } }],
    })

    expect(tiptapJsonToMarkdown(json, 'Doc')).toContain('```map')
    const html = tiptapJsonToHtml(json, 'Doc', { includeTitleHeading: false })
    expect(html).toContain('openstreetmap.org')
    expect(html).toContain('Bratislava')
  })

  it('promotes ```map and ```leaflet fences', () => {
    const promoted = promoteMarkdownSpecialBlocks({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'map' },
          content: [{ type: 'text', text: MAP_DEFAULT_SOURCE }],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'leaflet' },
          content: [{ type: 'text', text: '{"center":[40.7,-74],"zoom":11}' }],
        },
      ],
    })

    expect(promoted.content?.[0]).toMatchObject({ type: 'leafletMap' })
    expect(promoted.content?.[1]).toMatchObject({ type: 'leafletMap' })
  })
})
