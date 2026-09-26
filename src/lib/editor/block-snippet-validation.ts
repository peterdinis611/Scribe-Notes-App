import type { JSONContent } from '@tiptap/core'

/** Soft limits so corrupted / hostile KV payloads cannot blow up the editor. */
export const SNIPPET_LIMITS = {
  nameMax: 80,
  idMax: 64,
  plainTextMax: 50_000,
  contentNodesMax: 400,
  contentDepthMax: 24,
  contentSerializedMax: 200_000,
  customSnippetsMax: 100,
  iconMax: 16,
  hintMax: 160,
  keywordsMax: 12,
  keywordLengthMax: 32,
} as const

export type SnippetValidationCode =
  | 'name_required'
  | 'name_too_long'
  | 'body_required'
  | 'body_too_large'
  | 'content_invalid'
  | 'content_too_large'
  | 'content_too_deep'
  | 'content_too_many_nodes'
  | 'id_invalid'
  | 'too_many_snippets'
  | 'icon_invalid'
  | 'hint_too_long'
  | 'keywords_invalid'

export type SnippetValidationError = {
  code: SnippetValidationCode
  message: string
}

export type SnippetValidationOk<T> = { ok: true; value: T }
export type SnippetValidationFail = { ok: false; error: SnippetValidationError }
export type SnippetValidationResult<T> = SnippetValidationOk<T> | SnippetValidationFail

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/

/** Node types the editor can reasonably re-insert from a snippet. */
const ALLOWED_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'hardBreak',
  'heading',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'image',
  'resizableImage',
  'video',
  'youtube',
  'lottieAnimation',
  'model3d',
  'callout',
  'details',
  'detailsSummary',
  'detailsContent',
  'mathInline',
  'mathBlock',
  'mermaidDiagram',
  'd3Chart',
  'leafletMap',
  'footnote',
  'pageBreak',
  'tableOfContents',
  'wikiLink',
  'wikiEmbed',
  'emoji',
  'mention',
])

const ALLOWED_MARK_TYPES = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'link',
  'highlight',
  'textStyle',
  'subscript',
  'superscript',
  'comment',
])

function fail(code: SnippetValidationCode, message: string): SnippetValidationFail {
  return { ok: false, error: { code, message } }
}

export function isValidSnippetId(id: string): boolean {
  return ID_PATTERN.test(id) && id.length <= SNIPPET_LIMITS.idMax
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function countNodes(nodes: JSONContent[]): number {
  let total = 0
  const walk = (node: JSONContent) => {
    total += 1
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child)
    }
  }
  for (const node of nodes) walk(node)
  return total
}

function maxDepth(nodes: JSONContent[], depth = 1): number {
  let deepest = depth
  for (const node of nodes) {
    if (Array.isArray(node.content) && node.content.length > 0) {
      deepest = Math.max(deepest, maxDepth(node.content, depth + 1))
    }
  }
  return deepest
}

/**
 * Deep-sanitize TipTap JSON: drop unknown node/mark types, coerce shapes,
 * and reject non-objects. Returns null when nothing usable remains.
 */
export function sanitizeJsonContent(value: unknown, depth = 0): JSONContent | null {
  if (depth > SNIPPET_LIMITS.contentDepthMax) return null
  if (!isPlainObject(value)) return null

  const type = value.type
  if (typeof type !== 'string' || !ALLOWED_NODE_TYPES.has(type)) return null

  const next: JSONContent = { type }

  if (value.attrs != null) {
    if (!isPlainObject(value.attrs)) return null
    // Keep attrs as a shallow JSON-compatible bag (primitives / arrays / plain objects).
    try {
      next.attrs = JSON.parse(JSON.stringify(value.attrs)) as Record<string, unknown>
    } catch {
      return null
    }
  }

  if (type === 'text') {
    if (typeof value.text !== 'string') return null
    next.text = value.text
  }

  if (Array.isArray(value.marks)) {
    const marks = value.marks
      .filter(isPlainObject)
      .map((mark) => {
        const markType = mark.type
        if (typeof markType !== 'string' || !ALLOWED_MARK_TYPES.has(markType)) return null
        const cleaned: { type: string; attrs?: Record<string, unknown> } = { type: markType }
        if (mark.attrs != null) {
          if (!isPlainObject(mark.attrs)) return null
          try {
            cleaned.attrs = JSON.parse(JSON.stringify(mark.attrs)) as Record<string, unknown>
          } catch {
            return null
          }
        }
        return cleaned
      })
      .filter((mark): mark is { type: string; attrs?: Record<string, unknown> } => mark != null)
    if (marks.length > 0) next.marks = marks
  }

  if (Array.isArray(value.content)) {
    const children: JSONContent[] = []
    for (const child of value.content) {
      const sanitized = sanitizeJsonContent(child, depth + 1)
      if (sanitized) children.push(sanitized)
    }
    if (children.length > 0) next.content = children
  }

  return next
}

