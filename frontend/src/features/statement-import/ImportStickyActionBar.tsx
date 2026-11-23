import { formatOperationCount, formatRuCurrency } from "../../types/import"

interface ImportStickyActionBarProps {
  selectedCount: number
  selectedIncomeTotal: number
  selectedExpenseTotal: number
  confirmedReadyCount: number
  submitting: boolean
  onConfirmSelected: () => void
  onExcludeSelected: () => void
  onFinalizeImport: () => void
}

export default function ImportStickyActionBar({
  selectedCount,
  selectedIncomeTotal,
  selectedExpenseTotal,
  confirmedReadyCount,
  submitting,
  onConfirmSelected,
  onExcludeSelected,
  onFinalizeImport,
}: ImportStickyActionBarProps) {
  const readyToImportCount = confirmedReadyCount + selectedCount

  return (
    <div className="operation-review__sticky-bar">
      <div className="operation-review__sticky-summary" aria-live="polite">
        <strong>
          Выбрано: {formatOperationCount(selectedCount)} · Готово к импорту:{" "}
          {formatOperationCount(readyToImportCount)}
        </strong>
        <span className="operation-review__sticky-breakdown">
          {selectedCount > 0 ? (
            <>
              Поступления: +{formatRuCurrency(selectedIncomeTotal)} · Расходы: −
              {formatRuCurrency(selectedExpenseTotal)}
            </>
          ) : (
            "Отметьте операции для массового действия или подтвердите проверенные"
          )}
        </span>
      </div>

      <div className="operation-review__sticky-actions">
        <button
          type="button"
          className="operation-review__sticky-secondary"
          disabled={selectedCount === 0 || submitting}
          onClick={onConfirmSelected}
        >
          Подтвердить выбранные
        </button>
        <button
          type="button"
          className="operation-review__sticky-exclude"
          disabled={selectedCount === 0 || submitting}
          onClick={onExcludeSelected}
        >
          Исключить выбранные
        </button>
        <button
          type="button"
          className="operation-review__sticky-confirm"
          disabled={readyToImportCount === 0 || submitting}
          onClick={onFinalizeImport}
        >
          {submitting
            ? "Сохранение..."
            : readyToImportCount > 0
              ? `Подтвердить импорт (${readyToImportCount})`
              : "Подтвердить импорт"}
        </button>
      </div>
    </div>
  )
}
