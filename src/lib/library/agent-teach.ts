import { nlpLlmComplete, nlpLlmStatus } from '@/lib/db/nlp-api'
import {
  AGENT_TEACHING_MAX_LEN,
  type AgentTeachingTopic,
} from '@/lib/library/agent-prefs'

/** Longer drafts allowed before local-LLM distillation into a standing instruction. */
export const AGENT_TEACH_DRAFT_MAX_LEN = 2000

const DISTILL_SYSTEM = `You are Scribe's local teaching editor.
Turn the user's note into ONE standing instruction for a personal notes agent.
Rules:
- Imperative, concrete, durable preference or fact (not a one-off question).
- Max ${AGENT_TEACHING_MAX_LEN} characters.
- Same language as the user text.
- No quotes, no markdown, no preamble — output only the instruction.`

const DISTILL_GRAMMAR_SYSTEM = `You are Scribe's local grammar teaching editor.
Turn the user's note into ONE standing grammar/spelling preference for a spellcheck agent.
Rules:
- Imperative rule about spelling, grammar, hyphenation, capitalization, or preferred wording.
- Max ${AGENT_TEACHING_MAX_LEN} characters.
- Same language as the user text.
- No quotes, no markdown, no preamble — output only the rule.`

export type DistillTeachingResult = {
  text: string
  distilled: boolean
  model?: string
}

/** True when Ollama (or configured local LLM) is reachable for teaching refine. */
export async function canDistillTeachingWithLlm(): Promise<boolean> {
  try {
    const status = await nlpLlmStatus()
    return Boolean(status.reachable)
  } catch {
    return false
  }
}

/**
 * Optionally refine a long/raw teach note via local LLM into a short standing instruction.
 * Falls back to a trimmed raw snippet when LLM is offline.
 */
export async function distillTeachingWithLlm(
  raw: string,
  opts?: { force?: boolean; topic?: AgentTeachingTopic },
): Promise<DistillTeachingResult> {
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  if (trimmed.length < 2) {
    throw new Error('settings.agent.teachEmptyDraft')
  }

  const alreadyShort = trimmed.length <= AGENT_TEACHING_MAX_LEN && !opts?.force
  if (alreadyShort) {
    return { text: trimmed.slice(0, AGENT_TEACHING_MAX_LEN), distilled: false }
  }

  let reachable = false
  try {
    reachable = (await nlpLlmStatus()).reachable
  } catch {
    reachable = false
  }

  if (!reachable) {
    return {
      text: trimmed.slice(0, AGENT_TEACHING_MAX_LEN),
      distilled: false,
    }
  }

  const topic: AgentTeachingTopic = opts?.topic === 'grammar' ? 'grammar' : 'general'
  const result = await nlpLlmComplete({
    system: topic === 'grammar' ? DISTILL_GRAMMAR_SYSTEM : DISTILL_SYSTEM,
    prompt:
      topic === 'grammar'
        ? `User grammar preference note:\n${trimmed.slice(0, AGENT_TEACH_DRAFT_MAX_LEN)}`
        : `User teaching note:\n${trimmed.slice(0, AGENT_TEACH_DRAFT_MAX_LEN)}`,
    temperature: 0.2,
    maxTokens: 180,
    stream: false,
  })

  const distilled = result.text
    .trim()
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, AGENT_TEACHING_MAX_LEN)

  if (distilled.length < 2) {
    return { text: trimmed.slice(0, AGENT_TEACHING_MAX_LEN), distilled: false }
  }

  return {
    text: distilled,
    distilled: true,
    model: result.model,
  }
}
