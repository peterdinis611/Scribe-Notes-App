import { Extension, nodeInputRule, wrappingInputRule } from '@tiptap/core'

/**
 * Extra markdown-style shortcuts beyond StarterKit defaults:
 * - `. ` → ordered list (in addition to `1. `)
 * - `---` / `___` / `***` (+ optional space) → horizontal rule
 */
export const MarkdownShortcuts = Extension.create({
  name: 'markdownShortcuts',

  addInputRules() {
    const rules = []
    const { orderedList, horizontalRule } = this.editor.schema.nodes

    if (orderedList) {
      rules.push(
        wrappingInputRule({
          find: /^\.\s$/,
          type: orderedList,
        }),
      )
    }

    if (horizontalRule) {
      rules.push(
        nodeInputRule({
          find: /^(?:---|___|\*\*\*)$/,
          type: horizontalRule,
        }),
        nodeInputRule({
          find: /^(?:---|___|\*\*\*)\s$/,
          type: horizontalRule,
        }),
      )
    }

    return rules
  },
})
