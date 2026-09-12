import hljs from 'highlight.js'

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
