import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import '@/i18n'
import { Video } from '@/lib/editor/video-extension'
import { extractYoutubeId, isVideoUrl, videoExportEmbed, videoProviderLabel } from '@/lib/editor/video'
import { collectDocumentOutline } from '@/lib/editor/document-outline'
import { promoteMarkdownSpecialBlocks } from '@/lib/editor/markdown-promote'
import { runSlashCommand, SLASH_COMMAND_DEFS } from '@/lib/editor/slash-commands'
import { tiptapJsonToHtml } from '@/lib/export/html'
import { tiptapJsonToMarkdown } from '@/lib/export/markdown'

describe('video URL helpers', () => {
  it('detects YouTube, Vimeo, and file URLs', () => {
    expect(isVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
    expect(isVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
    expect(isVideoUrl('https://vimeo.com/148751763')).toBe(true)
    expect(isVideoUrl('https://cdn.example.com/clip.mp4')).toBe(true)
    expect(isVideoUrl('https://example.com/notes')).toBe(false)
  })

  it('extracts ids and export embeds', () => {
    expect(extractYoutubeId('https://www.youtube.com/watch?v=abc123')).toBe('abc123')
    expect(extractYoutubeId('https://youtu.be/abc123')).toBe('abc123')
    expect(videoProviderLabel('https://youtu.be/abc123')).toBe('YouTube')
    expect(videoExportEmbed('https://www.youtube.com/watch?v=abc123')).toEqual({
      kind: 'iframe',
      href: 'https://www.youtube-nocookie.com/embed/abc123',
    })
    expect(videoExportEmbed('https://files.example.com/a.webm')).toEqual({
      kind: 'video',
      href: 'https://files.example.com/a.webm',
    })
  })
})

describe('video block', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
    document.body.replaceChildren()
  })

  it('includes /video in slash commands', () => {
    expect(SLASH_COMMAND_DEFS.some((item) => item.id === 'video')).toBe(true)
  })

  it('inserts an empty video block from slash', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    editor = new Editor({
      element: host,
      extensions: [StarterKit, Video],
      content: '<p></p>',
      editable: true,
    })

    runSlashCommand(editor as never, { id: 'video', label: 'Video', hint: 'URL' })
    const node = editor.getJSON().content?.find((item) => item.type === 'video')
    expect(node).toBeTruthy()
  })

  it('lists videos in the outline', () => {
    editor = new Editor({
      extensions: [StarterKit, Video],
      content: {
        type: 'doc',
        content: [{ type: 'video', attrs: { src: 'https://youtu.be/abc123' } }],
      },
    })

    const items = collectDocumentOutline(editor as never)
    expect(items.some((item) => item.kind === 'video')).toBe(true)
    expect(items.find((item) => item.kind === 'video')?.preview).toContain('youtu.be')
  })

  it('exports markdown and HTML', () => {
    const src = 'https://www.youtube.com/watch?v=abc123'
    const json = JSON.stringify({
      type: 'doc',
      content: [{ type: 'video', attrs: { src, caption: 'Clip' } }],
    })

    const markdown = tiptapJsonToMarkdown(json, 'Doc')
    expect(markdown).toContain('```video')
    expect(markdown).toContain(src)

    const html = tiptapJsonToHtml(json, 'Doc', { includeTitleHeading: false })
    expect(html).toContain('youtube-nocookie.com/embed/abc123')
    expect(html).toContain('Clip')
  })

  it('promotes fenced ```video URLs', () => {
    const promoted = promoteMarkdownSpecialBlocks({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'video' },
          content: [{ type: 'text', text: 'https://vimeo.com/148751763' }],
        },
      ],
    })

    expect(promoted.content?.[0]).toMatchObject({
      type: 'video',
      attrs: { src: 'https://vimeo.com/148751763' },
    })
  })
})
