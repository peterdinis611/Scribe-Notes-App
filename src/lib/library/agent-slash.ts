import {
  filterAgentSlashCommands as invokeFilterAgentSlash,
  listAgentSlashCommands as invokeListAgentSlash,
  parseAgentSlash as invokeParseAgentSlash,
  type AgentSlashCommandDto,
  type ParsedAgentSlashDto,
} from '@/lib/db/api'
import type { AgentToolId } from '@/lib/library/agent-prefs'
import type { AgentRecipeId } from '@/lib/library/agent-recipes'
import type { ChatScope } from '@/lib/library/library-chat'

/** Where a slash command is offered / allowed. */
export type AgentSlashScope = 'document' | 'library' | 'folder' | 'any'

export type AgentSlashCommand = {
  id: string
  name: string
  aliases?: string[]
  labelKey: string
  hintKey: string
  scopes: AgentSlashScope[]
  tools?: AgentToolId[]
  recipeId?: AgentRecipeId
  passArgs?: boolean
  defaultGoalKey?: string
}

export type ParsedAgentSlash = {
  command: AgentSlashCommand
  goal: string
  forceTools?: AgentToolId[]
  recipeId?: AgentRecipeId
  args: string
}

let catalogCache: AgentSlashCommand[] | null = null
let catalogPromise: Promise<AgentSlashCommand[]> | null = null

function fromDto(dto: AgentSlashCommandDto): AgentSlashCommand {
  return {
    id: dto.id,
    name: dto.name,
    aliases: dto.aliases?.length ? dto.aliases : undefined,
    labelKey: dto.labelKey,
    hintKey: dto.hintKey,
    scopes: (dto.scopes ?? []) as AgentSlashScope[],
    tools: dto.tools?.length ? (dto.tools as AgentToolId[]) : undefined,
    recipeId: (dto.recipeId as AgentRecipeId | undefined) ?? undefined,
    passArgs: dto.passArgs ?? false,
    defaultGoalKey: dto.defaultGoalKey ?? undefined,
  }
}

