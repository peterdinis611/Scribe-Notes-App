import { describe, expect, it } from 'vitest'
import {
  forgetEditorSession,
  recallEditorSession,
  rememberEditorSession,
} from '@/lib/editor/editor-session'

describe('editor-session', () => {
  it('stores and restores scroll plus selection per document', () => {
    rememberEditorSession('doc-a', { scrollTop: 420, from: 12, to: 18 })
    rememberEditorSession('doc-b', { scrollTop: 80, from: 3, to: 3 })

    expect(recallEditorSession('doc-a')).toEqual({ scrollTop: 420, from: 12, to: 18 })
    expect(recallEditorSession('doc-b')).toEqual({ scrollTop: 80, from: 3, to: 3 })
  })

  it('ignores empty document ids and forgets a stored session', () => {
    rememberEditorSession('', { scrollTop: 1, from: 1, to: 1 })
    expect(recallEditorSession('')).toBeNull()

    rememberEditorSession('doc-c', { scrollTop: 10, from: 2, to: 4 })
    forgetEditorSession('doc-c')
    expect(recallEditorSession('doc-c')).toBeNull()
  })
})
