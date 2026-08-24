import { useTranslation } from 'react-i18next'
import { FolderKanban, Star, Tag as TagIcon, X } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  clearMetaFilters,
  setActiveTagFilter,
  setFavoritesOnlyFilter,
  setMetaFilters,
} from '@/store/documentsSlice'

export function LibraryFilterBanner() {
  const { t } = useTranslation()
  const favoritesOnly = useAppSelector((state) => state.documents.favoritesOnlyFilter)
  const activeTagFilter = useAppSelector((state) => state.documents.activeTagFilter)
  const metaFilters = useAppSelector((state) => state.documents.metaFilters)
  const dispatch = useAppDispatch()

  const hasMeta = Boolean(metaFilters.status || metaFilters.project || metaFilters.year)
  if (!favoritesOnly && !activeTagFilter && !hasMeta) return null

  return (
    <div className="library-filter-banner titlebar-no-drag">
      <span className="library-filter-banner-label">{t('common.filter')}:</span>
      {favoritesOnly && (
        <span className="library-filter-pill">
          <Star className="h-3 w-3 fill-current" />
          {t('library.tabs.favorites')}
        </span>
      )}
      {metaFilters.status && (
        <span className="library-filter-pill">
          <FolderKanban className="h-3 w-3" />
          {t('library.filters.status')}: {metaFilters.status}
        </span>
      )}
      {metaFilters.project && (
        <span className="library-filter-pill">
          <FolderKanban className="h-3 w-3" />
          {t('library.filters.project')}: {metaFilters.project}
        </span>
      )}
      {metaFilters.year && (
        <span className="library-filter-pill">
          <FolderKanban className="h-3 w-3" />
          {t('library.filters.year')}: {metaFilters.year}
        </span>
      )}
      {activeTagFilter && (
        <span className="library-filter-pill">
          <TagIcon className="h-3 w-3" />
          {activeTagFilter}
        </span>
      )}
      <button
        type="button"
        className="library-filter-clear"
        onClick={() => {
          dispatch(setFavoritesOnlyFilter(false))
          dispatch(setActiveTagFilter(null))
          dispatch(clearMetaFilters())
          dispatch(setMetaFilters({ status: null, project: null, year: null }))
        }}
        aria-label={t('library.clearFilter')}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
