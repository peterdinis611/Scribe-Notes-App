import { useAtom } from 'jotai'
import { Star, Tag as TagIcon, X } from 'lucide-react'
import {
  activeTagFilterAtom,
  favoritesOnlyFilterAtom,
} from '@/store/documents'

export function LibraryFilterBanner() {
  const [favoritesOnly, setFavoritesOnly] = useAtom(favoritesOnlyFilterAtom)
  const [activeTagFilter, setTagFilter] = useAtom(activeTagFilterAtom)

  if (!favoritesOnly && !activeTagFilter) return null

  return (
    <div className="library-filter-banner titlebar-no-drag">
      <span className="library-filter-banner-label">Filter:</span>
      {favoritesOnly && (
        <span className="library-filter-pill">
          <Star className="h-3 w-3 fill-current" />
          Obľúbené
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
          setFavoritesOnly(false)
          setTagFilter(null)
        }}
        aria-label="Zrušiť filter"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
