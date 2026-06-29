import { describe, expect, it } from 'vitest'
import { getImageOnlyClipboardFiles } from '@/lib/editor/paste-handler'

function createDataTransfer(init: {
  html?: string
  text?: string
  files?: File[]
}): DataTransfer {
  const store = {
    html: init.html ?? '',
    text: init.text ?? '',
    files: init.files ?? [],
  }

  return {
    getData(type: string) {
      if (type === 'text/html') return store.html
      if (type === 'text/plain') return store.text
      return ''
    },
    files: store.files,
  } as DataTransfer
}

describe('getImageOnlyClipboardFiles', () => {
  it('returns image files when clipboard has no text content', () => {
    const image = new File(['png'], 'photo.png', { type: 'image/png' })
    const data = createDataTransfer({ files: [image] })

    expect(getImageOnlyClipboardFiles(data)).toEqual([image])
  })

  it('returns empty array when html content is present', () => {
    const image = new File(['png'], 'photo.png', { type: 'image/png' })
    const data = createDataTransfer({
      html: '<p>Hello</p>',
      files: [image],
    })

    expect(getImageOnlyClipboardFiles(data)).toEqual([])
  })

  it('returns empty array when plain text is present', () => {
    const image = new File(['png'], 'photo.png', { type: 'image/png' })
    const data = createDataTransfer({
      text: 'Hello',
      files: [image],
    })

    expect(getImageOnlyClipboardFiles(data)).toEqual([])
  })
})
