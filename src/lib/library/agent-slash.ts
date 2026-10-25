import type { AgentToolId } from '@/lib/library/agent-prefs'
import type { AgentRecipeId } from '@/lib/library/agent-recipes'
import type { ChatScope } from '@/lib/library/library-chat'

/** Where a slash command is offered / allowed. */
export type AgentSlashScope = 'document' | 'library' | 'folder' | 'any'

export type AgentSlashCommand = {
  id: string
  /** Primary name without leading `/`. */
  name: string
  aliases?: string[]
  labelKey: string
  hintKey: string
  scopes: AgentSlashScope[]
  tools?: AgentToolId[]
  recipeId?: AgentRecipeId
  /** Remaining text after the command becomes the goal (Q&A / rewrite focus). */
  passArgs?: boolean
  /** i18n key used when there are no args. */
  defaultGoalKey?: string
}

export type ParsedAgentSlash = {
  command: AgentSlashCommand
  goal: string
  forceTools?: AgentToolId[]
  recipeId?: AgentRecipeId
  args: string
}

/**
 * Agent composer slash shortcuts — map `/name` → tools or recipes.
 * Keep aliases short; SK + EN nicknames welcome.
 */
export const AGENT_SLASH_COMMANDS: AgentSlashCommand[] = [
  {
    id: 'talk',
    name: 'talk',
    aliases: ['ask', 'q', 'hovor', 'otazka'],
    labelKey: 'agent.slash.talk.label',
    hintKey: 'agent.slash.talk.hint',
    scopes: ['any'],
    tools: ['document_answer'],
    passArgs: true,
    defaultGoalKey: 'agent.slash.talk.defaultGoal',
  },
  {
    id: 'library',
    name: 'library',
    aliases: ['lib', 'kniznica'],
    labelKey: 'agent.slash.library.label',
    hintKey: 'agent.slash.library.hint',
    scopes: ['library', 'folder', 'any'],
    tools: ['library_answer'],
    passArgs: true,
    defaultGoalKey: 'agent.slash.library.defaultGoal',
  },
  {
    id: 'summary',
    name: 'summary',
    aliases: ['sum', 'zhrnutie', 'tldr'],
    labelKey: 'agent.slash.summary.label',
    hintKey: 'agent.slash.summary.hint',
    scopes: ['document', 'any'],
    tools: ['summarize'],
    defaultGoalKey: 'agent.tools.summarize',
  },
  {
    id: 'outline',
    name: 'outline',
    aliases: ['osnova'],
    labelKey: 'agent.slash.outline.label',
    hintKey: 'agent.slash.outline.hint',
    scopes: ['document', 'any'],
    tools: ['outline'],
    defaultGoalKey: 'agent.tools.outline',
  },
  {
    id: 'brief',
    name: 'brief',
    aliases: ['pulse'],
    labelKey: 'agent.slash.brief.label',
    hintKey: 'agent.slash.brief.hint',
    scopes: ['document', 'any'],
    tools: ['brief', 'note_pulse'],
    defaultGoalKey: 'agent.tools.brief',
  },
  {
    id: 'meeting',
    name: 'meeting',
    aliases: ['meet', 'porada'],
    labelKey: 'agent.slash.meeting.label',
    hintKey: 'agent.slash.meeting.hint',
    scopes: ['document', 'any'],
    tools: ['meeting'],
    defaultGoalKey: 'agent.tools.meeting',
  },
  {
    id: 'wrap',
    name: 'wrap',
    aliases: ['meetingwrap'],
    labelKey: 'agent.slash.wrap.label',
    hintKey: 'agent.slash.wrap.hint',
    scopes: ['document', 'any'],
    recipeId: 'meeting_wrap',
  },
  {
    id: 'plan',
    name: 'plan',
    aliases: ['ahead', 'planuj'],
    labelKey: 'agent.slash.plan.label',
    hintKey: 'agent.slash.plan.hint',
    scopes: ['document', 'any'],
    tools: ['forward_plan'],
    defaultGoalKey: 'agent.tools.forward_plan',
  },
  {
    id: 'tasks',
    name: 'tasks',
    aliases: ['todo', 'ulohy'],
    labelKey: 'agent.slash.tasks.label',
    hintKey: 'agent.slash.tasks.hint',
    scopes: ['document', 'any'],
    tools: ['tasks', 'action_items'],
    defaultGoalKey: 'agent.tools.tasks',
  },
  {
    id: 'actions',
    name: 'actions',
    aliases: ['action'],
    labelKey: 'agent.slash.actions.label',
    hintKey: 'agent.slash.actions.hint',
    scopes: ['document', 'any'],
    tools: ['action_items', 'rank_tasks'],
    defaultGoalKey: 'agent.tools.action_items',
  },
  {
    id: 'decisions',
    name: 'decisions',
    aliases: ['decide', 'rozhodnutia'],
    labelKey: 'agent.slash.decisions.label',
    hintKey: 'agent.slash.decisions.hint',
    scopes: ['document', 'any'],
    tools: ['decisions'],
    defaultGoalKey: 'agent.tools.decisions',
  },
  {
    id: 'loops',
    name: 'loops',
    aliases: ['open', 'slucky'],
    labelKey: 'agent.slash.loops.label',
    hintKey: 'agent.slash.loops.hint',
    scopes: ['document', 'any'],
    tools: ['open_loops'],
    defaultGoalKey: 'agent.tools.open_loops',
  },
  {
    id: 'commitments',
    name: 'commitments',
    aliases: ['promises', 'zavazky'],
    labelKey: 'agent.slash.commitments.label',
    hintKey: 'agent.slash.commitments.hint',
    scopes: ['document', 'any'],
    tools: ['commitments'],
    defaultGoalKey: 'agent.tools.commitments',
  },
  {
    id: 'dates',
    name: 'dates',
    aliases: ['deadlines', 'terminy'],
    labelKey: 'agent.slash.dates.label',
    hintKey: 'agent.slash.dates.hint',
    scopes: ['any'],
    tools: ['dates'],
    defaultGoalKey: 'agent.tools.dates',
  },
  {
    id: 'spell',
    name: 'spell',
    aliases: ['typo', 'pravopis'],
    labelKey: 'agent.slash.spell.label',
    hintKey: 'agent.slash.spell.hint',
    scopes: ['document', 'any'],
    tools: ['spellcheck'],
    defaultGoalKey: 'agent.tools.spellcheck',
  },
  {
    id: 'grammar',
    name: 'grammar',
    aliases: ['gramatika'],
    labelKey: 'agent.slash.grammar.label',
    hintKey: 'agent.slash.grammar.hint',
    scopes: ['document', 'any'],
    tools: ['grammar'],
    defaultGoalKey: 'agent.tools.grammar',
  },
  {
    id: 'polish',
    name: 'polish',
    aliases: ['vylepsi'],
    labelKey: 'agent.slash.polish.label',
    hintKey: 'agent.slash.polish.hint',
    scopes: ['document', 'any'],
    recipeId: 'polish',
  },
  {
    id: 'rewrite',
    name: 'rewrite',
    aliases: ['prepis'],
    labelKey: 'agent.slash.rewrite.label',
    hintKey: 'agent.slash.rewrite.hint',
    scopes: ['document', 'any'],
    tools: ['rewrite'],
    passArgs: true,
    defaultGoalKey: 'agent.tools.rewrite',
  },
  {
    id: 'tone',
    name: 'tone',
    aliases: ['ton'],
    labelKey: 'agent.slash.tone.label',
    hintKey: 'agent.slash.tone.hint',
    scopes: ['document', 'any'],
    tools: ['tone'],
    defaultGoalKey: 'agent.tools.tone',
  },
  {
    id: 'style',
    name: 'style',
    aliases: ['coach'],
    labelKey: 'agent.slash.style.label',
    hintKey: 'agent.slash.style.hint',
    scopes: ['document', 'any'],
    tools: ['style'],
    defaultGoalKey: 'agent.tools.style',
  },
  {
    id: 'explain',
    name: 'explain',
    aliases: ['vysvetli'],
    labelKey: 'agent.slash.explain.label',
    hintKey: 'agent.slash.explain.hint',
    scopes: ['document', 'any'],
    tools: ['explain'],
    passArgs: true,
    defaultGoalKey: 'agent.quickPrompts.explain',
  },
  {
    id: 'simplify',
    name: 'simplify',
    aliases: ['eli5', 'zjednodus'],
    labelKey: 'agent.slash.simplify.label',
    hintKey: 'agent.slash.simplify.hint',
    scopes: ['document', 'any'],
    tools: ['simplify'],
    defaultGoalKey: 'agent.tools.simplify',
  },
  {
    id: 'takeaways',
    name: 'takeaways',
    aliases: ['key', 'zavery'],
    labelKey: 'agent.slash.takeaways.label',
    hintKey: 'agent.slash.takeaways.hint',
    scopes: ['document', 'any'],
    tools: ['takeaways'],
    defaultGoalKey: 'agent.tools.takeaways',
  },
  {
    id: 'study',
    name: 'study',
    aliases: ['ucenie'],
    labelKey: 'agent.slash.study.label',
    hintKey: 'agent.slash.study.hint',
    scopes: ['document', 'any'],
    recipeId: 'study_pass',
  },
  {
    id: 'deep',
    name: 'deep',
    aliases: ['deepread'],
    labelKey: 'agent.slash.deep.label',
    hintKey: 'agent.slash.deep.hint',
    scopes: ['document', 'any'],
    recipeId: 'deep_read',
  },
  {
    id: 'cards',
    name: 'cards',
    aliases: ['flashcards', 'karticky'],
    labelKey: 'agent.slash.cards.label',
    hintKey: 'agent.slash.cards.hint',
    scopes: ['document', 'any'],
    tools: ['flashcards'],
    defaultGoalKey: 'agent.tools.flashcards',
  },
  {
    id: 'quiz',
    name: 'quiz',
    aliases: ['kviz'],
    labelKey: 'agent.slash.quiz.label',
    hintKey: 'agent.slash.quiz.hint',
    scopes: ['document', 'any'],
    tools: ['quiz'],
    defaultGoalKey: 'agent.tools.quiz',
  },
  {
    id: 'glossary',
    name: 'glossary',
    aliases: ['slovnik'],
    labelKey: 'agent.slash.glossary.label',
    hintKey: 'agent.slash.glossary.hint',
    scopes: ['document', 'any'],
    tools: ['glossary'],
    defaultGoalKey: 'agent.tools.glossary',
  },
  {
    id: 'read',
    name: 'read',
    aliases: ['reading'],
    labelKey: 'agent.slash.read.label',
    hintKey: 'agent.slash.read.hint',
    scopes: ['document', 'any'],
    tools: ['reading_plan'],
    defaultGoalKey: 'agent.tools.reading_plan',
  },
  {
    id: 'sections',
    name: 'sections',
    aliases: ['sekcie'],
    labelKey: 'agent.slash.sections.label',
    hintKey: 'agent.slash.sections.hint',
    scopes: ['document', 'any'],
    tools: ['section_summaries'],
    defaultGoalKey: 'agent.tools.section_summaries',
  },
  {
    id: 'wiki',
    name: 'wiki',
    aliases: ['links'],
    labelKey: 'agent.slash.wiki.label',
    hintKey: 'agent.slash.wiki.hint',
    scopes: ['document', 'any'],
    tools: ['wiki'],
    defaultGoalKey: 'agent.tools.wiki',
  },
  {
    id: 'similar',
    name: 'similar',
    aliases: ['related', 'podobne'],
    labelKey: 'agent.slash.similar.label',
    hintKey: 'agent.slash.similar.hint',
    scopes: ['document', 'any'],
    tools: ['similar'],
    defaultGoalKey: 'agent.tools.similar',
  },
  {
    id: 'compare',
    name: 'compare',
    aliases: ['diff', 'porovnaj'],
    labelKey: 'agent.slash.compare.label',
    hintKey: 'agent.slash.compare.hint',
    scopes: ['document', 'any'],
    tools: ['compare_notes'],
    defaultGoalKey: 'agent.tools.compare_notes',
  },
  {
    id: 'pii',
    name: 'pii',
    aliases: ['privacy', 'sukromie'],
    labelKey: 'agent.slash.pii.label',
    hintKey: 'agent.slash.pii.hint',
    scopes: ['document', 'any'],
    tools: ['pii'],
    defaultGoalKey: 'agent.tools.pii',
  },
  {
    id: 'title',
    name: 'title',
    aliases: ['nazov'],
    labelKey: 'agent.slash.title.label',
    hintKey: 'agent.slash.title.hint',
    scopes: ['document', 'any'],
    tools: ['title'],
    defaultGoalKey: 'agent.tools.title',
  },
  {
    id: 'continue',
    name: 'continue',
    aliases: ['cont', 'pokracuj'],
    labelKey: 'agent.slash.continue.label',
    hintKey: 'agent.slash.continue.hint',
    scopes: ['document', 'any'],
    tools: ['continuation'],
    defaultGoalKey: 'agent.tools.continuation',
  },
  {
    id: 'keywords',
    name: 'keywords',
    aliases: ['tags', 'klucove'],
    labelKey: 'agent.slash.keywords.label',
    hintKey: 'agent.slash.keywords.hint',
    scopes: ['document', 'any'],
    tools: ['keywords'],
    defaultGoalKey: 'agent.tools.keywords',
  },
  {
    id: 'quotes',
    name: 'quotes',
    aliases: ['citacie'],
    labelKey: 'agent.slash.quotes.label',
    hintKey: 'agent.slash.quotes.hint',
    scopes: ['document', 'any'],
    tools: ['quotes'],
    defaultGoalKey: 'agent.tools.quotes',
  },
  {
    id: 'mentions',
    name: 'mentions',
    aliases: ['people', 'ludia'],
    labelKey: 'agent.slash.mentions.label',
    hintKey: 'agent.slash.mentions.hint',
    scopes: ['document', 'any'],
    tools: ['mentions'],
    defaultGoalKey: 'agent.tools.mentions',
  },
  {
    id: 'organize',
    name: 'organize',
    aliases: ['org', 'usporiadaj'],
    labelKey: 'agent.slash.organize.label',
    hintKey: 'agent.slash.organize.hint',
    scopes: ['document', 'library', 'any'],
    tools: ['organize'],
    defaultGoalKey: 'agent.tools.organize',
  },
  {
    id: 'cleanup',
    name: 'cleanup',
    aliases: ['upratanie'],
    labelKey: 'agent.slash.cleanup.label',
    hintKey: 'agent.slash.cleanup.hint',
    scopes: ['library', 'any'],
    recipeId: 'cleanup',
  },
  {
    id: 'digest',
    name: 'digest',
    aliases: ['daily'],
    labelKey: 'agent.slash.digest.label',
    hintKey: 'agent.slash.digest.hint',
    scopes: ['library', 'any'],
    recipeId: 'daily_digest',
  },
  {
    id: 'report',
    name: 'report',
    aliases: ['weekly'],
    labelKey: 'agent.slash.report.label',
    hintKey: 'agent.slash.report.hint',
    scopes: ['library', 'any'],
    recipeId: 'weekly_review',
  },
  {
    id: 'files',
    name: 'files',
    aliases: ['sandbox'],
    labelKey: 'agent.slash.files.label',
    hintKey: 'agent.slash.files.hint',
    scopes: ['library', 'any'],
    tools: ['files_answer'],
    passArgs: true,
    defaultGoalKey: 'agent.quickPrompts.askFiles',
  },
  {
    id: 'code',
    name: 'code',
    aliases: ['codebrief'],
    labelKey: 'agent.slash.code.label',
    hintKey: 'agent.slash.code.hint',
    scopes: ['document', 'any'],
    tools: ['code_brief'],
    defaultGoalKey: 'agent.tools.code_brief',
  },
  {
    id: 'canvas',
    name: 'canvas',
    aliases: ['board'],
    labelKey: 'agent.slash.canvas.label',
    hintKey: 'agent.slash.canvas.hint',
    scopes: ['document', 'any'],
    recipeId: 'canvas_board',
  },
  {
    id: 'privacy',
    name: 'privacy',
    aliases: ['privacypass'],
    labelKey: 'agent.slash.privacy.label',
    hintKey: 'agent.slash.privacy.hint',
    scopes: ['library', 'document', 'any'],
    recipeId: 'privacy_pass',
  },
]

