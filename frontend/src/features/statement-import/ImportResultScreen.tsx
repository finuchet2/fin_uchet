import { ArrowLeft, ArrowRight, CircleCheck, ShieldCheck, Upload } from "lucide-react"
import type { ImportConfirmResult } from "../../types/import"

interface ImportResultScreenProps {
  result: ImportConfirmResult
  onContinueReview: () => void
  onUploadAnother: () => void
  onNavigateToOperations: () => void
}

export default function ImportResultScreen({
  result,
  onContinueReview,
  onUploadAnother,
  onNavigateToOperations,
}: ImportResultScreenProps) {
  return (
    <div className="operation-review__success" role="status">
      <div className="operation-review__success-icon">
        <CircleCheck size={34} strokeWidth={1.8} />
      </div>
      <p className="statement-eyebrow">Импорт завершён</p>
      <h2 id="operation-review-success-title">Итог импорта выписки</h2>
      <p className="operation-review__success-copy">
        Подтверждённые бизнес-операции перенесены в основной финансовый учёт Bifintra.
      </p>

      <div className="operation-review__success-summary operation-review__success-summary--four">
        <div>
          <strong>{result.importedToLedger}</strong>
          <span>импортировано в учёт</span>
        </div>
        <div>
          <strong>{result.skippedDuplicates}</strong>
          <span>пропущено дубликатов</span>
        </div>
        <div>
          <strong>{result.unclassifiedCount}</strong>
          <span>без классификации</span>
        </div>
        <div>
          <strong>{result.pendingReviewCount}</strong>
          <span>остались на проверке</span>
        </div>
      </div>

      <div className="operation-review__success-notes">
        <p>
          <ShieldCheck size={14} aria-hidden="true" />
          В отчёты P&amp;L и Cash Flow попали только подтверждённые бизнес-операции.
        </p>
        {result.confirmedNonReportable > 0 && (
          <p>
            Ещё подтверждено операций без влияния на бизнес-отчёты (личные, переводы между
            счетами, снятие наличных): {result.confirmedNonReportable}.
          </p>
        )}
        {result.savedCorrectionsCount > 0 && (
          <p>
            Сохранено исправлений классификации для обучения правил: {result.savedCorrectionsCount}.
          </p>
        )}
      </div>

      <div className="operation-review__success-actions">
        {result.pendingReviewCount > 0 && (
          <button
            type="button"
            className="operation-review__success-secondary"
            onClick={onContinueReview}
          >
            <ArrowLeft size={16} /> Вернуться к проверке оставшихся
          </button>
        )}
        <button
          type="button"
          className="operation-review__success-secondary"
          onClick={onUploadAnother}
        >
          <Upload size={16} /> Загрузить ещё одну выписку
        </button>
        <button
          type="button"
          className="operation-review__success-primary"
          onClick={onNavigateToOperations}
        >
          Перейти к операциям <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}
