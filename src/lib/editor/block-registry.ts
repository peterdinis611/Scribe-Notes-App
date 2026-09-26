import type { Editor } from '@tiptap/react'
import {
  insertBlockMath,
  insertD3Chart,
  insertEmptyVideoBlock,
  insertLeafletMap,
  insertInlineMath,
  insertLoremIpsum,
  insertMermaidDiagram,
} from '@/lib/editor/insert-helpers'
import {
  insertEmptyImageBlock,
  insertEmptyLottieBlock,
  insertImageFromUrl,
  isLikelyImageUrl,
} from '@/lib/editor/image-utils'
import { insertBulletList, insertOrderedList, insertTaskList } from '@/lib/editor/list-commands'
import { createCommentForSelection } from '@/lib/editor/comments'
import { createCustomBlockFromEditor, insertBlockSnippet } from '@/lib/editor/block-snippets'
import { validateBlockDefinition } from '@/lib/editor/block-snippet-validation'
import { promptInput } from '@/lib/input-dialog'
import i18n from '@/i18n'

export class BlockDefinitionError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'BlockDefinitionError'
    this.code = code
  }
}

export type BlockInsertContext = {
  onInsertImages?: (files: File[], pos?: number) => void | Promise<void>
  /** Absolute document position hint for inserts that support it. */
  pos?: number
  /** Delete the current selection before running the block insert. */
  replaceSelection?: boolean
}

export type BlockGroup = 'basic' | 'media' | 'embed' | 'advanced' | 'snippet'

export type BlockDefinition = {
  id: string
  icon?: string
  /** Extra ids that resolve to this block (hidden aliases). */
  aliases?: string[]
  group?: BlockGroup
  keywords?: string[]
  /**
   * When false, the block is invokable via `insertBlock` / aliases but omitted
   * from the slash catalog (e.g. legacy snippet-meeting).
   */
  slash?: boolean
  insert: (editor: Editor, ctx?: BlockInsertContext) => void | Promise<void>
}

function heading(level: 1 | 2 | 3 | 4 | 5 | 6, icon: string): BlockDefinition {
  return {
    id: `h${level}`,
    icon,
    group: 'basic',
    insert: (editor) => {
      editor.chain().focus().setHeading({ level }).run()
    },
  }
}