function fold(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

const COMMAND_BY_TOKEN = (() => {
  const map = new Map<string, AgentSlashCommand>()
  for (const cmd of AGENT_SLASH_COMMANDS) {
    map.set(fold(cmd.name), cmd)
    for (const alias of cmd.aliases ?? []) {
      map.set(fold(alias), cmd)
    }
  }
  return map
})()

function scopeAllowed(cmd: AgentSlashCommand, scope: ChatScope): boolean {
  if (cmd.scopes.includes('any')) return true
  return cmd.scopes.includes(scope)
}

/** Resolve tools for a command in the current chat scope. */
export function toolsForSlashCommand(
  cmd: AgentSlashCommand,
  scope: ChatScope,
): AgentToolId[] | undefined {
  if (!cmd.tools?.length) return undefined
  if (cmd.id === 'talk') {
    if (scope === 'document') return ['document_answer']
    return ['library_answer']
  }
  return cmd.tools
}

/**
 * Parse a composer goal that starts with `/`.
 * Returns `null` when the text is not a slash attempt.
 * Returns `{ unknown: true }` when `/…` does not match a command.
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
  const command = COMMAND_BY_TOKEN.get(token)
  if (!command) return { unknown: true, token: match[1] ?? token }
  if (!scopeAllowed(command, scope)) return { unknown: true, token: match[1] ?? token }

  const forceTools = toolsForSlashCommand(command, scope)
  const recipeId = command.recipeId
  let goal = args
  if (!goal) {
    goal = command.defaultGoalKey ? t(command.defaultGoalKey) : `/${command.name}`
  } else if (!command.passArgs) {
    // Extra text after a non-arg command is fine — keep as goal label.
  }

  return {
    command,
    goal,
    forceTools,
    recipeId,
    args,
  }
}

/** Autocomplete: filter commands for the current scope and typed query after `/`. */
export function filterAgentSlashCommands(
  query: string,
  scope: ChatScope,
  limit = 10,
): AgentSlashCommand[] {
  const q = fold(query.replace(/^\//, ''))
  const out: AgentSlashCommand[] = []
  for (const cmd of AGENT_SLASH_COMMANDS) {
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
