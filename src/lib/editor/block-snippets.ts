import type { Editor, JSONContent } from '@tiptap/core'
import i18n from '@/i18n'
import { promptInput } from '@/lib/input-dialog'
import {
  sanitizeJsonContentList,
  SNIPPET_LIMITS,
  type SnippetValidationCode,
  validateSnippetInput,
} from '@/lib/editor/block-snippet-validation'
import { kvGet, kvSet } from '@/lib/storage/kv'
import { toast } from '@/lib/toast'

export type BlockSnippet = {
  id: string
  name: string
  /**
   * TipTap-oriented plain text; used when `content` is missing and for
   * editing / search. Prefer `content` for insert fidelity.
   */
  plainText?: string
  /** TipTap JSON nodes (doc fragment). Preferred over `plainText` on insert. */
  content?: JSONContent[]
  /** True for user-created snippets (persisted). */
  custom?: boolean
  /** Optional slash-menu icon (emoji / short glyph). */
  icon?: string
  /** Optional short description shown as slash hint. */
  hint?: string
  /** Extra search terms for the slash filter. */
  keywords?: string[]
  /** Pin to the top of the snippet list. */
  favorite?: boolean
  /** Unix ms timestamp of last update (custom snippets). */
  updatedAt?: number
}

export type BlockSnippetInsertOptions = {
  /** Absolute document position; defaults to the current selection. */
  pos?: number
  /** Delete the current selection before inserting. */
  replaceSelection?: boolean
}

export type BlockSnippetUpsertInput = {
  id?: string
  name: string
  plainText?: string
  content?: JSONContent | JSONContent[]
  icon?: string | null
  hint?: string | null
  keywords?: string[] | null
  favorite?: boolean
}

export type BlockSnippetPatch = {
  name?: string
  plainText?: string
  content?: JSONContent | JSONContent[] | null
  icon?: string | null
  hint?: string | null
  keywords?: string[] | null
  favorite?: boolean
}

export type ImportBlockSnippetsResult = {
  imported: BlockSnippet[]
  skipped: number
}

export class SnippetValidationError extends Error {
  readonly code: SnippetValidationCode

  constructor(code: SnippetValidationCode, message: string) {
    super(message)
    this.name = 'SnippetValidationError'
    this.code = code
  }
}

const STORAGE_KEY = 'scribe-block-snippets'
const CUSTOM_ID_PREFIX = 'custom-'

export const DEFAULT_BLOCK_SNIPPETS: BlockSnippet[] = [
  {
    id: 'meeting-notes',
    name: 'Meeting notes',
    icon: '📝',
    keywords: ['meeting', 'agenda', 'notes'],
    plainText: '## Agenda\n\n- \n\n## Notes\n\n\n\n## Actions\n\n- [ ] ',
  },
  {
    id: 'decision',
    name: 'Decision',
    icon: '⚖',
    keywords: ['decision', 'adr'],
    plainText: '### Decision\n\n**Context:**\n\n**Decision:**\n\n**Next steps:**\n\n- [ ] ',
  },
]

const DEFAULT_IDS = new Set(DEFAULT_BLOCK_SNIPPETS.map((item) => item.id))

function normalizeContentField(value: unknown): JSONContent[] | undefined {
  return sanitizeJsonContentList(value)
}

function normalizeStoredMeta(item: BlockSnippet): Pick<
  BlockSnippet,
  'icon' | 'hint' | 'keywords' | 'favorite' | 'updatedAt'
> {
  const icon =
    typeof item.icon === 'string' && item.icon.trim()
      ? item.icon.trim().slice(0, SNIPPET_LIMITS.iconMax)
      : undefined
  const hint =
    typeof item.hint === 'string' && item.hint.trim()
      ? item.hint.trim().slice(0, SNIPPET_LIMITS.hintMax)
      : undefined
  const keywords = Array.isArray(item.keywords)
    ? item.keywords
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, SNIPPET_LIMITS.keywordsMax)
    : undefined
  return {
    ...(icon ? { icon } : {}),
    ...(hint ? { hint } : {}),
    ...(keywords && keywords.length > 0 ? { keywords } : {}),
    ...(item.favorite ? { favorite: true } : {}),
    ...(typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
      ? { updatedAt: item.updatedAt }
      : {}),
  }
}

