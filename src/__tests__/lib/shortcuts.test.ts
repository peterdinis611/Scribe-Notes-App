import { describe, expect, it } from 'vitest'
import {
  eventToHotkey,
  getDisplayKeysForShortcut,
  getResolvedHotkey,
  hotkeyToDisplayKeys,
} from '@/lib/shortcuts'

describe('hotkeyToDisplayKeys', () => {
  it('maps Mod/Shift/Alt to mac glyphs', () => {
    expect(hotkeyToDisplayKeys('Mod+Shift+H')).toEqual(['⌘', '⇧', 'H'])
    expect(hotkeyToDisplayKeys('Mod+,')).toEqual(['⌘', ','])
    expect(hotkeyToDisplayKeys('Control+Alt+X')).toEqual(['⌃', '⌥', 'X'])
  })
})

describe('getResolvedHotkey / getDisplayKeysForShortcut', () => {
  it('uses overrides when present', () => {
    expect(getResolvedHotkey('save', { save: 'Mod+Shift+S' })).toBe('Mod+Shift+S')
    expect(getDisplayKeysForShortcut('save', { save: 'Mod+Shift+S' })).toEqual(['⌘', '⇧', 'S'])
  })

  it('falls back to default bindings', () => {
    expect(getResolvedHotkey('commandPalette', {})).toBe('Mod+K')
    expect(getDisplayKeysForShortcut('commandPalette', {})).toEqual(['⌘', 'K'])
  })
})

describe('eventToHotkey', () => {
  it('builds Mod+key chords from KeyboardEvent-like objects', () => {
    const event = {
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
      key: 'h',
    } as KeyboardEvent
    expect(eventToHotkey(event)).toBe('Mod+Shift+H')
  })

  it('returns null for bare modifier presses', () => {
    const event = {
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      key: 'Meta',
    } as KeyboardEvent
    expect(eventToHotkey(event)).toBeNull()
  })

  it('encodes Space and comma', () => {
    expect(
      eventToHotkey({
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        key: ' ',
      } as KeyboardEvent),
    ).toBe('Mod+Space')
    expect(
      eventToHotkey({
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        key: ',',
      } as KeyboardEvent),
    ).toBe('Mod+,')
  })
})
