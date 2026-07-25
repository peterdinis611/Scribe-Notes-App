import { readAiApiKey } from '@/store/persistence'
import { store } from '@/store/index'
import type { AiConfig, AiSettings } from '@/lib/ai/types'

export function getAiSettings(): AiSettings {
  return store.getState().settings.aiSettings
}

export function getAiConfig(): AiConfig {
  const settings = getAiSettings()
  return {
    ...settings,
    apiKey: readAiApiKey(),
  }
}

export function isAiAvailable(settings: AiSettings = getAiSettings()): boolean {
  if (!settings.enabled) return false
  if (settings.provider === 'ollama') return true
  return Boolean(readAiApiKey()?.trim())
}
