import { describe, expect, it } from 'vitest'
import {
  fileNameForDocumentImage,
  guessAnimatedKindFromSrc,
  isLikelyAnimatedImageFile,
  looksLikeApng,
  looksLikeAnimatedWebp,
  looksLikeGif,
  sniffAnimatedImageKind,
} from '@/lib/editor/animated-image'

const GIF89A = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x4c, 0x01, 0x00, 0x3b,
])

describe('animated image detection', () => {
  it('recognizes gif sources', () => {
    expect(guessAnimatedKindFromSrc('/tmp/assets/doc/a.gif')).toBe('gif')
    expect(guessAnimatedKindFromSrc('https://cdn.example.com/loop.GIF?w=2')).toBe('gif')
    expect(guessAnimatedKindFromSrc('data:image/gif;base64,R0lGOD')).toBe('gif')
    expect(guessAnimatedKindFromSrc('/tmp/photo.png')).toBeNull()
  })

  it('sniffs gif magic bytes', () => {
    expect(looksLikeGif(GIF89A)).toBe(true)
    expect(sniffAnimatedImageKind(GIF89A)).toBe('gif')
    expect(looksLikeGif(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
  })

  it('sniffs animated webp VP8X flag and ANIM chunk', () => {
    const anim = new Uint8Array(24)
    anim.set([0x52, 0x49, 0x46, 0x46], 0)
    anim.set([0x57, 0x45, 0x42, 0x50], 8)
    anim.set([0x41, 0x4e, 0x49, 0x4d], 12)
    expect(looksLikeAnimatedWebp(anim)).toBe(true)

    const vp8x = new Uint8Array(21)
    vp8x.set([0x52, 0x49, 0x46, 0x46], 0)
    vp8x.set([0x57, 0x45, 0x42, 0x50], 8)
    vp8x.set([0x56, 0x50, 0x38, 0x58], 12)
    vp8x[16] = 1
    vp8x[20] = 0x02
    expect(looksLikeAnimatedWebp(vp8x)).toBe(true)
  })

  it('sniffs apng acTL before IDAT', () => {
    const bytes = new Uint8Array(32)
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
    bytes.set([0x61, 0x63, 0x54, 0x4c], 12)
    expect(looksLikeApng(bytes)).toBe(true)
  })

  it('keeps a .gif filename so the file is served as image/gif', () => {
    const unnamed = new File([GIF89A], 'pasted', { type: 'image/gif' })
    expect(fileNameForDocumentImage(unnamed, 'gif')).toBe('pasted.gif')
    expect(isLikelyAnimatedImageFile(unnamed)).toBe(true)

    const already = new File([GIF89A], 'loop.GIF', { type: 'image/gif' })
    expect(fileNameForDocumentImage(already, 'gif')).toBe('loop.GIF')
  })
})
