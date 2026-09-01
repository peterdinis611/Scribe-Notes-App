import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLibrarySmartFilter } from '@/store/documentsSlice'
import type { LibrarySmartFilter } from '@/lib/library/smart-filters'
import { cn } from '@/lib/utils'

const FILTERS: LibrarySmartFilter[] = ['none', 'unlinked', 'untagged', 'unread']

export function LibrarySmartFilters() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const active = useAppSelector((state) => state.documents.librarySmartFilter)

  const labels = useMemo(
    () =>
      ({
        none: t('library.smartFilters.all'),
        unlinked: t('library.smartFilters.unlinked'),
        untagged: t('library.smartFilters.untagged'),
        unread: t('library.smartFilters.unread'),
      }) satisfies Record<LibrarySmartFilter, string>,
    [t],
  )

  return (
    <div className="library-smart-filters titlebar-no-drag">
      <span className="library-smart-filters-label">{t('library.smartFilters.label')}</span>
      <div className="library-smart-filters-row">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={cn('library-smart-filter-chip', active === filter && 'is-active')}
            onClick={() => dispatch(setLibrarySmartFilter(filter))}
          >
            {labels[filter]}
          </button>
        ))}
      </div>
    </div>
  )
}
