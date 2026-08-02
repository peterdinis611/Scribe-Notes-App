import { complete } from '@/lib/ai/clients'
import { getAiConfig } from '@/lib/ai/config'
import type { AiActionId } from '@/lib/ai/types'

const ACTION_SYSTEM_PROMPTS: Record<AiActionId, string> = {
  rewrite:
    'Rewrite the following text clearly while preserving meaning. Return only the rewritten text with no quotes or explanation.',
  shorten:
    'Shorten the following text while keeping the key points. Return only the shortened text with no quotes or explanation.',
  expand:
    'Expand the following text with more detail. Return only the expanded text with no quotes or explanation.',
  fixGrammar:
    'Fix grammar and spelling in the following text. Return only the corrected text with no quotes or explanation.',
  toneFormal:
    'Rewrite the following text in a formal tone. Return only the rewritten text with no quotes or explanation.',
  toneCasual:
    'Rewrite the following text in a casual tone. Return only the rewritten text with no quotes or explanation.',
  summarize:
    'Summarize the following document in a few concise paragraphs. Return only the summary with no quotes or explanation.',
  outline:
    'Create a clear hierarchical outline of the following document using markdown headings and bullet points. Return only the outline.',
  continueWriting:
    'Continue writing from where the following text ends. Match the style and tone. Return only the continuation with no quotes or explanation.',
}

export const AI_ACTION_IDS: AiActionId[] = [
  'rewrite',
  'shorten',
  'expand',
  'fixGrammar',
  'toneFormal',
  'toneCasual',
  'summarize',
  'outline',
  'continueWriting',
]

export async function runAiAction(
  action: AiActionId,
  text: string,
  signal?: AbortSignal,
): Promise<string> {
  const config = getAiConfig()
  return complete(config, {
    system: ACTION_SYSTEM_PROMPTS[action],
    user: text,
    signal,
  })
}