function isValidSnippet(item: unknown): item is BlockSnippet {
  if (!item || typeof item !== 'object') return false
  const candidate = item as BlockSnippet
  if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') return false
  if (!candidate.id.trim() || !candidate.name.trim()) return false
  if (candidate.name.trim().length > SNIPPET_LIMITS.nameMax) return false
  if (candidate.id.length > SNIPPET_LIMITS.idMax) return false
  if (
    typeof candidate.plainText === 'string' &&
    candidate.plainText.length > SNIPPET_LIMITS.plainTextMax
  ) {
    return false
  }
  const content = normalizeContentField(candidate.content)
  const hasPlain = typeof candidate.plainText === 'string' && candidate.plainText.trim().length > 0
  return hasPlain || Boolean(content)
}

function readStoredSnippets(): BlockSnippet[] {
  try {
    const raw = kvGet(STORAGE_KEY)
    if (!raw) return []
    if (raw.length > SNIPPET_LIMITS.contentSerializedMax * SNIPPET_LIMITS.customSnippetsMax) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isValidSnippet)
      .slice(0, SNIPPET_LIMITS.customSnippetsMax + DEFAULT_IDS.size)
      .map((item) => ({
        id: item.id.trim(),
        name: item.name.trim().slice(0, SNIPPET_LIMITS.nameMax),
        plainText:
          typeof item.plainText === 'string'
            ? item.plainText.replace(/\r\n/g, '\n').slice(0, SNIPPET_LIMITS.plainTextMax)
            : undefined,
        content: normalizeContentField(item.content),
        custom: item.custom ?? !DEFAULT_IDS.has(item.id),
        ...normalizeStoredMeta(item),
      }))
  } catch {
    return []
  }
}

function persistAll(snippets: BlockSnippet[]) {
  kvSet(STORAGE_KEY, JSON.stringify(snippets))
}

function sortSnippets(snippets: BlockSnippet[]): BlockSnippet[] {
  return [...snippets].sort((left, right) => {
    const fav = Number(Boolean(right.favorite)) - Number(Boolean(left.favorite))
    if (fav !== 0) return fav
    const leftTime = left.updatedAt ?? 0
    const rightTime = right.updatedAt ?? 0
    if (leftTime !== rightTime) return rightTime - leftTime
    return left.name.localeCompare(right.name)
  })
}

