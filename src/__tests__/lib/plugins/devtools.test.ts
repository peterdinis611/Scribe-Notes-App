import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearPluginLogs,
  listPluginLogs,
  pluginLog,
  resetPluginDevtoolsForTests,
  subscribePluginLogs,
} from '@/lib/plugins/devtools'

describe('plugin logs', () => {
  afterEach(() => {
    resetPluginDevtoolsForTests()
    vi.restoreAllMocks()
  })

  it('records info/warn/error and keeps newest first', () => {
    pluginLog('a', 'one')
    pluginLog('a', 'two', 'warn')
    pluginLog('b', 'three', 'error')

    const all = listPluginLogs()
    expect(all).toHaveLength(3)
    expect(all[0]?.message).toBe('three')
    expect(all[0]?.level).toBe('error')
    expect(listPluginLogs('a').map((entry) => entry.message)).toEqual(['two', 'one'])
  })

  it('truncates long messages and caps buffer size', () => {
    const long = 'x'.repeat(5000)
    pluginLog('a', long)
    expect(listPluginLogs('a')[0]?.message).toHaveLength(2000)

    for (let i = 0; i < 220; i += 1) {
      pluginLog('bulk', `msg-${i}`)
    }
    expect(listPluginLogs()).toHaveLength(200)
    expect(listPluginLogs()[0]?.message).toBe('msg-219')
  })

  it('clears logs globally or per plugin', () => {
    pluginLog('a', 'keep-me-not')
    pluginLog('b', 'stay')
    clearPluginLogs('a')
    expect(listPluginLogs('a')).toHaveLength(0)
    expect(listPluginLogs('b')).toHaveLength(1)
    clearPluginLogs()
    expect(listPluginLogs()).toHaveLength(0)
  })

  it('notifies subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePluginLogs(listener)
    pluginLog('a', 'ping')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    pluginLog('a', 'pong')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
