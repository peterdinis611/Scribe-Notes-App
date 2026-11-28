import hljs from 'highlight.js'

/** Pinned ids / aliases mirrored in `scribe_ui::code_languages` (hljs list stays here). */

export interface CodeLanguage {
  id: string
  label: string
}

/** Display labels for common language ids (fallback: title-cased id). */
const LABEL_OVERRIDES: Record<string, string> = {
  '1c': '1C',
  'clojure-repl': 'Clojure REPL',
  'erlang-repl': 'Erlang REPL',
  'julia-repl': 'Julia REPL',
  'node-repl': 'Node REPL',
  'php-template': 'PHP template',
  'python-repl': 'Python REPL',
  'vbscript-html': 'VBScript HTML',
  actionscript: 'ActionScript',
  applescript: 'AppleScript',
  armasm: 'ARM Assembly',
  autohotkey: 'AutoHotkey',
  bash: 'Bash / Shell',
  cpp: 'C++',
  csharp: 'C#',
  css: 'CSS',
  dockerfile: 'Dockerfile',
  dos: 'DOS / Batch',
  fsharp: 'F#',
  gcode: 'G-code',
  graphql: 'GraphQL',
  html: 'HTML',
  http: 'HTTP',
  javascript: 'JavaScript',
  json: 'JSON',
  latex: 'LaTeX',
  llvm: 'LLVM',
  makefile: 'Makefile',
  markdown: 'Markdown',
  matlab: 'MATLAB',
  mipsasm: 'MIPS Assembly',
  nginx: 'Nginx',
  objectivec: 'Objective-C',
  ocaml: 'OCaml',
  openscad: 'OpenSCAD',
  pgsql: 'PostgreSQL',
  php: 'PHP',
  plaintext: 'Plain text',
  powershell: 'PowerShell',
  protobuf: 'Protocol Buffers',
  python: 'Python',
  ruby: 'Ruby',
  rust: 'Rust',
  scss: 'SCSS',
  shell: 'Shell session',
  sql: 'SQL',
  typescript: 'TypeScript',
  vbnet: 'VB.NET',
  vbscript: 'VBScript',
  wasm: 'WebAssembly',
  x86asm: 'x86 Assembly',
  xml: 'XML / HTML',
  yaml: 'YAML',
}

/** Pinned near the top of the language picker. */
const PINNED_IDS = [
  'plaintext',
  'javascript',
  'typescript',
  'python',
  'rust',
  'go',
  'bash',
  'json',
  'html',
  'css',
  'sql',
  'markdown',
  'yaml',
  'java',
  'kotlin',
  'swift',
  'c',
  'cpp',
  'csharp',
  'php',
  'ruby',
  'dockerfile',
  'xml',
  'scss',
  'graphql',
  'lua',
  'r',
  'dart',
  'scala',
  'powershell',
  'wasm',
] as const

const LANGUAGE_ALIASES: Record<string, string> = {
  html: 'xml',
  htm: 'xml',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  fish: 'bash',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  yml: 'yaml',
  md: 'markdown',
  docker: 'dockerfile',
  ps1: 'powershell',
  ps: 'powershell',
  cs: 'csharp',
  'c++': 'cpp',
  'c#': 'csharp',
  objc: 'objectivec',
  'objective-c': 'objectivec',
  text: 'plaintext',
  txt: 'plaintext',
}

