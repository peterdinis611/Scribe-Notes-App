/**
 * Public Block API — registry (built-in slash blocks) + custom snippets.
 *
 * Prefer this module for app / plugin code instead of reaching into
 * `block-registry` / `block-snippets` internals directly.
 */

export type {
  BlockDefinition,
  BlockGroup,
  BlockInsertContext,
} from '@/lib/editor/block-registry'
export {
  BlockDefinitionError,
  getBlockDefinition,
  hasBlock,
  insertBlock,
  listAllBlockDefinitions,
  listBlockDefinitions,
  listBlockDefinitionsByGroup,
  registerBlock,
  unregisterBlock,
} from '@/lib/editor/block-registry'

export type {
  BlockSnippet,
  BlockSnippetInsertOptions,
  BlockSnippetPatch,
  BlockSnippetUpsertInput,
  ImportBlockSnippetsResult,
} from '@/lib/editor/block-snippets'
export {
  SnippetValidationError,
  captureSelectionAsSnippet,
  createCustomBlockFromEditor,
  duplicateCustomBlockSnippet,
  exportCustomBlockSnippets,
  getBlockSnippet,
  importCustomBlockSnippets,
  insertBlockSnippet,
  listBlockSnippets,
  listCustomBlockSnippets,
  listFavoriteBlockSnippets,
  patchCustomBlockSnippet,
  removeCustomBlockSnippet,
  renameCustomBlockSnippet,
  resolveSnippetInsertContent,
  searchBlockSnippets,
  setBlockSnippetFavorite,
  upsertCustomBlockSnippet,
} from '@/lib/editor/block-snippets'

export {
  SNIPPET_LIMITS,
  sanitizeJsonContent,
  sanitizeJsonContentList,
  validateBlockDefinition,
  validateSnippetInput,
} from '@/lib/editor/block-snippet-validation'

import type { Editor } from '@tiptap/react'
import {
  getBlockDefinition,
  insertBlock,
  type BlockInsertContext,
} from '@/lib/editor/block-registry'
import {
  getBlockSnippet,
  insertBlockSnippet,
  type BlockSnippetInsertOptions,
} from '@/lib/editor/block-snippets'

export type InsertAnyBlockOptions = BlockInsertContext & BlockSnippetInsertOptions

/**
 * Insert either a registry block (`hr`, `mermaid`, …) or a snippet id.
 * Snippet ids may be passed bare or as `snippet:<id>`.
 */
export function insertAnyBlock(
  editor: Editor,
  id: string,
  options: InsertAnyBlockOptions = {},
): boolean {
  const trimmed = id.trim()
  if (!trimmed) return false

  if (trimmed.startsWith('snippet:')) {
    return insertBlockSnippet(editor, trimmed.slice('snippet:'.length), options)
  }

  if (getBlockSnippet(trimmed) && !getBlockDefinition(trimmed)) {
    return insertBlockSnippet(editor, trimmed, options)
  }

  return insertBlock(editor, trimmed, options)
}
