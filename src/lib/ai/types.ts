export type AiProvider = 'ollama' | 'openai' | 'anthropic'

export type AiActionId =
  | 'rewrite'
  | 'shorten'
  | 'expand'
  | 'fixGrammar'
  | 'toneFormal'
  | 'toneCasual'

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
