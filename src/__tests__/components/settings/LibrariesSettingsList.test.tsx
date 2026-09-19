import { cleanup, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import i18n from '@/i18n'
import { LibrariesSettingsList } from '@/components/settings/LibrariesSettingsList'
import librariesReducer from '@/store/librariesSlice'
import type { Library } from '@/lib/db/libraries-api'

const { libraries } = vi.hoisted(() => {
  const items: Library[] = [
    {
      id: 'work',
      name: 'Práca',
      rootPath: '/Users/peter/Documents/Scribe Work',
      createdAt: 1,
      lastOpenedAt: 1_700_000_000,
      sortOrder: 1,
      isActive: true,
    },
    {
      id: 'archive',
      name: 'Archív',
      rootPath: '/Users/peter/Documents/Scribe Archive',
      createdAt: 1,
      lastOpenedAt: 1_700_000_100,
      sortOrder: 2,
      isActive: false,
    },
  ]
  return { libraries: items }
})

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/lib/db/libraries-api', () => ({
  listLibraries: vi.fn(async () => libraries),
}))

afterEach(() => {
  cleanup()
})

describe('LibrariesSettingsList', () => {
  it('lists every library with the active badge', async () => {
    await i18n.changeLanguage('sk')
    const store = configureStore({
      reducer: { libraries: librariesReducer },
      preloadedState: {
        libraries: { libraries, openConflictCount: 0 },
      },
    })

    render(
      <Provider store={store}>
        <LibrariesSettingsList />
      </Provider>,
    )

    expect(screen.getByRole('heading', { name: 'Knižnice' })).toBeTruthy()
    expect(screen.getByText('Práca')).toBeTruthy()
    expect(screen.getByText('Archív')).toBeTruthy()
    expect(screen.getByText('Aktívna')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Prepnúť' })).toBeTruthy()
    expect(screen.getByText('~/Documents/Scribe Work')).toBeTruthy()
  })

  it('shows an empty row when there are no libraries', async () => {
    await i18n.changeLanguage('sk')
    const { listLibraries } = await import('@/lib/db/libraries-api')
    vi.mocked(listLibraries).mockResolvedValueOnce([])

    const store = configureStore({
      reducer: { libraries: librariesReducer },
      preloadedState: {
        libraries: { libraries: [], openConflictCount: 0 },
      },
    })

    render(
      <Provider store={store}>
        <LibrariesSettingsList />
      </Provider>,
    )

    expect(screen.getByText('Zatiaľ žiadne knižnice.')).toBeTruthy()
  })
})