export function sanitizeJsonContentList(value: unknown): JSONContent[] | undefined {
  if (Array.isArray(value)) {
    const nodes = value
      .map((item) => sanitizeJsonContent(item))
      .filter((item): item is JSONContent => item != null)
    return nodes.length > 0 ? nodes : undefined
  }
  const single = sanitizeJsonContent(value)
  return single ? [single] : undefined
}

export type ParsedSnippetInput = {
  id?: string
  name: string
  plainText: string
  content?: JSONContent[]
  icon?: string
  hint?: string
  keywords?: string[]
  favorite?: boolean
}

function normalizeKeywords(value: unknown): SnippetValidationResult<string[] | undefined> {
  if (value == null) return { ok: true, value: undefined }
  if (!Array.isArray(value)) {
    return fail('keywords_invalid', 'Snippet keywords must be an array of strings')
  }
  if (value.length > SNIPPET_LIMITS.keywordsMax) {
    return fail(
      'keywords_invalid',
      `At most ${SNIPPET_LIMITS.keywordsMax} keywords are allowed`,
    )
  }
  const keywords: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') {
      return fail('keywords_invalid', 'Snippet keywords must be an array of strings')
    }
    const trimmed = item.trim().toLowerCase()
    if (!trimmed) continue
    if (trimmed.length > SNIPPET_LIMITS.keywordLengthMax) {
      return fail(
        'keywords_invalid',
        `Each keyword must be at most ${SNIPPET_LIMITS.keywordLengthMax} characters`,
      )
    }
    if (!keywords.includes(trimmed)) keywords.push(trimmed)
  }
  return { ok: true, value: keywords.length > 0 ? keywords : undefined }
}

