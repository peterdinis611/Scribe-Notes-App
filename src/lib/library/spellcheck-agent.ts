import { nlpSpellcheck, type SpellIssue } from '@/lib/db/nlp-api'
import { applySpellSuggestion } from '@/lib/editor/apply-suggestions'
import {
  agentMemoryContext,
  runAgentGoal,
  type AgentRunResult,
  type AgentStep,
} from '@/lib/library/agent'
import {
  normalizeAgentPrefs,
  type AgentPrefs,
  DEFAULT_AGENT_PREFS,
} from '@/lib/library/agent-prefs'
import type { LibraryChatCitation } from '@/lib/library/library-chat'

export const SPELLCHECK_AGENT_BLOBATAR_NAME = 'scribe-spellcheck-agent'

export type SpellcheckAgentFix = {
  word: string
  suggestion: string
  alternatives: string[]
}

export type SpellcheckAgentResult = AgentRunResult & {
  fixes: SpellcheckAgentFix[]
  language?: string
}

function fixesFromIssues(issues: SpellIssue[]): SpellcheckAgentFix[] {
  return issues
    .filter((issue) => issue.word && issue.suggestions[0])
    .slice(0, 24)
    .map((issue) => ({
      word: issue.word,
      suggestion: issue.suggestions[0]!,
      alternatives: issue.suggestions.slice(1, 3),
    }))
}

function fixesFromSteps(steps: AgentStep[]): SpellcheckAgentFix[] {
  return steps
    .flatMap((step) => step.spellIssues ?? [])
    .filter((issue) => issue.word && issue.suggestions[0])
    .slice(0, 24)
    .map((issue) => ({
      word: issue.word,
      suggestion: issue.suggestions[0]!,
      alternatives: issue.suggestions.slice(1, 3),
    }))
}

/** Dedicated spellcheck agent — always document-scoped, spellcheck-only tools. */
export async function runSpellcheckAgent(
  documentId: string,
  goal?: string | null,
  memoryContext?: Array<{ role: string; text: string }>,
  prefs: AgentPrefs = DEFAULT_AGENT_PREFS,
): Promise<SpellcheckAgentResult> {
  const normalized = normalizeAgentPrefs({
    ...prefs,
    // Spell agent always uses the spellcheck tool even if disabled for general agent.
    disabledTools: prefs.disabledTools.filter((tool) => tool !== 'spellcheck'),
    preferredTools: ['spellcheck', ...prefs.preferredTools.filter((tool) => tool !== 'spellcheck')],
    maxSteps: 1,
    askWhenUncertain: false,
  })

  const trimmed = (goal || '').trim()
  const result = await runAgentGoal(
    trimmed || 'Check spelling in this note',
    'document',
    documentId,
    memoryContext,
    normalized,
    { forceTools: ['spellcheck'], grammarOnly: true },
  )

  let fixes = fixesFromSteps(result.steps)
  let language: string | undefined
  if (!fixes.length) {
    const live = await nlpSpellcheck(documentId).catch(() => null)
    if (live) {
      fixes = fixesFromIssues(live.issues)
      language = live.checkedLanguage || live.language
    }
  }

  return { ...result, fixes, language }
}

export function applySpellcheckFixes(fixes: SpellcheckAgentFix[]): number {
  let applied = 0
  for (const fix of fixes) {
    if (applySpellSuggestion(fix.word, fix.suggestion)) applied += 1
  }
  return applied
}

export function spellcheckMemoryContext(
  messages: Array<{ role: 'user' | 'assistant'; text: string }>,
): Array<{ role: string; text: string }> {
  return agentMemoryContext(messages)
}

export type { LibraryChatCitation }
