import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SlashSuggestionList } from '@/components/editor/SlashSuggestionList'

const items = [
  { id: 'h1', label: 'Nadpis 1', hint: 'Veľký nadpis', icon: 'H1' },
  { id: 'table', label: 'Tabuľka', hint: '3×3', icon: '⊞' },
]

describe('SlashSuggestionList', () => {
  it('renders commands and handles click', async () => {
    const user = userEvent.setup()
    const command = vi.fn()

    render(<SlashSuggestionList items={items} command={command} />)

    expect(screen.getByText('Nadpis 1')).toBeInTheDocument()
    await user.click(screen.getByText('Tabuľka'))
    expect(command).toHaveBeenCalledWith(items[1])
  })

  it('shows empty state', () => {
    render(<SlashSuggestionList items={[]} command={vi.fn()} />)
    expect(screen.getByText('Žiadne príkazy')).toBeInTheDocument()
  })
})