function newCustomId(): string {
  return `${CUSTOM_ID_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** Built-in + custom snippets for slash menu / insert. */
export function listBlockSnippets(): BlockSnippet[] {
  const stored = readStoredSnippets()
  const customs = stored.filter((item) => item.custom || !DEFAULT_IDS.has(item.id))
  const overrides = new Map(
    stored.filter((item) => DEFAULT_IDS.has(item.id) && !item.custom).map((item) => [item.id, item]),
  )
  const defaults = DEFAULT_BLOCK_SNIPPETS.map((item) => {
    const override = overrides.get(item.id)
    return override ? { ...item, ...override, custom: false } : item
  })
  return [...defaults, ...sortSnippets(customs)]
}

export function listCustomBlockSnippets(): BlockSnippet[] {
  return sortSnippets(
    listBlockSnippets().filter((item) => item.custom || item.id.startsWith(CUSTOM_ID_PREFIX)),
  )
}

export function listFavoriteBlockSnippets(): BlockSnippet[] {
  return listBlockSnippets().filter((item) => item.favorite)
}

export function getBlockSnippet(id: string): BlockSnippet | undefined {
  const trimmed = id.trim()
  if (!trimmed) return undefined
  return listBlockSnippets().find((item) => item.id === trimmed)
}

export function searchBlockSnippets(query: string): BlockSnippet[] {
  const q = query.trim().toLowerCase()
  const all = listBlockSnippets()
  if (!q) return all
  return all.filter((item) => {
    if (item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)) return true
    if (item.hint?.toLowerCase().includes(q)) return true
    if (item.plainText?.toLowerCase().includes(q)) return true
    return item.keywords?.some((keyword) => keyword.includes(q)) ?? false
  })
}

export function saveBlockSnippets(snippets: BlockSnippet[]) {
  const cleaned: BlockSnippet[] = []
  for (const item of snippets) {
    const parsed = validateSnippetInput(
      {
        id: item.id,
        name: item.name,
        plainText: item.plainText,
        content: item.content,
        icon: item.icon,
        hint: item.hint,
        keywords: item.keywords,
        favorite: item.favorite,
      },
      { isUpdate: true },
    )
    if (!parsed.ok) continue
    cleaned.push({
      id: parsed.value.id ?? item.id,
      name: parsed.value.name,
      plainText: parsed.value.plainText,
      ...(parsed.value.content ? { content: parsed.value.content } : {}),
      ...(parsed.value.icon ? { icon: parsed.value.icon } : {}),
      ...(parsed.value.hint ? { hint: parsed.value.hint } : {}),
      ...(parsed.value.keywords ? { keywords: parsed.value.keywords } : {}),
      ...(parsed.value.favorite ? { favorite: true } : {}),
      ...(typeof item.updatedAt === 'number' ? { updatedAt: item.updatedAt } : {}),
      custom: item.custom ?? true,
    })
  }
  persistAll(cleaned.slice(0, SNIPPET_LIMITS.customSnippetsMax + DEFAULT_IDS.size))
}

export function plainTextFromJsonContent(nodes: JSONContent[]): string {
  const parts: string[] = []

  const walk = (node: JSONContent) => {
    if (node.type === 'text' && typeof node.text === 'string') {
      parts.push(node.text)
      return
    }
    if (node.type === 'hardBreak') {
      parts.push('\n')
      return
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child)
    }
    if (
      node.type === 'paragraph' ||
      node.type === 'heading' ||
      node.type === 'blockquote' ||
      node.type === 'codeBlock' ||
      node.type === 'horizontalRule'
    ) {
      parts.push('\n')
    }
  }

  for (const node of nodes) walk(node)
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}

export function upsertCustomBlockSnippet(input: BlockSnippetUpsertInput): BlockSnippet {
  const existing = readStoredSnippets()
  const customs = existing.filter((item) => item.custom || !DEFAULT_IDS.has(item.id))
  const updating = Boolean(input.id?.trim() && customs.some((item) => item.id === input.id?.trim()))

  const parsed = validateSnippetInput(
    {
      id: input.id,
      name: input.name,
      plainText: input.plainText ?? '',
      content: input.content,
      icon: input.icon,
      hint: input.hint,
      keywords: input.keywords,
      favorite: input.favorite,
    },
    {
      existingCustomCount: customs.length,
      isUpdate: updating,
    },
  )
  if (!parsed.ok) {
    throw new SnippetValidationError(parsed.error.code, parsed.error.message)
  }

  const content = parsed.value.content
  let plainText = parsed.value.plainText
  if (content && !plainText.trim()) {
    plainText = plainTextFromJsonContent(content)
  }

  if (!content && !plainText.trim()) {
    throw new SnippetValidationError('body_required', 'Snippet body is required')
  }

  const previous = input.id?.trim()
    ? customs.find((item) => item.id === input.id?.trim())
    : undefined
  const id = parsed.value.id || newCustomId()

  const next: BlockSnippet = {
    id,
    name: parsed.value.name,
    plainText,
    ...(content ? { content } : {}),
    ...(parsed.value.icon ? { icon: parsed.value.icon } : previous?.icon ? { icon: previous.icon } : {}),
    ...(parsed.value.hint ? { hint: parsed.value.hint } : previous?.hint ? { hint: previous.hint } : {}),
    ...(parsed.value.keywords
      ? { keywords: parsed.value.keywords }
      : previous?.keywords
        ? { keywords: previous.keywords }
        : {}),
    favorite:
      typeof parsed.value.favorite === 'boolean'
        ? parsed.value.favorite
        : Boolean(previous?.favorite),
    updatedAt: Date.now(),
    custom: true,
  }

  // Clear optional fields explicitly set to null.
  if (input.icon === null) delete next.icon
  if (input.hint === null) delete next.hint
  if (input.keywords === null) delete next.keywords

  const without = existing.filter((item) => item.id !== id)
  const storedCustoms = without.filter((item) => item.custom || !DEFAULT_IDS.has(item.id))
  persistAll([...storedCustoms, next])
  return next
}

export function patchCustomBlockSnippet(id: string, patch: BlockSnippetPatch): BlockSnippet {
  const existing = getBlockSnippet(id)
  if (!existing || !(existing.custom || existing.id.startsWith(CUSTOM_ID_PREFIX))) {
    throw new SnippetValidationError('id_invalid', 'Custom snippet not found')
  }

  return upsertCustomBlockSnippet({
    id: existing.id,
    name: patch.name ?? existing.name,
    plainText: patch.plainText ?? existing.plainText,
    content:
      patch.content === null
        ? undefined
        : (patch.content ?? existing.content),
    icon: patch.icon === undefined ? existing.icon : patch.icon,
    hint: patch.hint === undefined ? existing.hint : patch.hint,
    keywords: patch.keywords === undefined ? existing.keywords : patch.keywords,
    favorite: patch.favorite ?? existing.favorite,
  })
}

export function renameCustomBlockSnippet(id: string, name: string): BlockSnippet {
  return patchCustomBlockSnippet(id, { name })
}

export function setBlockSnippetFavorite(id: string, favorite: boolean): BlockSnippet {
  const existing = getBlockSnippet(id)
  if (!existing) {
    throw new SnippetValidationError('id_invalid', 'Snippet not found')
  }
  if (existing.custom || existing.id.startsWith(CUSTOM_ID_PREFIX)) {
    return patchCustomBlockSnippet(id, { favorite })
  }

  // Persist favorite override for built-ins without copying the whole body as custom.
  const stored = readStoredSnippets()
  const without = stored.filter((item) => item.id !== existing.id)
  const override: BlockSnippet = {
    ...existing,
    favorite: Boolean(favorite),
    custom: false,
    updatedAt: Date.now(),
  }
  persistAll([...without, override])
  return getBlockSnippet(id) ?? override
}

export function duplicateCustomBlockSnippet(
  id: string,
  options?: { name?: string },
): BlockSnippet {
  const source = getBlockSnippet(id)
  if (!source) {
    throw new SnippetValidationError('id_invalid', 'Snippet not found')
  }
  return upsertCustomBlockSnippet({
    name: options?.name?.trim() || `${source.name} (copy)`,
    plainText: source.plainText,
    content: source.content,
    icon: source.icon,
    hint: source.hint,
    keywords: source.keywords,
    favorite: false,
  })
}

export function removeCustomBlockSnippet(id: string): boolean {
  const trimmed = id.trim()
  if (!trimmed) return false
  const existing = readStoredSnippets()
  const next = existing.filter((item) => item.id !== trimmed)
  if (next.length === existing.length) return false
  persistAll(next)
  return true
}

export function exportCustomBlockSnippets(): BlockSnippet[] {
  return listCustomBlockSnippets().map((item) => ({
    id: item.id,
    name: item.name,
    plainText: item.plainText,
    ...(item.content ? { content: item.content } : {}),
    ...(item.icon ? { icon: item.icon } : {}),
    ...(item.hint ? { hint: item.hint } : {}),
    ...(item.keywords ? { keywords: item.keywords } : {}),
    ...(item.favorite ? { favorite: true } : {}),
    custom: true,
  }))
}

export function importCustomBlockSnippets(
  payload: unknown,
  options?: { replace?: boolean },
): ImportBlockSnippetsResult {
  const items = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === 'object' &&
        Array.isArray((payload as { snippets?: unknown }).snippets)
      ? ((payload as { snippets: unknown[] }).snippets)
      : null

  if (!items) {
    throw new SnippetValidationError('content_invalid', 'Import payload must be an array of snippets')
  }

  if (options?.replace) {
    const kept = readStoredSnippets().filter(
      (item) => !(item.custom || item.id.startsWith(CUSTOM_ID_PREFIX)) && DEFAULT_IDS.has(item.id),
    )
    persistAll(kept)
  }

  const imported: BlockSnippet[] = []
  let skipped = 0
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      skipped += 1
      continue
    }
    const candidate = item as BlockSnippet
    try {
      imported.push(
        upsertCustomBlockSnippet({
          // Always allocate a fresh id to avoid clobbering existing customs unless id is free.
          id:
            typeof candidate.id === 'string' &&
            candidate.id.startsWith(CUSTOM_ID_PREFIX) &&
            !getBlockSnippet(candidate.id)
              ? candidate.id
              : undefined,
          name: typeof candidate.name === 'string' ? candidate.name : '',
          plainText: candidate.plainText,
          content: candidate.content,
          icon: candidate.icon,
          hint: candidate.hint,
          keywords: candidate.keywords,
          favorite: candidate.favorite,
        }),
      )
    } catch {
      skipped += 1
    }
  }

  return { imported, skipped }
}

export function slugifySnippetName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function plainTextToTipTapContent(text: string): JSONContent[] {
  const limited = text.replace(/\r\n/g, '\n').slice(0, SNIPPET_LIMITS.plainTextMax)
  const lines = limited.split('\n')
  const content: JSONContent[] = []
  for (const line of lines) {
    if (line.startsWith('### ')) {
      content.push({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: line.slice(4) }],
      })
    } else if (line.startsWith('## ')) {
      content.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: line.slice(3) }],
      })
    } else if (line.startsWith('- [ ] ')) {
      content.push({
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [
              {
                type: 'paragraph',
                content: line.slice(6) ? [{ type: 'text', text: line.slice(6) }] : [],
              },
            ],
          },
        ],
      })
    } else if (line.startsWith('- ')) {
      content.push({
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: line.slice(2) ? [{ type: 'text', text: line.slice(2) }] : [],
              },
            ],
          },
        ],
      })
    } else if (line.trim() === '') {
      content.push({ type: 'paragraph' })
    } else {
      const parts: Array<{ type: string; text?: string; marks?: Array<{ type: string }> }> = []
      const regex = /\*\*([^*]+)\*\*/g
      let last = 0
      let match: RegExpExecArray | null
      while ((match = regex.exec(line))) {
        if (match.index > last) {
          parts.push({ type: 'text', text: line.slice(last, match.index) })
        }
        parts.push({ type: 'text', text: match[1], marks: [{ type: 'bold' }] })
        last = match.index + match[0].length
      }
      if (last < line.length) parts.push({ type: 'text', text: line.slice(last) })
      content.push({ type: 'paragraph', content: parts.length ? parts : undefined })
    }
  }
  return content
}

/** Prefer stored TipTap JSON; fall back to plain-text conversion. */
export function resolveSnippetInsertContent(snippet: BlockSnippet): JSONContent[] {
  const fromJson = normalizeContentField(snippet.content)
  if (fromJson) return normalizeSnippetFragment(fromJson)
  return plainTextToTipTapContent(snippet.plainText ?? '')
}

function isInlineJsonNode(node: JSONContent): boolean {
  return node.type === 'text' || node.type === 'hardBreak' || node.type === 'emoji'
}

/** Wrap bare inline nodes so insertContent gets a valid block fragment. */
export function normalizeSnippetFragment(nodes: JSONContent[]): JSONContent[] {
  if (nodes.length === 0) return [{ type: 'paragraph' }]
  if (nodes.every(isInlineJsonNode)) {
    return [{ type: 'paragraph', content: nodes }]
  }
  return nodes
}

/**
 * Capture the current selection as a reusable snippet fragment.
 * Returns null when the selection is empty.
 */
export function captureSelectionAsSnippet(editor: Editor): {
  plainText: string
  content: JSONContent[]
} | null {
  if (editor.isDestroyed) return null
  const { from, to, empty } = editor.state.selection
  if (empty) return null

  const plainText = editor.state.doc
    .textBetween(from, to, '\n', '\n')
    .replace(/\r\n/g, '\n')
    .slice(0, SNIPPET_LIMITS.plainTextMax)
  const slice = editor.state.selection.content()
  const raw = slice.content.toJSON() as JSONContent[] | JSONContent | null
  const content = normalizeContentField(raw)
  if (!content || content.length === 0) return null

  const fragment = normalizeSnippetFragment(content)
  const validated = validateSnippetInput(
    {
      name: 'selection',
      plainText,
      content: fragment,
    },
    { isUpdate: true },
  )
  if (!validated.ok) return null

  return {
    plainText,
    content: validated.value.content ?? fragment,
  }
}

export function insertBlockSnippet(
  editor: Editor,
  snippetId: string,
  options: BlockSnippetInsertOptions = {},
): boolean {
  if (editor.isDestroyed) return false
  const id = snippetId.trim()
  if (!id) return false
  const snippet = getBlockSnippet(id)
  if (!snippet) return false
  const content = resolveSnippetInsertContent(snippet)
  if (content.length === 0) return false

  const chain = editor.chain().focus()
  if (options.replaceSelection && !editor.state.selection.empty) {
    chain.deleteSelection()
  }
  if (typeof options.pos === 'number' && Number.isFinite(options.pos)) {
    return chain.insertContentAt(options.pos, content).run()
  }
  return chain.insertContent(content).run()
}

function localizeSnippetValidation(code: SnippetValidationCode): string {
  const key = `slash.customBlock.validation.${code}`
  const translated = i18n.t(key)
  return translated === key ? code : translated
}

/**
 * Prompt for a name (and optional body), persist a custom snippet, and insert it.
 * When the editor has a selection, the TipTap slice is stored as JSON.
 */
export async function createCustomBlockFromEditor(editor: Editor): Promise<BlockSnippet | null> {
  if (editor.isDestroyed) return null
  const selection = captureSelectionAsSnippet(editor)
  const name = await promptInput({
    title: i18n.t('slash.customBlock.nameTitle'),
    description: i18n.t('slash.customBlock.nameDescription'),
    placeholder: i18n.t('slash.customBlock.namePlaceholder'),
    confirmLabel: i18n.t('common.next'),
  })
  if (!name?.trim()) return null
  if (name.trim().length > SNIPPET_LIMITS.nameMax) {
    toast.error(
      i18n.t('slash.customBlock.saveFailed'),
      localizeSnippetValidation('name_too_long'),
    )
    return null
  }

  let plainText: string
  let content: JSONContent[] | undefined

  if (selection) {
    const body = await promptInput({
      title: i18n.t('slash.customBlock.bodyTitle'),
      description: i18n.t('slash.customBlock.bodyDescriptionSelection'),
      defaultValue: selection.plainText.slice(0, SNIPPET_LIMITS.plainTextMax),
      placeholder: i18n.t('slash.customBlock.bodyPlaceholder'),
      confirmLabel: i18n.t('slash.customBlock.save'),
      multiline: true,
    })
    if (body == null) return null
    const trimmed = body.replace(/\r\n/g, '\n')
    if (trimmed.length > SNIPPET_LIMITS.plainTextMax) {
      toast.error(
        i18n.t('slash.customBlock.saveFailed'),
        localizeSnippetValidation('body_too_large'),
      )
      return null
    }
    if (trimmed.trim() && trimmed.trim() !== selection.plainText.trim()) {
      plainText = trimmed
      content = undefined
    } else if (!trimmed.trim()) {
      toast.error(
        i18n.t('slash.customBlock.saveFailed'),
        localizeSnippetValidation('body_required'),
      )
      return null
    } else {
      plainText = selection.plainText
      content = selection.content
    }
  } else {
    const body = await promptInput({
      title: i18n.t('slash.customBlock.bodyTitle'),
      description: i18n.t('slash.customBlock.bodyDescription'),
      defaultValue: '## \n\n',
      placeholder: i18n.t('slash.customBlock.bodyPlaceholder'),
      confirmLabel: i18n.t('slash.customBlock.save'),
      multiline: true,
    })
    if (body == null) return null
    if (!body.trim()) {
      toast.error(
        i18n.t('slash.customBlock.saveFailed'),
        localizeSnippetValidation('body_required'),
      )
      return null
    }
    if (body.length > SNIPPET_LIMITS.plainTextMax) {
      toast.error(
        i18n.t('slash.customBlock.saveFailed'),
        localizeSnippetValidation('body_too_large'),
      )
      return null
    }
    plainText = body
    content = undefined
  }

  try {
    const snippet = upsertCustomBlockSnippet({
      name: name.trim(),
      plainText,
      content,
    })
    if (editor.isDestroyed) return snippet
    insertBlockSnippet(editor, snippet.id, { replaceSelection: Boolean(selection) })
    toast.success(i18n.t('slash.customBlock.saved'), snippet.name)
    return snippet
  } catch (error) {
    const detail =
      error instanceof SnippetValidationError
        ? localizeSnippetValidation(error.code)
        : String(error)
    toast.error(i18n.t('slash.customBlock.saveFailed'), detail)
    return null
  }
}
