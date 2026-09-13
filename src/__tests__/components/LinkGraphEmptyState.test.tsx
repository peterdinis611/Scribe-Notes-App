import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { LinkGraphEmptyState } from '@/components/LinkGraphEmptyState'

afterEach(() => {
  cleanup()
})

describe('LinkGraphEmptyState', () => {
  it('offers an orphans CTA when unlinked documents exist', async () => {
    const user = userEvent.setup()
    const onShowOrphans = vi.fn()

    render(
      <LinkGraphEmptyState orphanCount={77} showOrphans={false} onShowOrphans={onShowOrphans} />,
    )

    expect(screen.getByText(/neprepojených dokumentov|unlinked documents/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button'))
    expect(onShowOrphans).toHaveBeenCalledTimes(1)
  })

  it('shows the linked-everything message when orphans are empty', () => {
    render(<LinkGraphEmptyState orphanCount={0} showOrphans />)
    expect(screen.getByText(/žiadne osirolené|no orphan documents/i)).toBeInTheDocument()
  })

  it('shows the wiki tip when there are no orphans to reveal', () => {
    render(<LinkGraphEmptyState orphanCount={0} showOrphans={false} />)
    expect(screen.getByText(/mapa narastie|grow the map/i)).toBeInTheDocument()
  })
})
