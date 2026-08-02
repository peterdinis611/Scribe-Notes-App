export type AiProvider = 'ollama' | 'openai' | 'anthropic'

export type AiActionId =
  | 'rewrite'
  | 'shorten'
  | 'expand'
  | 'fixGrammar'
  | 'toneFormal'
  | 'toneCasual'
  | 'summarize'
  | 'outline'
  | 'continueWriting'

/** Actions that can run on the whole document when nothing is selected. */
export const DOCUMENT_AI_ACTION_IDS: AiActionId[] = ['summarize', 'outline', 'continueWriting']

export type AiSettings = {
  enabled: boolean
  provider: AiProvider
  baseUrl: string
  model: string
}

export type CompleteRequest = {
  system: string
  user: string
  signal?: AbortSignal
}

export type AiConfig = AiSettings & {
  apiKey: string | null
}
