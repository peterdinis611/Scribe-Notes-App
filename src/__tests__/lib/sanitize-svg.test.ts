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
})
