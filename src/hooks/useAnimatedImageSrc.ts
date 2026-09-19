import { useEffect, useState } from 'react'
import {
  guessAnimatedKindFromSrc,
  mimeForAnimatedKind,
  sniffAnimatedImageKind,
  type AnimatedImageKind,
} from '@/lib/editor/animated-image'
import { resolveImageSrc } from '@/lib/editor/image-utils'

type AnimatedImageSrc = {
  displaySrc: string
  animated: boolean
  kind: AnimatedImageKind | null
}

function resolveForDisplay(rawSrc: string): string {
  if (!rawSrc) return ''
  try {
    return resolveImageSrc(rawSrc)
  } catch {
    if (
      rawSrc.startsWith('data:') ||
      rawSrc.startsWith('http://') ||
      rawSrc.startsWith('https://') ||
      rawSrc.startsWith('blob:')
    ) {
      return rawSrc
    }
    return ''
  }
}

/**
 * Serve GIFs as a typed blob URL. WKWebView often shows only the first frame
 * when the asset protocol omits `image/gif`.
 */
export function useAnimatedImageSrc(rawSrc: string): AnimatedImageSrc {
  const resolved = resolveForDisplay(rawSrc)
  const guessed = guessAnimatedKindFromSrc(rawSrc) ?? guessAnimatedKindFromSrc(resolved)
  const [displaySrc, setDisplaySrc] = useState(resolved)
  const [kind, setKind] = useState<AnimatedImageKind | null>(guessed)

  useEffect(() => {
    setDisplaySrc(resolved)
    setKind(guessed)
    if (!resolved || resolved.startsWith('data:')) return

    let cancelled = false
    let objectUrl: string | null = null

    async function hydrate() {
      try {
        const response = await fetch(resolved)
        const blob = await response.blob()
        const headerSize = Math.min(blob.size, 256 * 1024)
        const header = new Uint8Array(await blob.slice(0, headerSize).arrayBuffer())
        const sniffed = sniffAnimatedImageKind(header)
        const nextKind = sniffed ?? guessed
        if (cancelled) return
        setKind(nextKind)
        if (!nextKind) return
        const mime = mimeForAnimatedKind(nextKind)
        const typed = blob.type === mime ? blob : new Blob([blob], { type: mime })
        objectUrl = URL.createObjectURL(typed)
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          objectUrl = null
          return
        }
        setDisplaySrc(objectUrl)
      } catch {
        if (!cancelled) setKind(guessed)
      }
    }

    if (guessed) {
      void hydrate()
    }

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [guessed, resolved])

  return {
    displaySrc,
    animated: kind !== null,
    kind,
  }
}