function fold(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function scopeAllowed(cmd: AgentSlashCommand, scope: ChatScope): boolean {
  if (cmd.scopes.includes('any')) return true
  return cmd.scopes.includes(scope)
}

/** Load full slash catalog from Rust (cached). Falls back to empty when invoke fails (vitest). */
export async function ensureAgentSlashCatalog(): Promise<AgentSlashCommand[]> {
  if (catalogCache) return catalogCache
  if (!catalogPromise) {
    catalogPromise = invokeListAgentSlash(null)
      .then((rows) => {
        catalogCache = rows.map(fromDto)
        return catalogCache
      })
      .catch(() => {
        catalogCache = catalogCache ?? []
        return catalogCache
      })
      .finally(() => {
        catalogPromise = null
      })
  }
  return catalogPromise
}

/** Sync view of last loaded catalog (may be empty before ensure). */
export function getCachedAgentSlashCommands(): AgentSlashCommand[] {
  return catalogCache ?? []
}

/** @internal vitest — seed catalog without Tauri. */
export function seedAgentSlashCatalogForTests(rows: AgentSlashCommand[]) {
  catalogCache = rows
}

function toolsForSlashCommand(
  cmd: AgentSlashCommand,
  scope: ChatScope,
): AgentToolId[] | undefined {
  if (!cmd.tools?.length && cmd.id !== 'talk') return undefined
  if (cmd.id === 'talk') {
    return scope === 'document' ? ['document_answer'] : ['library_answer']
  }
  return cmd.tools
}

function commandFromParsed(parsed: Extract<ParsedAgentSlashDto, { kind: 'ok' }>): AgentSlashCommand {
  return {
    id: parsed.commandId,
    name: parsed.name,
    labelKey: parsed.labelKey,
    hintKey: parsed.hintKey,
    scopes: ['any'],
    tools: parsed.forceTools as AgentToolId[],
    recipeId: (parsed.recipeId as AgentRecipeId | undefined) ?? undefined,
    passArgs: parsed.passArgs,
    defaultGoalKey: parsed.defaultGoalKey ?? undefined,
  }
}

/**
 * Parse a composer goal that starts with `/`.
 * Prefers Rust (`parse_agent_slash`); sync catalog fallback for vitest without Tauri.
 */
export async function parseAgentSlashAsync(
  raw: string,
  scope: ChatScope,
  t: (key: string) => string,
): Promise<ParsedAgentSlash | { unknown: true; token: string } | null> {
  try {
    const parsed = await invokeParseAgentSlash(raw, scope)
    return applyParsedDto(parsed, t)
  } catch {
    return parseAgentSlash(raw, scope, t)
  }
}

function applyParsedDto(
  parsed: ParsedAgentSlashDto,
  t: (key: string) => string,
): ParsedAgentSlash | { unknown: true; token: string } | null {
  if (parsed.kind === 'none') return null
  if (parsed.kind === 'unknown') return { unknown: true, token: parsed.token }
  const command = commandFromParsed(parsed)
  const args = parsed.args
  const goal = args
    ? args
    : parsed.defaultGoalKey
      ? t(parsed.defaultGoalKey)
      : `/${parsed.name}`
  return {
    command,
    goal,
    forceTools: parsed.forceTools.length
      ? (parsed.forceTools as AgentToolId[])
      : undefined,
    recipeId: (parsed.recipeId as AgentRecipeId | undefined) ?? undefined,
    args,
  }
}

/**
 * Sync parse using cached catalog (vitest / offline). Production submit uses parseAgentSlashAsync.
 */
export function parseAgentSlash(
  raw: string,
  scope: ChatScope,
  t: (key: string) => string,
): ParsedAgentSlash | { unknown: true; token: string } | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/')) return null

  const body = trimmed.slice(1)
  if (!body) return { unknown: true, token: '' }

  const match = /^([^\s/]+)(?:\s+([\s\S]*))?$/.exec(body)
  if (!match) return { unknown: true, token: body }

  const token = fold(match[1] ?? '')
  const args = (match[2] ?? '').trim()
  const catalog = catalogCache ?? []
  const command = catalog.find((cmd) => {
    if (fold(cmd.name) === token) return true
    return (cmd.aliases ?? []).some((alias) => fold(alias) === token)
  })
  if (!command) return { unknown: true, token: match[1] ?? token }
  if (!scopeAllowed(command, scope)) return { unknown: true, token: match[1] ?? token }

  const forceTools = toolsForSlashCommand(command, scope)
  let goal = args
  if (!goal) {
    goal = command.defaultGoalKey ? t(command.defaultGoalKey) : `/${command.name}`
  }

  return {
    command,
    goal,
    forceTools,
    recipeId: command.recipeId,
    args,
  }
}

/** Autocomplete — prefers Rust filter; falls back to cached catalog. */
export async function filterAgentSlashCommandsAsync(
  query: string,
  scope: ChatScope,
  limit = 10,
): Promise<AgentSlashCommand[]> {
  try {
    const rows = await invokeFilterAgentSlash(query, scope, limit)
    return rows.map(fromDto)
  } catch {
    return filterAgentSlashCommands(query, scope, limit)
  }
}

/** Sync filter over cached catalog (after ensureAgentSlashCatalog). */
export function filterAgentSlashCommands(
  query: string,
  scope: ChatScope,
  limit = 10,
): AgentSlashCommand[] {
  const q = fold(query.replace(/^\//, ''))
  const out: AgentSlashCommand[] = []
  for (const cmd of catalogCache ?? []) {
    if (!scopeAllowed(cmd, scope)) continue
    if (!q) {
      out.push(cmd)
    } else {
      const hay = [cmd.name, ...(cmd.aliases ?? [])].map(fold)
      if (hay.some((item) => item.startsWith(q) || item.includes(q))) {
        out.push(cmd)
      }
    }
    if (out.length >= limit) break
  }
  return out
}

/** True while the user is still typing the command name (before the first space). */
export function isAgentSlashMenuOpen(value: string): boolean {
  if (!value.startsWith('/')) return false
  return !/\s/.test(value.slice(1))
}

/** Extract the query fragment after `/` for filtering (before first space). */
export function agentSlashQuery(value: string): string {
  if (!value.startsWith('/')) return ''
  const rest = value.slice(1)
  const space = rest.indexOf(' ')
  return space === -1 ? rest : rest.slice(0, space)
}

export type { AgentSlashCommandDto, ParsedAgentSlashDto }
