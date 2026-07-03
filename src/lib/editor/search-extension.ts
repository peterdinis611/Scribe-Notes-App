import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export type SearchMatch = { from: number; to: number }

export type SearchState = {
  term: string
  caseSensitive: boolean
  matches: SearchMatch[]
  activeIndex: number
  decorations: DecorationSet
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchReplace: {
      setSearchTerm: (term: string, options?: { caseSensitive?: boolean }) => ReturnType
      clearSearch: () => ReturnType
      findNext: () => ReturnType
      findPrevious: () => ReturnType
      replaceCurrent: (replacement: string) => ReturnType
      replaceAll: (replacement: string) => ReturnType
    }
  }
}

export const searchPluginKey = new PluginKey<SearchState>('searchReplace')

function findMatches(doc: ProseMirrorNode, term: string, caseSensitive: boolean): SearchMatch[] {
  const matches: SearchMatch[] = []
  if (!term) return matches

  const needle = caseSensitive ? term : term.toLowerCase()

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const haystack = caseSensitive ? node.text : node.text.toLowerCase()
    let index = haystack.indexOf(needle)
    while (index !== -1) {
      const from = pos + index
      matches.push({ from, to: from + term.length })
      index = haystack.indexOf(needle, index + Math.max(1, needle.length))
    }
  })

  return matches
}

function buildDecorations(
  doc: ProseMirrorNode,
  matches: SearchMatch[],
  activeIndex: number,
): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty
  const decorations = matches.map((match, index) =>
    Decoration.inline(match.from, match.to, {
      class: index === activeIndex ? 'editor-search-match editor-search-match--active' : 'editor-search-match',
    }),
  )
  return DecorationSet.create(doc, decorations)
}

function recompute(
  state: EditorState,
  term: string,
  caseSensitive: boolean,
  preferredIndex: number,
): SearchState {
  const matches = findMatches(state.doc, term, caseSensitive)
  const activeIndex =
    matches.length === 0 ? -1 : Math.min(Math.max(0, preferredIndex), matches.length - 1)
  return {
    term,
    caseSensitive,
    matches,
    activeIndex,
    decorations: buildDecorations(state.doc, matches, activeIndex),
  }
}

type SearchMeta =
  | { type: 'set'; term: string; caseSensitive: boolean }
  | { type: 'clear' }
  | { type: 'setActive'; activeIndex: number }

export const SearchReplace = Extension.create({
  name: 'searchReplace',

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchPluginKey,
        state: {
          init: () => ({
            term: '',
            caseSensitive: false,
            matches: [],
            activeIndex: -1,
            decorations: DecorationSet.empty,
          }),
          apply(tr: Transaction, value: SearchState, _oldState, newState): SearchState {
            const meta = tr.getMeta(searchPluginKey) as SearchMeta | undefined

            if (meta?.type === 'clear') {
              return {
                term: '',
                caseSensitive: value.caseSensitive,
                matches: [],
                activeIndex: -1,
                decorations: DecorationSet.empty,
              }
            }

            if (meta?.type === 'set') {
              return recompute(newState, meta.term, meta.caseSensitive, 0)
            }

            if (meta?.type === 'setActive') {
              return {
                ...value,
                activeIndex: meta.activeIndex,
                decorations: buildDecorations(newState.doc, value.matches, meta.activeIndex),
              }
            }

            if (tr.docChanged && value.term) {
              return recompute(newState, value.term, value.caseSensitive, value.activeIndex)
            }

            return value
          },
        },
        props: {
          decorations(state) {
            return searchPluginKey.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },

  addCommands() {
    return {
      setSearchTerm:
        (term, options) =>
        ({ state, dispatch, tr }) => {
          if (dispatch) {
            dispatch(
              tr.setMeta(searchPluginKey, {
                type: 'set',
                term,
                caseSensitive: options?.caseSensitive ?? false,
              }),
            )
          }
          void state
          return true
        },
      clearSearch:
        () =>
        ({ dispatch, tr }) => {
          if (dispatch) dispatch(tr.setMeta(searchPluginKey, { type: 'clear' }))
          return true
        },
      findNext:
        () =>
        ({ state, dispatch, tr }) => {
          const search = searchPluginKey.getState(state)
          if (!search || search.matches.length === 0) return false
          const nextIndex = (search.activeIndex + 1) % search.matches.length
          if (dispatch) {
            dispatch(tr.setMeta(searchPluginKey, { type: 'setActive', activeIndex: nextIndex }))
          }
          return true
        },
      findPrevious:
        () =>
        ({ state, dispatch, tr }) => {
          const search = searchPluginKey.getState(state)
          if (!search || search.matches.length === 0) return false
          const prevIndex =
            (search.activeIndex - 1 + search.matches.length) % search.matches.length
          if (dispatch) {
            dispatch(tr.setMeta(searchPluginKey, { type: 'setActive', activeIndex: prevIndex }))
          }
          return true
        },
      replaceCurrent:
        (replacement) =>
        ({ state, dispatch, tr }) => {
          const search = searchPluginKey.getState(state)
          if (!search || search.activeIndex < 0) return false
          const match = search.matches[search.activeIndex]
          if (!match) return false
          if (dispatch) {
            tr.insertText(replacement, match.from, match.to)
            dispatch(tr)
          }
          return true
        },
      replaceAll:
        (replacement) =>
        ({ state, dispatch, tr }) => {
          const search = searchPluginKey.getState(state)
          if (!search || search.matches.length === 0) return false
          if (dispatch) {
            // Replace from last to first so earlier positions stay valid.
            for (let index = search.matches.length - 1; index >= 0; index -= 1) {
              const match = search.matches[index]!
              tr.insertText(replacement, match.from, match.to)
            }
            dispatch(tr)
          }
          return true
        },
    }
  },
})