const BLOCK_DEFINITIONS: BlockDefinition[] = [
  heading(1, 'H1'),
  heading(2, 'H2'),
  heading(3, 'H3'),
  heading(4, 'H4'),
  heading(5, 'H5'),
  heading(6, 'H6'),
  {
    id: 'bullet',
    icon: '•',
    group: 'basic',
    insert: (editor) => insertBulletList(editor),
  },
  {
    id: 'ordered',
    icon: '1.',
    group: 'basic',
    insert: (editor) => insertOrderedList(editor),
  },
  {
    id: 'task',
    icon: '☑',
    group: 'basic',
    insert: (editor) => insertTaskList(editor),
  },
  {
    id: 'quote',
    icon: '❝',
    group: 'basic',
    insert: (editor) => {
      editor.chain().focus().toggleBlockquote().run()
    },
  },
  {
    id: 'inline-code',
    icon: '‹›',
    group: 'basic',
    insert: (editor) => {
      editor.chain().focus().setMark('code').run()
    },
  },
  {
    id: 'code',
    icon: '</>',
    group: 'basic',
    insert: (editor) => {
      editor.chain().focus().toggleCodeBlock().run()
    },
  },
  {
    id: 'table',
    icon: '⊞',
    group: 'basic',
    insert: (editor) => {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    },
  },
  {
    id: 'image',
    icon: '🖼',
    group: 'media',
    insert: (editor) => insertEmptyImageBlock(editor),
  },
  {
    id: 'image-url',
    icon: '🔗🖼',
    group: 'media',
    insert: async (editor) => {
      const url = await promptInput({
        title: i18n.t('image.urlTitle'),
        description: i18n.t('image.urlHint'),
        defaultValue: 'https://',
        placeholder: 'https://',
        confirmLabel: i18n.t('image.urlInsert'),
      })
      if (url && (isLikelyImageUrl(url) || /^https?:\/\//i.test(url.trim()))) {
        insertImageFromUrl(editor, url.trim())
      }
    },
  },
  {
    id: 'lottie',
    icon: '✦',
    group: 'media',
    insert: (editor) => insertEmptyLottieBlock(editor),
  },
  {
    id: 'video',
    icon: '▶',
    group: 'media',
    insert: (editor) => insertEmptyVideoBlock(editor),
  },
  {
    id: 'map',
    icon: '◎',
    group: 'embed',
    insert: (editor) => insertLeafletMap(editor),
  },
  {
    id: 'leaflet',
    icon: '⌖',
    group: 'embed',
    keywords: ['map', 'osm'],
    insert: (editor) => insertLeafletMap(editor),
  },
  {
    id: 'math-inline',
    icon: 'ƒ',
    group: 'embed',
    insert: (editor) => void insertInlineMath(editor),
  },
  {
    id: 'math-block',
    icon: '∑',
    group: 'embed',
    insert: (editor) => void insertBlockMath(editor),
  },
  {
    id: 'mermaid',
    icon: '⬡',
    group: 'embed',
    insert: (editor) => insertMermaidDiagram(editor),
  },
  {
    id: 'chart',
    icon: '▣',
    group: 'embed',
    insert: (editor) => insertD3Chart(editor),
  },
  {
    id: 'd3',
    icon: '◈',
    group: 'embed',
    keywords: ['chart'],
    insert: (editor) => insertD3Chart(editor),
  },
  {
    id: 'hr',
    icon: '—',
    group: 'basic',
    insert: (editor) => {
      editor.chain().focus().setHorizontalRule().run()
    },
  },
  {
    id: 'callout-info',
    icon: 'ℹ️',
    group: 'basic',
    insert: (editor) => {
      editor.chain().focus().toggleCallout('info').run()
    },
  },
  {
    id: 'callout-tip',
    icon: '💡',
    group: 'basic',
    insert: (editor) => {
      editor.chain().focus().toggleCallout('tip').run()
    },
  },
  {
    id: 'callout-warning',
    icon: '⚠️',
    group: 'basic',
    insert: (editor) => {
      editor.chain().focus().toggleCallout('warning').run()
    },
  },
  {
    id: 'callout-danger',
    icon: '🛑',
    group: 'basic',
    insert: (editor) => {
      editor.chain().focus().toggleCallout('danger').run()
    },
  },
  {
    id: 'footnote',
    icon: '⁽¹⁾',
    group: 'advanced',
    insert: (editor) => {
      editor.chain().focus().insertFootnote().run()
    },
  },
  {
    id: 'comment',
    icon: '💬',
    group: 'advanced',
    insert: (editor) => void createCommentForSelection(editor),
  },
  {
    id: 'wiki-link',
    icon: '🔗',
    group: 'advanced',
    insert: (editor) => {
      editor.chain().focus().insertContent('[[').run()
    },
  },
  {
    id: 'wiki-embed',
    icon: '⧉',
    group: 'advanced',
    insert: (editor) => {
      editor.chain().focus().insertContent('![[').run()
    },
  },
  {
    id: 'custom-block',
    icon: '＋',
    group: 'snippet',
    insert: (editor) => void createCustomBlockFromEditor(editor),
  },
  {
    id: 'lorem',
    icon: '¶',
    group: 'advanced',
    insert: (editor) => void insertLoremIpsum(editor),
  },
  {
    id: 'toc',
    icon: '≡',
    group: 'advanced',
    insert: (editor) => {
      editor.chain().focus().insertTableOfContents().run()
    },
  },
  // Legacy slash ids from older tests / callers
  {
    id: 'snippet-meeting',
    slash: false,
    group: 'snippet',
    insert: (editor) => {
      insertBlockSnippet(editor, 'meeting-notes')
    },
  },
  {
    id: 'snippet-decision',
    slash: false,
    group: 'snippet',
    insert: (editor) => {
      insertBlockSnippet(editor, 'decision')
    },
  },
]

const byId = new Map<string, BlockDefinition>()
const byAlias = new Map<string, BlockDefinition>()

for (const def of BLOCK_DEFINITIONS) {
  byId.set(def.id, def)
  for (const alias of def.aliases ?? []) {
    byAlias.set(alias, def)
  }
}

/** Static slash-visible block catalog (excludes snippets and legacy aliases). */
export function listBlockDefinitions(): BlockDefinition[] {
  return BLOCK_DEFINITIONS.filter((def) => def.slash !== false)
}

/** All registered blocks, including `slash: false` aliases / legacy ids. */
export function listAllBlockDefinitions(): BlockDefinition[] {
  return [...BLOCK_DEFINITIONS]
}

export function listBlockDefinitionsByGroup(group: BlockGroup): BlockDefinition[] {
  return listBlockDefinitions().filter((def) => def.group === group)
}

export function getBlockDefinition(id: string): BlockDefinition | undefined {
  return byId.get(id) ?? byAlias.get(id)
}

export function hasBlock(id: string): boolean {
  return Boolean(getBlockDefinition(id.trim()))
}

/** Insert a registered block by id (or alias). Returns false if unknown. */
export function insertBlock(
  editor: Editor,
  id: string,
  ctx: BlockInsertContext = {},
): boolean {
  if (editor.isDestroyed) return false
  const trimmed = id.trim()
  if (!trimmed) return false
  const def = getBlockDefinition(trimmed)
  if (!def) return false

  if (ctx.replaceSelection && !editor.state.selection.empty) {
    editor.chain().focus().deleteSelection().run()
  }

  void def.insert(editor, ctx)
  return true
}

/**
 * Register an additional block at runtime (plugins / tests).
 * Replaces an existing id when present.
 */
export function registerBlock(def: BlockDefinition): void {
  const validated = validateBlockDefinition(def)
  if (!validated.ok) {
    throw new BlockDefinitionError(validated.error.code, validated.error.message)
  }

  const normalized: BlockDefinition = {
    ...def,
    id: validated.value.id,
    ...(validated.value.aliases ? { aliases: validated.value.aliases } : {}),
  }

  const previous = byId.get(normalized.id)
  if (previous) {
    const index = BLOCK_DEFINITIONS.indexOf(previous)
    if (index >= 0) BLOCK_DEFINITIONS.splice(index, 1, normalized)
    for (const alias of previous.aliases ?? []) {
      if (byAlias.get(alias) === previous) byAlias.delete(alias)
    }
  } else {
    BLOCK_DEFINITIONS.push(normalized)
  }
  byId.set(normalized.id, normalized)
  for (const alias of normalized.aliases ?? []) {
    byAlias.set(alias, normalized)
  }
}

/** Remove a runtime-registered block. Built-ins can also be removed for tests. */
export function unregisterBlock(id: string): boolean {
  const trimmed = id.trim()
  if (!trimmed) return false
  const existing = byId.get(trimmed)
  if (!existing) return false

  const index = BLOCK_DEFINITIONS.indexOf(existing)
  if (index >= 0) BLOCK_DEFINITIONS.splice(index, 1)
  byId.delete(existing.id)
  for (const alias of existing.aliases ?? []) {
    if (byAlias.get(alias) === existing) byAlias.delete(alias)
  }
  return true
}
