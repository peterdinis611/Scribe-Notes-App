import { describe, expect, it } from 'vitest'
import { toast } from '@/lib/toast'
import { runManualSave } from '@/lib/manual-save'
import { store } from '@/store/index'

describe('manual save toast integration', () => {
  it('pushes a success toast into the store when save succeeds', async () => {
    const before = store.getState().ui.toasts.length

    const ok = await runManualSave({
      flush: async () => true,
      onSaved: () => toast.success('Dokument uložený', 'Moja poznámka'),
      onError: () => undefined,
    })

    expect(ok).toBe(true)
    const toasts = store.getState().ui.toasts
    expect(toasts.length).toBeGreaterThan(before)

    const latest = toasts[toasts.length - 1]
    expect(latest?.title).toBe('Dokument uložený')
    expect(latest?.description).toBe('Moja poznámka')
    expect(latest?.variant).toBe('success')
  })
})
