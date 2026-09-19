import { cleanup, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { LibrarySwitcher } from '@/components/library/LibrarySwitcher'
import librariesReducer from '@/store/librariesSlice'
import uiReducer from '@/store/uiSlice'
import type { Library } from '@/lib/db/libraries-api'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

const archive: Library = {
  id: 'archive',
  name: 'Archív',
  rootPath: '/tmp/archive',
  createdAt: 1,
  lastOpenedAt: 2,
  sortOrder: 0,
  isActive: true,
}

function renderSwitcher(libraries: Library[] = [archive]) {
  const store = configureStore({
    reducer: {
      libraries: librariesReducer,
      ui: uiReducer,
    },
    preloadedState: {
      libraries: { libraries, openConflictCount: 0 },
    },
  })

  return render(
    <Provider store={store}>
      <LibrarySwitcher />
    </Provider>,
  )
}

afterEach(() => {
  cleanup()
})

describe('LibrarySwitcher', () => {
  it('renders a shadcn select trigger instead of a native select', () => {
    renderSwitcher()

    expect(document.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Knižnica' })).toBeTruthy()
    expect(screen.getByRole('combobox')).toHaveTextContent('Archív')
    expect(screen.getByRole('button', { name: 'Nová' })).toBeTruthy()
  })
})
