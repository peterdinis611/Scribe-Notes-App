import { useTranslation } from 'react-i18next'
import { Star, Tag as TagIcon, X } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveTagFilter,
  setFavoritesOnlyFilter,
} from '@/store/documentsSlice'

export function LibraryFilterBanner() {
  const { t } = useTranslation()
  const favoritesOnly = useAppSelector((state) => state.documents.favoritesOnlyFilter)
  const activeTagFilter = useAppSelector((state) => state.documents.activeTagFilter)
  const dispatch = useAppDispatch()

  if (!favoritesOnly && !activeTagFilter) return null

  return (
    <div className="library-filter-banner titlebar-no-drag">
      <span className="library-filter-banner-label">{t('common.filter')}:</span>
      {favoritesOnly && (
        <span className="library-filter-pill">
          <Star className="h-3 w-3 fill-current" />
          {t('library.tabs.favorites')}
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
        }}
        aria-label={t('library.clearFilter')}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
