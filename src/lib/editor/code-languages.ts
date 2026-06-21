export interface CodeLanguage {
  id: string
  label: string
}

/** Jazyky podporované v editore (highlight.js cez lowlight). */
export const CODE_LANGUAGES: CodeLanguage[] = [
  { id: 'auto', label: 'Automaticky' },
  { id: 'plaintext', label: 'Plain text' },
  { id: 'bash', label: 'Bash / Shell' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'css', label: 'CSS' },
  { id: 'dart', label: 'Dart' },
  { id: 'dockerfile', label: 'Dockerfile' },
  { id: 'elixir', label: 'Elixir' },
  { id: 'go', label: 'Go' },
  { id: 'graphql', label: 'GraphQL' },
  { id: 'haskell', label: 'Haskell' },
  { id: 'html', label: 'HTML' },
  { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'lua', label: 'Lua' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'objectivec', label: 'Objective-C' },
  { id: 'perl', label: 'Perl' },
  { id: 'php', label: 'PHP' },
  { id: 'powershell', label: 'PowerShell' },
  { id: 'python', label: 'Python' },
  { id: 'r', label: 'R' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'rust', label: 'Rust' },
  { id: 'scala', label: 'Scala' },
  { id: 'scss', label: 'SCSS' },
  { id: 'sql', label: 'SQL' },
  { id: 'swift', label: 'Swift' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'wasm', label: 'WebAssembly' },
  { id: 'xml', label: 'XML' },
  { id: 'yaml', label: 'YAML' },
]

const LANGUAGE_ALIASES: Record<string, string> = {
  html: 'xml',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  yml: 'yaml',
  md: 'markdown',
  docker: 'dockerfile',
}

export function resolveCodeLanguage(language: string | null | undefined): string | null {
  if (!language || language === 'auto') return null
  return LANGUAGE_ALIASES[language] ?? language
}

export function getCodeLanguageLabel(language: string | null | undefined): string {
  if (!language) return 'Automaticky'
  const match = CODE_LANGUAGES.find((item) => item.id === language)
  return match?.label ?? language
}