function humanizeLanguageId(id: string): string {
  if (LABEL_OVERRIDES[id]) return LABEL_OVERRIDES[id]!
  return id
    .split(/[-_]/)
    .map((part) => (part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ')
}

function buildCodeLanguages(): CodeLanguage[] {
  const registered = new Set(hljs.listLanguages())
  // Keep picker-friendly aliases even when they resolve to another grammar.
  for (const alias of ['html', 'shell']) {
    if (registered.has(LANGUAGE_ALIASES[alias] ?? alias) || registered.has(alias)) {
      registered.add(alias)
    }
  }

  const rest = [...registered]
    .filter((id) => !(PINNED_IDS as readonly string[]).includes(id))
    .sort((a, b) => humanizeLanguageId(a).localeCompare(humanizeLanguageId(b), undefined, { sensitivity: 'base' }))

  const pinned = PINNED_IDS.filter((id) => registered.has(id) || id === 'html').map((id) => ({
    id,
    label: humanizeLanguageId(id),
  }))

  return [
    { id: 'auto', label: 'Automaticky' },
    ...pinned,
    ...rest.map((id) => ({ id, label: humanizeLanguageId(id) })),
  ]
}

/** All highlight.js languages available in the editor (~192 + auto). */
export const CODE_LANGUAGES: CodeLanguage[] = buildCodeLanguages()

const LABEL_BY_ID = new Map(CODE_LANGUAGES.map((item) => [item.id, item.label]))

export function resolveCodeLanguage(language: string | null | undefined): string | null {
  if (!language || language === 'auto') return null
  const normalized = language.trim().toLowerCase()
  const aliased = LANGUAGE_ALIASES[normalized] ?? normalized
  if (aliased === 'plaintext') return 'plaintext'
  if (hljs.getLanguage(aliased)) return aliased
  if (hljs.getLanguage(normalized)) return normalized
  return aliased
}

export function getCodeLanguageLabel(language: string | null | undefined): string {
  if (!language) return 'Automaticky'
  return LABEL_BY_ID.get(language) ?? LABEL_OVERRIDES[language] ?? language
}

type LanguageHint = { id: string; weight: number; test: RegExp }

/** Distinctive shapes. highlight.js highlightAuto mislabels short snippets (dart, csharp, ruby). */
const LANGUAGE_HINTS: LanguageHint[] = [
  { id: 'rust', weight: 8, test: /\bfn\s+\w+\s*\(/ },
  { id: 'rust', weight: 5, test: /\b(impl|pub\s+(fn|struct|enum|mod)|let\s+mut|use\s+\w+::)\b/ },
  { id: 'python', weight: 8, test: /(^|\n)\s*(async\s+def|def|class)\s+\w+.*:\s*($|\n)/ },
  { id: 'go', weight: 8, test: /(^|\n)package\s+[a-z]\w*/ },
  { id: 'go', weight: 5, test: /\bfunc\s+(\([^)]+\)\s+)?\w+\s*\(/ },
  { id: 'typescript', weight: 6, test: /\b(interface|type)\s+[A-Z]\w*/ },
  { id: 'typescript', weight: 5, test: /\bimport\s+type\b|\bas\s+const\b/ },
  { id: 'typescript', weight: 5, test: /:\s*(string|number|boolean|unknown|any|never|void|Promise<|Record<)/ },
  { id: 'javascript', weight: 6, test: /\b(import|export)\b[^;\n]{0,160}\bfrom\s+['"`]/ },
  { id: 'javascript', weight: 5, test: /['"]use (client|server|cache)['"]/ },
  { id: 'javascript', weight: 4, test: /\b(const|let|function|async|await)\b|=>/ },
  { id: 'sql', weight: 6, test: /\b(select|insert|update|delete|create\s+table)\b[\s\S]{0,240}\b(from|into|set|where|values)\b/i },
  { id: 'html', weight: 5, test: /<\/?(html|body|div|span|p|section|article|button|ul|li|h[1-6])\b/i },
  { id: 'css', weight: 5, test: /(^|\n)\s*[.#]?[\w-]+\s*\{[^}]*:\s*[^;}+]+;/ },
  { id: 'bash', weight: 8, test: /^#!\/bin\/(ba|z)?sh\b/m },
  { id: 'bash', weight: 5, test: /(^|\n)\s*(echo|export|fi|done|elif)\b/ },
]

function looksLikeSource(sample: string): boolean {
  return /[{};]|=>|::|<\//.test(sample) || /(^|\n)\s{2,}\S/.test(sample) || /(^|\n)\s*(def|class|fn|func)\b/.test(sample)
}

/**
 * Guess a picker language id for an unlabeled code block.
 * Returns null when the sample is too short or too ambiguous to restyle as a language.
 */
export function detectCodeLanguage(code: string): string | null {
  const sample = code.replace(/\r\n/g, '\n').trim()
  if (sample.length < 8) return null

  const scores = new Map<string, number>()
  for (const hint of LANGUAGE_HINTS) {
    if (!hint.test.test(sample)) continue
    scores.set(hint.id, (scores.get(hint.id) ?? 0) + hint.weight)
  }

  if (/^\s*[{[]/.test(sample)) {
    try {
      const parsed = JSON.parse(sample) as unknown
      if (parsed && typeof parsed === 'object') {
        scores.set('json', (scores.get('json') ?? 0) + 8)
      }
    } catch {
      // Not JSON.
    }
  }

  const typescript = scores.get('typescript') ?? 0
  const javascript = scores.get('javascript') ?? 0
  if (typescript >= 5 && javascript > 0) {
    scores.set('typescript', typescript + javascript)
    scores.delete('javascript')
  }

  let bestId: string | null = null
  let best = 0
  let second = 0
  for (const [id, score] of scores) {
    if (score > best) {
      second = best
      best = score
      bestId = id
    } else if (score > second) {
      second = score
    }
  }

  if (!bestId || best < 5 || best - second < 2) return null
  if (best < 8 && !looksLikeSource(sample)) return null
  if (bestId !== 'json' && !resolveCodeLanguage(bestId) && !LABEL_BY_ID.has(bestId)) return null
  return bestId
}

export function filterCodeLanguages(query: string): CodeLanguage[] {
  const q = query.trim().toLowerCase()
  if (!q) return CODE_LANGUAGES
  return CODE_LANGUAGES.filter(
    (item) =>
      item.id.toLowerCase().includes(q) ||
      item.label.toLowerCase().includes(q) ||
      (LANGUAGE_ALIASES[q] != null && LANGUAGE_ALIASES[q] === item.id),
  )
}
