import { describe, expect, it } from 'vitest'
import {
  sanitizeJsonContentList,
  SNIPPET_LIMITS,
  validateBlockDefinition,
  validateSnippetInput,
} from '@/lib/editor/block-snippet-validation'
import { SnippetValidationError, upsertCustomBlockSnippet } from '@/lib/editor/block-snippets'
import { BlockDefinitionError, registerBlock } from '@/lib/editor/block-registry'
import { resetKvStoreForTests } from '@/lib/storage/kv'
import { afterEach, beforeEach } from 'vitest'

describe('block snippet validation', () => {
  beforeEach(async () => {
    await resetKvStoreForTests()
  })

  afterEach(async () => {
    await resetKvStoreForTests()
  })

  it('rejects empty and oversized names', () => {
    expect(validateSnippetInput({ name: '  ', plainText: 'body' }).ok).toBe(false)
    expect(
      validateSnippetInput({
        name: 'x'.repeat(SNIPPET_LIMITS.nameMax + 1),
        plainText: 'body',
      }).ok,
    ).toBe(false)
  })

  it('rejects empty body without content', () => {
    const result = validateSnippetInput({ name: 'Ok', plainText: '   ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('body_required')
  })

  it('rejects oversized plain text', () => {
    const result = validateSnippetInput({
      name: 'Ok',
      plainText: 'a'.repeat(SNIPPET_LIMITS.plainTextMax + 1),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('body_too_large')
  })

  it('rejects invalid ids', () => {
    const result = validateSnippetInput({
      id: '../evil',
      name: 'Ok',
      plainText: 'body',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('id_invalid')
  })

  it('sanitizes unknown TipTap node types out of content', () => {
    const cleaned = sanitizeJsonContentList([
      { type: 'paragraph', content: [{ type: 'text', text: 'Keep' }] },
      { type: 'script', content: [{ type: 'text', text: 'Drop' }] },
      { type: 'paragraph', attrs: { onClick: 'alert(1)' }, content: [{ type: 'text', text: 'Attrs ok' }] },
    ])
    expect(cleaned).toHaveLength(2)
    expect(cleaned?.every((node) => node.type === 'paragraph')).toBe(true)
  })

  it('rejects fully invalid content payloads', () => {
    const result = validateSnippetInput({
      name: 'Ok',
      content: [{ type: 'not-a-real-node' }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('content_invalid')
  })

  it('accepts content-only snippets', () => {
    const result = validateSnippetInput({
      name: 'Rich',
      content: [
        {
          type: 'callout',
          attrs: { variant: 'tip' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('throws typed errors from upsertCustomBlockSnippet', () => {
    expect(() =>
      upsertCustomBlockSnippet({
        name: '',
        plainText: 'body',
      }),
    ).toThrow(SnippetValidationError)

    try {
      upsertCustomBlockSnippet({ name: '', plainText: 'body' })
    } catch (error) {
      expect(error).toBeInstanceOf(SnippetValidationError)
      expect((error as SnippetValidationError).code).toBe('name_required')
    }
  })

  it('enforces the custom snippet count limit', () => {
    for (let i = 0; i < SNIPPET_LIMITS.customSnippetsMax; i += 1) {
      upsertCustomBlockSnippet({
        name: `Block ${i}`,
        plainText: `## ${i}`,
      })
    }
    expect(() =>
      upsertCustomBlockSnippet({
        name: 'One too many',
        plainText: '## nope',
      }),
    ).toThrow(/maximum|too_many|At most/i)
  })
})

describe('block definition validation', () => {
  it('requires a valid id and insert handler', () => {
    expect(validateBlockDefinition({ id: '', insert: () => undefined }).ok).toBe(false)
    expect(validateBlockDefinition({ id: 'ok-block', insert: undefined }).ok).toBe(false)
    expect(
      validateBlockDefinition({
        id: 'ok-block',
        insert: () => undefined,
        aliases: ['also-ok'],
      }).ok,
    ).toBe(true)
  })

  it('registerBlock rejects invalid definitions', () => {
    expect(() =>
      registerBlock({
        id: '',
        insert: () => undefined,
      }),
    ).toThrow(BlockDefinitionError)
  })
})
