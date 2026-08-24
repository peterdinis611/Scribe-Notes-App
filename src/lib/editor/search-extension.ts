import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export type SearchMatch = { from: number; to: number }

export type SearchOptions = {
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
}

export type SearchState = {
  term: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  regexError: string | null
  matches: SearchMatch[]
  activeIndex: number
  decorations: DecorationSet
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchReplace: {
      setSearchTerm: (term: string, options?: SearchOptions) => ReturnType
      clearSearch: () => ReturnType
      findNext: () => ReturnType
      findPrevious: () => ReturnType
      replaceCurrent: (replacement: string) => ReturnType
      replaceAll: (replacement: string) => ReturnType
    }
  }
}

export const searchPluginKey = new PluginKey<SearchState>('searchReplace')

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildSearchRegExp(
  term: string,
  options: { caseSensitive: boolean; wholeWord: boolean; regex: boolean },
): { pattern: RegExp | null; error: string | null } {
  if (!term) return { pattern: null, error: null }

  const flags = options.caseSensitive ? 'g' : 'gi'
  let source = term

  try {
    if (options.regex) {
      // Validate by constructing once; reject empty matches that loop forever.
      // eslint-disable-next-line no-new
      new RegExp(term, flags)
      source = term
    } else {
      source = escapeRegExp(term)
    }

    if (options.wholeWord) {
      source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
      return { pattern: new RegExp(source, `${flags}u`), error: null }
    }

    return { pattern: new RegExp(source, flags), error: null }
  } catch (error) {
    return {
      pattern: null,
      error: error instanceof Error ? error.message : 'Invalid regular expression',
    }
  }
}

export function findMatches(
  doc: ProseMirrorNode,
  term: string,
  options: { caseSensitive: boolean; wholeWord: boolean; regex: boolean },
): { matches: SearchMatch[]; regexError: string | null } {
  if (!term) return { matches: [], regexError: null }

  const { pattern, error } = buildSearchRegExp(term, options)
  if (!pattern) return { matches: [], regexError: error }

  const matches: SearchMatch[] = []

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    pattern.lastIndex = 0
    let match = pattern.exec(node.text)
    while (match) {
      const text = match[0]
      if (!text) {
        // Avoid zero-length match infinite loops (e.g. /a*/).
        pattern.lastIndex += 1
        match = pattern.exec(node.text)
        continue
      }
      const from = pos + match.index
      matches.push({ from, to: from + text.length })
      match = pattern.exec(node.text)
    }
  })

  return { matches, regexError: null }
}

function expandReplacement(
  matchedText: string,
  replacement: string,
  options: { regex: boolean; caseSensitive: boolean; wholeWord: boolean; term: string },
): string {
  if (!options.regex) return replacement
  const { pattern } = buildSearchRegExp(options.term, {
    caseSensitive: options.caseSensitive,
    wholeWord: options.wholeWord,
    regex: true,
  })
  if (!pattern) return replacement
  pattern.lastIndex = 0
  return matchedText.replace(pattern, replacement)
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
  wholeWord: boolean,
  regex: boolean,
  preferredIndex: number,
): SearchState {
  const { matches, regexError } = findMatches(state.doc, term, {
    caseSensitive,
    wholeWord,
    regex,
  })
  const activeIndex =
    matches.length === 0 ? -1 : Math.min(Math.max(0, preferredIndex), matches.length - 1)
  return {
    term,
    caseSensitive,
    wholeWord,
    regex,
    regexError,
    matches,
    activeIndex,
    decorations: buildDecorations(state.doc, matches, activeIndex),
  }
}

type SearchMeta =
  | { type: 'set'; term: string; caseSensitive: boolean; wholeWord: boolean; regex: boolean }
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
            wholeWord: false,
            regex: false,
            regexError: null,
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
                wholeWord: value.wholeWord,
                regex: value.regex,
                regexError: null,
                matches: [],
                activeIndex: -1,
                decorations: DecorationSet.empty,
              }
            }

            if (meta?.type === 'set') {
              return recompute(
                newState,
                meta.term,
                meta.caseSensitive,
                meta.wholeWord,
                meta.regex,
                0,
              )
            }

            if (meta?.type === 'setActive') {
              return {
                ...value,
                activeIndex: meta.activeIndex,
                decorations: buildDecorations(newState.doc, value.matches, meta.activeIndex),
              }
            }

            if (tr.docChanged && value.term) {
              return recompute(
                newState,
                value.term,
                value.caseSensitive,
                value.wholeWord,
                value.regex,
                value.activeIndex,
              )
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
                wholeWord: options?.wholeWord ?? false,
                regex: options?.regex ?? false,
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
            const matchedText = state.doc.textBetween(match.from, match.to)
            const next = expandReplacement(matchedText, replacement, {
              regex: search.regex,
              caseSensitive: search.caseSensitive,
              wholeWord: search.wholeWord,
              term: search.term,
            })
            tr.insertText(next, match.from, match.to)
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
              const matchedText = state.doc.textBetween(match.from, match.to)
              const next = expandReplacement(matchedText, replacement, {
                regex: search.regex,
                caseSensitive: search.caseSensitive,
                wholeWord: search.wholeWord,
                term: search.term,
              })
              tr.insertText(next, match.from, match.to)
            }
            dispatch(tr)
          }
          return true
        },
    }
  },
})