export function validateSnippetInput(
  input: {
    id?: string
    name: string
    plainText?: string
    content?: JSONContent | JSONContent[]
    icon?: string | null
    hint?: string | null
    keywords?: string[] | null
    favorite?: boolean
  },
  options?: { existingCustomCount?: number; isUpdate?: boolean },
): SnippetValidationResult<ParsedSnippetInput> {
  const name = input.name.trim()
  if (!name) {
    return fail('name_required', 'Snippet name is required')
  }
  if (name.length > SNIPPET_LIMITS.nameMax) {
    return fail(
      'name_too_long',
      `Snippet name must be at most ${SNIPPET_LIMITS.nameMax} characters`,
    )
  }

  let id: string | undefined
  if (input.id != null) {
    const trimmed = input.id.trim()
    if (!trimmed || !isValidSnippetId(trimmed)) {
      return fail('id_invalid', 'Snippet id has an invalid format')
    }
    id = trimmed
  }

  const content = sanitizeJsonContentList(input.content)
  if (input.content != null && !content) {
    return fail('content_invalid', 'Snippet TipTap content is invalid')
  }

  if (content) {
    const nodes = countNodes(content)
    if (nodes > SNIPPET_LIMITS.contentNodesMax) {
      return fail(
        'content_too_many_nodes',
        `Snippet content exceeds ${SNIPPET_LIMITS.contentNodesMax} nodes`,
      )
    }
    if (maxDepth(content) > SNIPPET_LIMITS.contentDepthMax) {
      return fail(
        'content_too_deep',
        `Snippet content exceeds depth ${SNIPPET_LIMITS.contentDepthMax}`,
      )
    }
    let serialized: string
    try {
      serialized = JSON.stringify(content)
    } catch {
      return fail('content_invalid', 'Snippet TipTap content is invalid')
    }
    if (serialized.length > SNIPPET_LIMITS.contentSerializedMax) {
      return fail(
        'content_too_large',
        `Snippet content exceeds ${SNIPPET_LIMITS.contentSerializedMax} bytes`,
      )
    }
  }

  const plainText = (input.plainText ?? '').replace(/\r\n/g, '\n')
  if (plainText.length > SNIPPET_LIMITS.plainTextMax) {
    return fail(
      'body_too_large',
      `Snippet body must be at most ${SNIPPET_LIMITS.plainTextMax} characters`,
    )
  }

  if (!content && !plainText.trim()) {
    return fail('body_required', 'Snippet body is required')
  }

  let icon: string | undefined
  if (input.icon != null && input.icon !== '') {
    if (typeof input.icon !== 'string') {
      return fail('icon_invalid', 'Snippet icon must be a short string')
    }
    const trimmedIcon = input.icon.trim()
    if (!trimmedIcon || trimmedIcon.length > SNIPPET_LIMITS.iconMax) {
      return fail(
        'icon_invalid',
        `Snippet icon must be at most ${SNIPPET_LIMITS.iconMax} characters`,
      )
    }
    icon = trimmedIcon
  }

  let hint: string | undefined
  if (input.hint != null && input.hint !== '') {
    if (typeof input.hint !== 'string') {
      return fail('hint_too_long', 'Snippet hint must be a string')
    }
    const trimmedHint = input.hint.trim()
    if (trimmedHint.length > SNIPPET_LIMITS.hintMax) {
      return fail(
        'hint_too_long',
        `Snippet hint must be at most ${SNIPPET_LIMITS.hintMax} characters`,
      )
    }
    hint = trimmedHint
  }

  const keywordsResult = normalizeKeywords(input.keywords)
  if (!keywordsResult.ok) return keywordsResult

  if (
    !options?.isUpdate &&
    typeof options?.existingCustomCount === 'number' &&
    options.existingCustomCount >= SNIPPET_LIMITS.customSnippetsMax
  ) {
    return fail(
      'too_many_snippets',
      `At most ${SNIPPET_LIMITS.customSnippetsMax} custom snippets are allowed`,
    )
  }

  return {
    ok: true,
    value: {
      ...(id ? { id } : {}),
      name,
      plainText,
      ...(content ? { content } : {}),
      ...(icon ? { icon } : {}),
      ...(hint ? { hint } : {}),
      ...(keywordsResult.value ? { keywords: keywordsResult.value } : {}),
      ...(typeof input.favorite === 'boolean' ? { favorite: input.favorite } : {}),
    },
  }
}

export type BlockDefinitionValidationCode =
  | 'id_required'
  | 'id_invalid'
  | 'insert_required'
  | 'alias_invalid'

export type BlockDefinitionValidationError = {
  code: BlockDefinitionValidationCode
  message: string
}

export type BlockDefinitionValidationResult =
  | { ok: true; value: { id: string; aliases?: string[] } }
  | { ok: false; error: BlockDefinitionValidationError }

const BLOCK_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/

export function validateBlockDefinition(def: {
  id: string
  insert?: unknown
  aliases?: string[]
}): BlockDefinitionValidationResult {
  const id = typeof def.id === 'string' ? def.id.trim() : ''
  if (!id) {
    return { ok: false, error: { code: 'id_required', message: 'Block id is required' } }
  }
  if (!BLOCK_ID_PATTERN.test(id) && !isValidSnippetId(id)) {
    return {
      ok: false,
      error: { code: 'id_invalid', message: 'Block id has an invalid format' },
    }
  }
  if (typeof def.insert !== 'function') {
    return {
      ok: false,
      error: { code: 'insert_required', message: 'Block insert handler is required' },
    }
  }
  if (def.aliases) {
    for (const alias of def.aliases) {
      const trimmed = typeof alias === 'string' ? alias.trim() : ''
      if (!trimmed || (!BLOCK_ID_PATTERN.test(trimmed) && !isValidSnippetId(trimmed))) {
        return {
          ok: false,
          error: { code: 'alias_invalid', message: 'Block alias has an invalid format' },
        }
      }
    }
  }
  return {
    ok: true,
    value: {
      id,
      ...(def.aliases
        ? { aliases: def.aliases.map((alias) => alias.trim()).filter(Boolean) }
        : {}),
    },
  }
}
