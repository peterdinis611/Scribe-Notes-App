import { useEffect, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import {
  areTemplateCollectionsReady,
  fromStoredCategory,
  fromStoredTemplate,
  initTemplateCollections,
  customCategoriesCollection,
  customTemplatesCollection,
} from '@/lib/db/template-collections'

function useCollectionsReady() {
  const [ready, setReady] = useState(areTemplateCollectionsReady())

  useEffect(() => {
    if (ready) return

    let cancelled = false
    initTemplateCollections()
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch(() => {
        if (!cancelled) setReady(false)
      })

    return () => {
      cancelled = true
    }
  }, [ready])

  return ready
}

export function useTemplateCollectionsBootstrap() {
  const [error, setError] = useState<Error | null>(null)
  const ready = useCollectionsReady()

  useEffect(() => {
    initTemplateCollections().catch((nextError: unknown) => {
      setError(nextError instanceof Error ? nextError : new Error(String(nextError)))
    })
  }, [])

  return { ready, error }
}

export function useCustomTemplatesLive() {
  const ready = useCollectionsReady()
  const { data, isLoading, isReady } = useLiveQuery(
    () => (ready ? customTemplatesCollection : null),
    [ready],
  )

  return {
    templates: (data ?? []).map(fromStoredTemplate),
    isLoading: !ready || isLoading || !isReady,
  }
}

export function useCustomCategoriesLive() {
  const ready = useCollectionsReady()
  const { data, isLoading, isReady } = useLiveQuery(
    () => (ready ? customCategoriesCollection : null),
    [ready],
  )

  const categories = (data ?? [])
    .map(fromStoredCategory)
    .sort((left, right) => left.name.localeCompare(right.name, 'sk'))

  return {
    categories,
    isLoading: !ready || isLoading || !isReady,
  }
}
