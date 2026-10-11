import { describe, expect, it } from 'vitest'
import { sanitizeSvg } from '@/lib/sanitize-svg'

describe('sanitizeSvg', () => {
  it('keeps a plain svg root', () => {
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>')
    expect(out).toContain('<svg')
    expect(out).toContain('circle')
  })

  it('strips script and on* handlers', () => {
    const dirty =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><g onclick="alert(1)"><text>ok</text></g></svg>'
    const out = sanitizeSvg(dirty)
    expect(out.toLowerCase()).not.toContain('<script')
    expect(out.toLowerCase()).not.toContain('onclick')
    expect(out).toContain('ok')
  })

  it('strips javascript: hrefs', () => {
    const dirty =
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>'
    const out = sanitizeSvg(dirty)
    expect(out.toLowerCase()).not.toContain('javascript:')
  })

  it('removes foreignObject / iframe / embed', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg">
      <foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><script>x</script></body></foreignObject>
      <iframe src="https://evil.test"></iframe>
      <embed src="x"></embed>
      <text>safe</text>
    </svg>`
    const out = sanitizeSvg(dirty).toLowerCase()
    expect(out).not.toContain('foreignobject')
    expect(out).not.toContain('iframe')
    expect(out).not.toContain('embed')
    expect(out).toContain('safe')
  })

  it('returns empty for non-svg markup', () => {
    expect(sanitizeSvg('<div onclick="x">hi</div>')).toBe('')
    expect(sanitizeSvg('')).toBe('')
  })
})
