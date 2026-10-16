import { describe, expect, it } from 'vitest'
import { generateQrDataUrl } from '@/lib/editor/qr-generate'

describe('generateQrDataUrl', () => {
  it('returns a png data url', async () => {
    const url = await generateQrDataUrl('https://example.com/scribe')
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
    expect(url.length).toBeGreaterThan(200)
  })

  it('rejects empty content', async () => {
    await expect(generateQrDataUrl('   ')).rejects.toThrow(/empty/i)
  })
})
