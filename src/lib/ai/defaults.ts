import type { AiProvider, AiSettings } from '@/lib/ai/types'

export const AI_PROVIDER_DEFAULTS: Record<
  AiProvider,
  { baseUrl: string; model: string }
> = {
  ollama: {
    baseUrl: 'http://127.0.0.1:11434',
    model: 'llama3.2',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-haiku-20241022',
  },
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  provider: 'ollama',
  baseUrl: AI_PROVIDER_DEFAULTS.ollama.baseUrl,
  model: AI_PROVIDER_DEFAULTS.ollama.model,
}

export function defaultBaseUrlForProvider(provider: AiProvider): string {
  return AI_PROVIDER_DEFAULTS[provider].baseUrl
}

export function defaultModelForProvider(provider: AiProvider): string {
  return AI_PROVIDER_DEFAULTS[provider].model
}
