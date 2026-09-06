import { describe, expect, it } from 'vitest'
import {
  describeNlpSearchFailure,
  describeNlpTagSuggestionFailure,
} from '@/lib/nlp/errors'
import type { NlpStatus } from '@/lib/db/nlp-api'

function status(partial: Partial<NlpStatus>): NlpStatus {
  return {
    enabled: true,
    sidecarAvailable: true,
    sidecarOk: true,
    version: '0.4.0',
    model: 'scribe-hash-v2',
    indexedCount: 0,
    storedModel: null,
    indexStale: false,
    staleIndexCount: 0,
    embedBackend: 'hash',
    qualityAvailable: false,
    scriptPath: '/tmp/nlp',
    pythonBin: 'python3',
    error: null,
    ...partial,
  }
}

describe('describeNlpSearchFailure', () => {
  it('maps disabled / missing / broken sidecar states', () => {
    expect(describeNlpSearchFailure(status({ enabled: false }), null)).toBe('nlp.searchDisabled')
    expect(describeNlpSearchFailure(status({ sidecarAvailable: false }), null)).toBe(
      'nlp.sidecarScriptMissing',
    )
    expect(describeNlpSearchFailure(status({ sidecarOk: false }), null)).toBe(
      'nlp.sidecarUnavailable',
    )
    expect(describeNlpSearchFailure(status({ sidecarOk: false, error: 'boom' }), null)).toBe(
      'nlp.sidecarError',
    )
  })

  it('prefers Error message when sidecar is healthy', () => {
    expect(describeNlpSearchFailure(status({}), new Error('timeout'))).toBe('timeout')
    expect(describeNlpSearchFailure(status({}), null)).toBe('nlp.searchFailed')
  })
})

describe('describeNlpTagSuggestionFailure', () => {
  it('maps disabled and sidecar failures', () => {
    expect(describeNlpTagSuggestionFailure(status({ enabled: false }), null)).toBe(
      'nlp.tagsDisabled',
    )
    expect(describeNlpTagSuggestionFailure(status({ sidecarOk: false }), null)).toBe(
      'nlp.sidecarUnavailable',
    )
    expect(describeNlpTagSuggestionFailure(status({}), new Error('nope'))).toBe('nope')
    expect(describeNlpTagSuggestionFailure(null, null)).toBe('nlp.tagsDisabled')
  })
})
