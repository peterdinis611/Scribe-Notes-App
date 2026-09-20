import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DocumentQuestionTurn } from '@/lib/library/document-question-history'
import { cn } from '@/lib/utils'

type DocumentQuestionHistoryListProps = {
  items: DocumentQuestionTurn[]
  selectedId?: string | null
  onSelect: (turn: DocumentQuestionTurn) => void
  onAskAgain?: (turn: DocumentQuestionTurn) => void
  askAgainDisabled?: boolean
  emptyHint?: string
  compact?: boolean
}

export function DocumentQuestionHistoryList({
  items,
  selectedId,
  onSelect,
  onAskAgain,
  askAgainDisabled,
  emptyHint,
  compact,
}: DocumentQuestionHistoryListProps) {
  const { t } = useTranslation()
  const newestFirst = [...items].reverse()

  return (
    <div className={cn('question-ledger', compact && 'question-ledger--compact')}>
      <div className="question-ledger__head">
        <span className="question-ledger__title">
          <History className="h-3 w-3" aria-hidden />
          {t('libraryChat.questionHistory')}
        </span>
        {items.length > 0 ? (
          <span className="question-ledger__count">
            {t('libraryChat.questionHistoryCount', { count: items.length })}
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="question-ledger__empty">{emptyHint ?? t('libraryChat.questionHistoryEmpty')}</p>
      ) : (
        <ol className="question-ledger__list">
          {newestFirst.map((turn, index) => {
            const n = items.length - index
            const active = selectedId === turn.id
            return (
              <li key={turn.id}>
                <button
                  type="button"
                  className={cn('question-ledger__item', active && 'is-active')}
                  aria-current={active ? 'true' : undefined}
                  title={turn.question}
                  onClick={() => onSelect(turn)}
                >
                  <span className="question-ledger__index" aria-hidden="true">
                    {String(n).padStart(2, '0')}
                  </span>
                  <span className="question-ledger__question">{turn.question}</span>
                </button>
                {active && onAskAgain && !turn.action ? (
                  <button
                    type="button"
                    className="question-ledger__again"
                    disabled={askAgainDisabled}
                    onClick={() => onAskAgain(turn)}
                  >
                    {t('libraryChat.askAgain')}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
