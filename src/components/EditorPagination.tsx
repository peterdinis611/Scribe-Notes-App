import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getVisiblePageNumbers } from '@/lib/editor/page-layout'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type EditorPaginationProps = {
  currentPage: number
  pageCount: number
  onPageChange: (page: number) => void
  compact?: boolean
}

export function EditorPagination({
  currentPage,
  pageCount,
  onPageChange,
  compact = false,
}: EditorPaginationProps) {
  const { t } = useTranslation()
  const visiblePages = getVisiblePageNumbers(currentPage, pageCount)

  return (
    <div
      className={cn('editor-pagination titlebar-no-drag', compact && 'editor-pagination--compact')}
      role="navigation"
      aria-label={t('pagination.ariaLabel')}
    >
      <Button
        variant="ghost"
        size="icon"
        className="editor-pagination-arrow"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label={t('pagination.previousPage')}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="editor-pagination-pages">
        {visiblePages.map((page, index) => {
          const previous = visiblePages[index - 1]
          const showEllipsis = previous !== undefined && page - previous > 1

          return (
            <span key={page} className="editor-pagination-page-group">
              {showEllipsis && <span className="editor-pagination-ellipsis">…</span>}
              <button
                type="button"
                className={cn('editor-pagination-page', page === currentPage && 'is-active')}
                onClick={() => onPageChange(page)}
                aria-label={t('pagination.page', { page })}
                aria-current={page === currentPage ? 'page' : undefined}
              >
                {page}
              </button>
            </span>
          )
        })}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="editor-pagination-arrow"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= pageCount}
        aria-label={t('pagination.nextPage')}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <span className="editor-pagination-summary">
        {t('pagination.summary', { current: currentPage, total: pageCount })}
      </span>
    </div>
  )
}
