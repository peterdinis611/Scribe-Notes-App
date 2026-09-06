import { describe, expect, it } from 'vitest'
import { sanitizeSnippet } from '@/lib/search-snippet'

describe('sanitizeSnippet', () => {
  it('keeps mark tags and strips other HTML', () => {
    const input = '<b>Hello</b> <mark>world</mark> <span class="x">!</span>'
    expect(sanitizeSnippet(input)).toBe('Hello <mark>world</mark> !')
  })

  it('preserves closing mark tags', () => {
    expect(sanitizeSnippet('<mark>a</mark><em>b</em>')).toBe('<mark>a</mark>b')
  })

  it('leaves plain text unchanged', () => {
    expect(sanitizeSnippet('plain text')).toBe('plain text')
  })
})
