import { useEffect, useState, type RefObject } from 'react'

export type LayoutTier = 'wide' | 'medium' | 'narrow' | 'tight'

function tierFromWidth(width: number): LayoutTier {
  if (width < 520) return 'tight'
  if (width < 720) return 'narrow'
  if (width < 960) return 'medium'
  return 'wide'
}

export function useLayoutTier(ref: RefObject<HTMLElement | null>) {
  const [tier, setTier] = useState<LayoutTier>('wide')

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const update = () => {
      setTier(tierFromWidth(element.getBoundingClientRect().width))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return tier
}

// Keep in sync with Tailwind `xl` (min-width 1280px) — drawer mode is below that.
export const SIDEBAR_DRAWER_BREAKPOINT = 1279
