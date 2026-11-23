import { Copy, FileCheck2, HelpCircle, SearchCheck, TriangleAlert } from "lucide-react"
import type { ImportBatch, ImportBatchSummary, ImportQuickFilter } from "../../types/import"

interface PreprocessingSummaryProps {
  batch: ImportBatch
  summary: ImportBatchSummary
  onSelectFilter: (filter: ImportQuickFilter) => void
}

export default function PreprocessingSummary({
  batch,
  summary,
  onSelectFilter,
}: PreprocessingSummaryProps) {
  const duplicatesTotal = summary.exactDuplicatesCount + summary.possibleDuplicatesCount

  return (
    <section className="operation-review__preproc-wrap" aria-label="Предварительная обработка выписки">
      {batch.sourceMode === "demo_preview" && (
        <div className="operation-review__context-bar">
          <span className="operation-review__context-chip operation-review__context-chip--note">
            XLSX предпросмотр: полный парсинг книги выполняет сервер при интеграции
          </span>
        </div>
      )}

      <div className="operation-review__preproc">
        <div className="operation-review__preproc-card">
          <span className="operation-review__preproc-icon">
            <SearchCheck size={15} aria-hidden="true" />
          </span>
          <div>
            <strong>{summary.totalFound}</strong>
            <span>Найдено операций</span>
          </div>
        </div>

        <div className="operation-review__preproc-card operation-review__preproc-card--good">
          <span className="operation-review__preproc-icon">
            <FileCheck2 size={15} aria-hidden="true" />
          </span>
          <div>
            <strong>{summary.recognizedCount}</strong>
            <span>Корректно распознано</span>
          </div>
        </div>

        <button
          type="button"
          className="operation-review__preproc-card operation-review__preproc-card--button"
          onClick={() => onSelectFilter("duplicates")}
        >
          <span className="operation-review__preproc-icon">
            <Copy size={15} aria-hidden="true" />
          </span>
          <div>
            <strong>{duplicatesTotal}</strong>
            <span>Возможные дубликаты</span>
          </div>
        </button>

        <div
          className={`operation-review__preproc-card ${summary.missingDataCount > 0 ? "operation-review__preproc-card--warn" : ""}`}
        >
          <span className="operation-review__preproc-icon">
            <TriangleAlert size={15} aria-hidden="true" />
          </span>
          <div>
            <strong>{summary.missingDataCount}</strong>
            <span>Неполные данные</span>
          </div>
        </div>

        <button
          type="button"
          className={`operation-review__preproc-card operation-review__preproc-card--button ${summary.unclassifiedCount > 0 ? "operation-review__preproc-card--warn" : ""}`}
          onClick={() => onSelectFilter("review")}
        >
          <span className="operation-review__preproc-icon">
            <HelpCircle size={15} aria-hidden="true" />
          </span>
          <div>
            <strong>{summary.unclassifiedCount}</strong>
            <span>Без классификации</span>
          </div>
        </button>
      </div>
    </section>
  )
}
