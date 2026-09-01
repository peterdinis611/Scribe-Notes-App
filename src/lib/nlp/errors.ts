import type { NlpStatus } from '@/lib/db/nlp-api'

export function describeNlpSearchFailure(status: NlpStatus | null, error: unknown): string {
  if (!status?.enabled) {
    return 'nlp.searchDisabled'
  }
  if (!status.sidecarAvailable) {
    return 'nlp.sidecarScriptMissing'
  }
  if (!status.sidecarOk) {
    return status.error ? 'nlp.sidecarError' : 'nlp.sidecarUnavailable'
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return 'nlp.searchFailed'
}

export function describeNlpTagSuggestionFailure(status: NlpStatus | null, error: unknown): string {
  if (!status?.enabled) {
    return 'nlp.tagsDisabled'
  }
  if (!status.sidecarOk) {
    return status.error ? 'nlp.sidecarError' : 'nlp.sidecarUnavailable'
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return 'nlp.tagsFailed'
}
