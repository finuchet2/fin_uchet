import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Check, CheckCheck, FileSpreadsheet, Info, Search, X } from "lucide-react"
import TruncatedValue from "./TruncatedValue"
import { importApi, type OperationUpdatePatch } from "./api/importApi"
import DuplicateComparisonPopover, {
  type PopoverAnchorRect,
} from "./features/statement-import/DuplicateComparisonPopover"
import ImportResultScreen from "./features/statement-import/ImportResultScreen"
import ImportStickyActionBar from "./features/statement-import/ImportStickyActionBar"
import ImportedOperationCard from "./features/statement-import/ImportedOperationCard"
import ImportedOperationRow from "./features/statement-import/ImportedOperationRow"
import PreprocessingSummary from "./features/statement-import/PreprocessingSummary"
import { computeBatchSummary } from "./services/statementParser"
import {
  DEFAULT_FALLBACK_CATEGORIES,
  IMPORT_OPERATION_TYPES,
  OWNERSHIP_OPTIONS,
  formatRuCurrency,
  mapImportedOperationToLedger,
  type ImportBatch,
  type ImportCategoryBuckets,
  type ImportConfirmResult,
  type ImportOperationType,
  type ImportProjectOption,
  type ImportQuickFilter,
  type ImportedOperation,
  type LedgerOperationInput,
  type ManualCorrection,
  type OwnershipStatus,
} from "./types/import"

interface BankStatementReviewProps {
  batch: ImportBatch
  projects: ImportProjectOption[]
  categories: ImportCategoryBuckets
  onImportConfirmed: (ops: LedgerOperationInput[]) => void
  onBack: () => void
  onUploadAnother: () => void
  onNavigateToOperations: () => void
}

const FILTER_TABS: Array<{ id: ImportQuickFilter; label: string }> = [
  { id: "all", label: "Все операции" },
  { id: "review", label: "Требуют проверки" },
  { id: "confirmed", label: "Подтверждённые" },
  { id: "duplicates", label: "Дубликаты" },
  { id: "excluded", label: "Исключённые" },
]

const OPERATION_TYPE_OPTIONS = IMPORT_OPERATION_TYPES.map((value) => ({ value, label: value }))
const OWNERSHIP_SELECT_OPTIONS = OWNERSHIP_OPTIONS.map((value) => ({ value, label: value }))

function uniqueOptions(values: string[]): Array<{ value: string; label: string }> {
  const seen = new Set<string>()
  const result: Array<{ value: string; label: string }> = []
  for (const raw of values) {
    const clean = raw.trim()
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    result.push({ value: clean, label: clean })
  }
  return result
}

export default function BankStatementReview({
  batch,
  projects,
  categories,
  onImportConfirmed,
  onBack,
  onUploadAnother,
  onNavigateToOperations,
}: BankStatementReviewProps) {
  const [operations, setOperations] = useState<ImportedOperation[]>(() => batch.operations)
  const [filter, setFilter] = useState<ImportQuickFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [importResult, setImportResult] = useState<ImportConfirmResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<{ text: string; kind: "success" | "error" } | null>(null)
  const [openDuplicateId, setOpenDuplicateId] = useState<string | null>(null)
  const [duplicateAnchorRect, setDuplicateAnchorRect] = useState<PopoverAnchorRect>({
    top: 8,
    bottom: 8,
    left: 8,
    right: 8,
  })
  const selectAllRef = useRef<HTMLInputElement>(null)
  const duplicateBadgeRef = useRef<HTMLButtonElement>(null)
  const duplicatePopoverRef = useRef<HTMLDivElement>(null)
  const noticeTimerRef = useRef<number | null>(null)

  const flashNotice = (text: string, kind: "success" | "error" = "success") => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    setNotice({ text, kind })
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 3200)
  }

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    }
  }, [])

  const summary = useMemo(() => computeBatchSummary(operations), [operations])

  const counts = useMemo<Record<ImportQuickFilter, number>>(
    () => ({
      all: operations.filter((operation) => operation.status !== "excluded").length,
      review: operations.filter((operation) => operation.status === "review").length,
      confirmed: operations.filter((operation) => operation.status === "confirmed").length,
      duplicates: operations.filter(
        (operation) => operation.status !== "excluded" && Boolean(operation.duplicate),
      ).length,
      excluded: operations.filter((operation) => operation.status === "excluded").length,
    }),
    [operations],
  )

  const summaryTotals = useMemo(
    () =>
      operations.reduce(
        (totals, operation) => {
          if (operation.status !== "excluded" && operation.amountKind !== "transfer") {
            totals[operation.amountKind] += operation.amount
          }
          return totals
        },
        { income: 0, expense: 0 },
      ),
    [operations],
  )

  const selectedTotals = useMemo(
    () =>
      operations.reduce(
        (totals, operation) => {
          if (!selectedIds.includes(operation.id)) return totals
          if (operation.amountKind === "income") totals.income += operation.amount
          else if (operation.amountKind === "expense") totals.expense += operation.amount
          return totals
        },
        { income: 0, expense: 0 },
      ),
    [operations, selectedIds],
  )

  const confirmedReadyCount = useMemo(
    () =>
      operations.filter(
        (operation) => operation.status === "confirmed" && !operation.importedToLedger,
      ).length,
    [operations],
  )

  const projectOptions = useMemo(
    () =>
      uniqueOptions([
        ...projects.filter((project) => !project.archived).map((project) => project.name),
        ...operations.map((operation) => operation.project),
        "Без проекта",
      ]),
    [projects, operations],
  )

  const categoryOptionsByKind = useMemo(() => {
    const expNames = categories.expenses.filter((c) => c.active).map((c) => c.name)
    const incNames = categories.income.filter((c) => c.active).map((c) => c.name)
    const taxNames = categories.taxes.filter((c) => c.active).map((c) => c.name)
    const opCategoryNames = operations.map((operation) => operation.category)

    return {
      income: uniqueOptions([
        ...incNames,
        ...DEFAULT_FALLBACK_CATEGORIES,
        ...expNames,
        ...taxNames,
        ...opCategoryNames,
        "Неопределённое",
      ]),
      tax: uniqueOptions([
        ...taxNames,
        ...expNames,
        ...DEFAULT_FALLBACK_CATEGORIES,
        ...incNames,
        ...opCategoryNames,
        "Неопределённое",
      ]),
      expense: uniqueOptions([
        ...expNames,
        ...DEFAULT_FALLBACK_CATEGORIES,
        ...taxNames,
        ...incNames,
        ...opCategoryNames,
        "Неопределённое",
      ]),
    }
  }, [categories, operations])

  const categoryOptionsFor = (operation: ImportedOperation) => {
    if (operation.type === "Налоговый платёж") return categoryOptionsByKind.tax
    if (
      operation.type === "Доход" ||
      operation.type === "Возврат от поставщика" ||
      operation.type === "Получение кредита"
    ) {
      return categoryOptionsByKind.income
    }
    return categoryOptionsByKind.expense
  }

  const visibleOperations = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()
    return operations.filter((operation) => {
      if (filter === "excluded" && operation.status !== "excluded") return false
      if (filter === "review" && operation.status !== "review") return false
      if (filter === "confirmed" && operation.status !== "confirmed") return false
      if (
        filter === "duplicates" &&
        (operation.status === "excluded" || !operation.duplicate)
      ) {
        return false
      }
      if (filter === "all" && operation.status === "excluded") return false

      if (!normalizedSearch) return true
      return (
        operation.counterparty.toLowerCase().includes(normalizedSearch) ||
        operation.purpose.toLowerCase().includes(normalizedSearch) ||
        operation.category.toLowerCase().includes(normalizedSearch) ||
        operation.project.toLowerCase().includes(normalizedSearch)
      )
    })
  }, [operations, filter, searchQuery])

  const selectableIds = useMemo(
    () =>
      visibleOperations
        .filter(
          (operation) =>
            operation.status === "review" && operation.duplicate?.kind !== "exact",
        )
        .map((operation) => operation.id),
    [visibleOperations],
  )

  const selectedVisibleCount = selectableIds.filter((id) => selectedIds.includes(id)).length
  const allVisibleSelected =
    selectableIds.length > 0 && selectedVisibleCount === selectableIds.length

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected
    }
  }, [selectedVisibleCount, allVisibleSelected])

  useEffect(() => {
    if (!openDuplicateId) return undefined
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        !duplicatePopoverRef.current?.contains(target) &&
        !duplicateBadgeRef.current?.contains(target)
      ) {
        setOpenDuplicateId(null)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenDuplicateId(null)
    }
    const closeOnViewportChange = () => setOpenDuplicateId(null)

    document.addEventListener("mousedown", closeOnOutsideClick)
    document.addEventListener("keydown", closeOnEscape)
    document.addEventListener("scroll", closeOnViewportChange, true)
    window.addEventListener("resize", closeOnViewportChange)
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick)
      document.removeEventListener("keydown", closeOnEscape)
      document.removeEventListener("scroll", closeOnViewportChange, true)
      window.removeEventListener("resize", closeOnViewportChange)
    }
  }, [openDuplicateId])

  const recordCorrection = (
    existing: ManualCorrection[],
    field: ManualCorrection["field"],
    originalValue: string,
    newValue: string,
  ): ManualCorrection[] => {
    if (originalValue === newValue) return existing
    const nowIso = new Date().toISOString()
    const previousEntry = existing.find((item) => item.field === field)
    const rootOriginal = previousEntry ? previousEntry.originalValue : originalValue
    const filtered = existing.filter((item) => item.field !== field)
    if (rootOriginal === newValue) return filtered
    return [
      ...filtered,
      {
        field,
        originalValue: rootOriginal,
        newValue,
        correctedAt: nowIso,
      },
    ]
  }

  const handleUpdateField = (
    id: string,
    patch: {
      type?: ImportOperationType
      category?: string
      project?: string
      ownership?: OwnershipStatus
      paidByPersonalFunds?: boolean
    },
  ) => {
    let apiPatch: OperationUpdatePatch = {}

    setOperations((current) =>
      current.map((operation) => {
        if (operation.id !== id) return operation

        let nextType = patch.type ?? operation.type
        let nextCategory = patch.category ?? operation.category
        const nextProject = patch.project ?? operation.project
        let nextOwnership = patch.ownership ?? operation.ownership
        let nextPaidByPersonalFunds =
          patch.paidByPersonalFunds ?? operation.paidByPersonalFunds
        let nextAmountKind = operation.amountKind

        if (patch.type !== undefined) {
          if (nextType === "Личный расход") {
            nextOwnership = "Личное"
            nextPaidByPersonalFunds = false
            nextAmountKind = "expense"
          } else if (nextType === "Перевод между собственными счетами") {
            nextAmountKind = "transfer"
            nextPaidByPersonalFunds = false
          } else if (
            nextType === "Доход" ||
            nextType === "Возврат от поставщика" ||
            nextType === "Получение кредита"
          ) {
            nextAmountKind = "income"
            if (nextOwnership === "Личное") nextOwnership = "Бизнес"
            nextPaidByPersonalFunds = false
          } else if (
            nextType === "Расход" ||
            nextType === "Банковская комиссия" ||
            nextType === "Налоговый платёж" ||
            nextType === "Возврат покупателю" ||
            nextType === "Погашение кредита"
          ) {
            nextAmountKind = "expense"
            if (nextOwnership === "Личное") nextOwnership = "Бизнес"
            if (batch.accountType === "personal" && nextType !== "Погашение кредита") {
              nextPaidByPersonalFunds = true
            }
          } else {
            nextAmountKind = operation.direction === "credit" ? "income" : "expense"
          }
        }

        if (patch.ownership !== undefined) {
          if (nextOwnership === "Личное") {
            nextPaidByPersonalFunds = false
            if (nextType === "Расход") nextType = "Личный расход"
          } else if (nextOwnership === "Бизнес") {
            if (nextType === "Личный расход") nextType = "Расход"
            if (
              batch.accountType === "personal" &&
              nextAmountKind === "expense" &&
              patch.paidByPersonalFunds === undefined
            ) {
              nextPaidByPersonalFunds = true
            }
          }
        }

        if (nextType === "Налоговый платёж" && nextCategory === "Неопределённое") {
          nextCategory = categories.taxes[0]?.name ?? "Налоги"
        }

        let corrections = operation.corrections
        corrections = recordCorrection(corrections, "type", operation.type, nextType)
        corrections = recordCorrection(corrections, "category", operation.category, nextCategory)
        corrections = recordCorrection(corrections, "project", operation.project, nextProject)
        corrections = recordCorrection(corrections, "ownership", operation.ownership, nextOwnership)
        corrections = recordCorrection(
          corrections,
          "paidByPersonalFunds",
          String(operation.paidByPersonalFunds),
          String(nextPaidByPersonalFunds),
        )

        apiPatch = {
          type: nextType,
          category: nextCategory,
          project: nextProject,
          ownership: nextOwnership,
          paidByPersonalFunds: nextPaidByPersonalFunds,
        }

        return {
          ...operation,
          type: nextType,
          category: nextCategory,
          project: nextProject,
          ownership: nextOwnership,
          paidByPersonalFunds: nextPaidByPersonalFunds,
          amountKind: nextAmountKind,
          corrections,
        }
      }),
    )

    importApi.updateOperation(batch.id, id, apiPatch).catch(() => {
      flashNotice("Не удалось сохранить изменение на сервере", "error")
    })
  }

  const confirmOperations = (ids: string[], customNotice?: string) => {
    const validIds = ids.filter((id) => {
      const target = operations.find((operation) => operation.id === id)
      return target && target.status !== "excluded" && target.duplicate?.kind !== "exact"
    })
    if (validIds.length === 0) {
      if (ids.length > 0) {
        flashNotice("Сначала проверьте и разрешите точный дубликат", "error")
      }
      return
    }

    const validSet = new Set(validIds)
    setOperations((current) =>
      current.map((operation) =>
        validSet.has(operation.id) ? { ...operation, status: "confirmed" } : operation,
      ),
    )
    setSelectedIds((current) => current.filter((id) => !validSet.has(id)))
    flashNotice(
      customNotice ??
        (validIds.length === 1
          ? "Операция подтверждена"
          : `Подтверждено операций: ${validIds.length}`),
    )

    importApi
      .bulkUpdateOperations(batch.id, validIds, { status: "confirmed" })
      .catch(() => flashNotice("Не удалось обновить статус на сервере", "error"))
  }

  const excludeOperations = (ids: string[], customNotice?: string) => {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    setOperations((current) =>
      current.map((operation) =>
        idSet.has(operation.id) && !operation.importedToLedger
          ? { ...operation, status: "excluded" }
          : operation,
      ),
    )
    setSelectedIds((current) => current.filter((id) => !idSet.has(id)))
    flashNotice(
      customNotice ??
        (ids.length === 1 ? "Операция исключена" : `Исключено операций: ${ids.length}`),
    )

    importApi
      .bulkUpdateOperations(batch.id, ids, { status: "excluded" })
      .catch(() => flashNotice("Не удалось исключить операции на сервере", "error"))
  }

  const restoreToReview = (id: string) => {
    const target = operations.find((operation) => operation.id === id)
    if (!target || target.importedToLedger) return

    setOperations((current) =>
      current.map((operation) =>
        operation.id === id ? { ...operation, status: "review" } : operation,
      ),
    )
    flashNotice("Операция возвращена на проверку")

    importApi
      .updateOperation(batch.id, id, { status: "review" })
      .catch(() => flashNotice("Не удалось вернуть статус на сервере", "error"))
  }

  const openDuplicatePopover = (operation: ImportedOperation, badge: HTMLButtonElement) => {
    const bounds = badge.getBoundingClientRect()
    setDuplicateAnchorRect({
      top: bounds.top,
      bottom: bounds.bottom,
      left: bounds.left,
      right: bounds.right,
    })
    setOpenDuplicateId((current) => (current === operation.id ? null : operation.id))
  }

  const skipDuplicate = (operation: ImportedOperation) => {
    setOperations((current) =>
      current.map((candidate) =>
        candidate.id === operation.id
          ? {
              ...candidate,
              status: "excluded",
              duplicate: candidate.duplicate
                ? { ...candidate.duplicate, resolved: "skipped" }
                : undefined,
            }
          : candidate,
      ),
    )
    setSelectedIds((current) => current.filter((id) => id !== operation.id))
    setOpenDuplicateId(null)
    flashNotice("Дубликат исключён из импорта")

    importApi
      .updateOperation(batch.id, operation.id, { status: "excluded" })
      .catch(() => flashNotice("Не удалось обновить дубликат на сервере", "error"))
  }

  const keepDuplicate = (operation: ImportedOperation) => {
    setOperations((current) =>
      current.map((candidate) =>
        candidate.id === operation.id
          ? { ...candidate, duplicate: undefined }
          : candidate,
      ),
    )
    setOpenDuplicateId(null)
    flashNotice("Операция оставлена как новая — можно проверять и подтверждать")

    importApi
      .updateOperation(batch.id, operation.id, { duplicate: undefined })
      .catch(() => flashNotice("Не удалось обновить дубликат на сервере", "error"))
  }

  const toggleSelection = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    )
  }

  const finalizeImport = async () => {
    const selectedSet = new Set(selectedIds)
    const promotedOperations = operations.map((operation) =>
      operation.status === "review" &&
      selectedSet.has(operation.id) &&
      operation.duplicate?.kind !== "exact"
        ? { ...operation, status: "confirmed" as const }
        : operation,
    )

    const newlyConfirmedOps = promotedOperations.filter(
      (operation) => operation.status === "confirmed" && !operation.importedToLedger,
    )

    if (newlyConfirmedOps.length === 0) {
      flashNotice("Нет подтверждённых операций для переноса в учёт", "error")
      return
    }

    const newlyConfirmedIds = newlyConfirmedOps.map((operation) => operation.id)
    const excludedIds = promotedOperations
      .filter((operation) => operation.status === "excluded")
      .map((operation) => operation.id)

    setSubmitting(true)
    try {
      const result = await importApi.confirmBatch(batch.id, {
        operations: promotedOperations,
        newlyConfirmedIds,
        excludedIds,
      })

      const ledgerOps = newlyConfirmedOps
        .map(mapImportedOperationToLedger)
        .filter((item): item is LedgerOperationInput => item !== null)

      if (ledgerOps.length > 0) {
        onImportConfirmed(ledgerOps)
      }

      const newlyConfirmedSet = new Set(newlyConfirmedIds)
      setOperations(
        promotedOperations.map((operation) =>
          newlyConfirmedSet.has(operation.id)
            ? { ...operation, importedToLedger: true }
            : operation,
        ),
      )
      setSelectedIds([])
      setImportResult(result)
    } catch {
      flashNotice("Не удалось завершить импорт. Попробуйте ещё раз.", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const openDuplicateOperation = openDuplicateId
    ? operations.find((candidate) => candidate.id === openDuplicateId)
    : undefined
  const matchingFileOperation =
    openDuplicateOperation?.duplicate?.source === "in_file" &&
    openDuplicateOperation.duplicate.matchedOperationId
      ? operations.find(
          (candidate) =>
            candidate.id === openDuplicateOperation.duplicate?.matchedOperationId,
        )
      : undefined

  return (
    <section
      className="operation-review"
      aria-labelledby={
        importResult ? "operation-review-success-title" : "operation-review-title"
      }
    >
      {importResult ? (
        <ImportResultScreen
          result={importResult}
          onContinueReview={() => {
            setImportResult(null)
            setFilter("review")
          }}
          onUploadAnother={onUploadAnother}
          onNavigateToOperations={onNavigateToOperations}
        />
      ) : (
        <>
          <button type="button" className="operation-review__back" onClick={onBack}>
            <ArrowLeft size={17} />
            <span>Назад к загрузке файла</span>
          </button>

          <header className="operation-review__heading">
            <div>
              <div className="operation-review__title-line">
                <h2 id="operation-review-title">Проверка операций</h2>
                <span className="operation-review__count">
                  {counts.review} требуют проверки
                </span>
              </div>
              <div className="operation-review__file">
                <FileSpreadsheet size={16} />
                <TruncatedValue
                  value={batch.fileName}
                  strictOverflow
                  className="operation-review__file-name"
                />
              </div>
            </div>
            <div className="operation-review__summary" aria-label="Сводка импорта">
              <span>
                <strong>{counts.all}</strong> операций в выписке
              </span>
              <i />
              <span>
                <strong>{counts.duplicates}</strong> дубликатов
              </span>
              <i />
              <span className="operation-review__summary-total">
                <small>Поступления</small>
                <TruncatedValue
                  value={formatRuCurrency(summaryTotals.income)}
                  strictOverflow
                  className="operation-review__summary-total-value"
                />
              </span>
              <i />
              <span className="operation-review__summary-total">
                <small>Расходы</small>
                <TruncatedValue
                  value={formatRuCurrency(summaryTotals.expense)}
                  strictOverflow
                  className="operation-review__summary-total-value"
                />
              </span>
            </div>
          </header>

          <PreprocessingSummary
            batch={batch}
            summary={summary}
            onSelectFilter={setFilter}
          />

          <div className="operation-review__notice">
            <Info size={18} />
            <span>
              Неподтверждённые операции не попадают в отчётность P&amp;L и Cash Flow до сохранения
            </span>
          </div>

          <div className="operation-review__toolbar">
            <nav
              className="operation-review__filters"
              aria-label="Фильтр операций"
              role="tablist"
            >
              {FILTER_TABS.map(({ id, label }) => (
                <button
                  key={id}
                  id={`operation-filter-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  aria-controls="operation-review-table"
                  className={filter === id ? "is-active" : ""}
                  onClick={() => setFilter(id)}
                >
                  <span>{label}</span>
                  <i>{counts[id]}</i>
                </button>
              ))}
            </nav>

            <div className="operation-review__search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Поиск по контрагенту, назначению, проекту…"
                aria-label="Поиск по импортированным операциям"
              />
            </div>
          </div>

          <div
            className="operation-review__table-wrap"
            id="operation-review-table"
            role="tabpanel"
            aria-labelledby={`operation-filter-${filter}`}
          >
            <table className="operation-review__table">
              <colgroup>
                <col className="operation-review__col-check" />
                <col className="operation-review__col-date" />
                <col className="operation-review__col-details" />
                <col className="operation-review__col-amount" />
                <col className="operation-review__col-type" />
                <col className="operation-review__col-category" />
                <col className="operation-review__col-project" />
                <col className="operation-review__col-owner" />
                <col className="operation-review__col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th className="operation-review__select-cell">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      aria-label="Выбрать все операции, требующие проверки"
                      title="Выбрать все"
                      checked={allVisibleSelected}
                      disabled={selectableIds.length === 0}
                      onChange={() =>
                        setSelectedIds((current) =>
                          allVisibleSelected
                            ? current.filter((id) => !selectableIds.includes(id))
                            : Array.from(new Set([...current, ...selectableIds])),
                        )
                      }
                    />
                  </th>
                  <th>Дата</th>
                  <th>Контрагент и назначение</th>
                  <th>Сумма</th>
                  <th>Тип операции</th>
                  <th>Категория</th>
                  <th>Проект</th>
                  <th>Принадлежность</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {visibleOperations.map((operation) => (
                  <ImportedOperationRow
                    key={operation.id}
                    operation={operation}
                    accountType={batch.accountType}
                    typeOptions={OPERATION_TYPE_OPTIONS}
                    categoryOptions={categoryOptionsFor(operation)}
                    projectOptions={projectOptions}
                    ownershipOptions={OWNERSHIP_SELECT_OPTIONS}
                    isSelected={selectedIds.includes(operation.id)}
                    isDuplicateOpen={openDuplicateId === operation.id}
                    duplicateBadgeRef={duplicateBadgeRef}
                    onToggleSelect={toggleSelection}
                    onUpdateField={handleUpdateField}
                    onConfirm={(id) => confirmOperations([id])}
                    onExclude={(id) => excludeOperations([id])}
                    onRestoreToReview={restoreToReview}
                    onOpenDuplicate={openDuplicatePopover}
                  />
                ))}
              </tbody>
            </table>

            {visibleOperations.length === 0 && (
              <div className="operation-review__empty">
                <div>
                  {filter === "excluded" ? <X size={19} /> : <CheckCheck size={19} />}
                </div>
                <strong>
                  {filter === "excluded"
                    ? "Исключённых операций пока нет"
                    : "Операций в этой выборке нет"}
                </strong>
                <span>
                  {filter === "excluded"
                    ? "Исключённые операции и пропущенные дубликаты появятся здесь"
                    : "Измените фильтр или поисковый запрос"}
                </span>
              </div>
            )}
          </div>

          <div
            className="operation-review__mobile-list"
            role="tabpanel"
            aria-labelledby={`operation-filter-${filter}`}
          >
            {visibleOperations.length > 0 ? (
              visibleOperations.map((operation) => (
                <ImportedOperationCard
                  key={operation.id}
                  operation={operation}
                  accountType={batch.accountType}
                  typeOptions={OPERATION_TYPE_OPTIONS}
                  categoryOptions={categoryOptionsFor(operation)}
                  projectOptions={projectOptions}
                  ownershipOptions={OWNERSHIP_SELECT_OPTIONS}
                  isSelected={selectedIds.includes(operation.id)}
                  isDuplicateOpen={openDuplicateId === operation.id}
                  duplicateBadgeRef={duplicateBadgeRef}
                  onToggleSelect={toggleSelection}
                  onUpdateField={handleUpdateField}
                  onConfirm={(id) => confirmOperations([id])}
                  onExclude={(id) => excludeOperations([id])}
                  onRestoreToReview={restoreToReview}
                  onOpenDuplicate={openDuplicatePopover}
                />
              ))
            ) : (
              <div className="operation-review__empty">
                <div>
                  {filter === "excluded" ? <X size={19} /> : <CheckCheck size={19} />}
                </div>
                <strong>
                  {filter === "excluded"
                    ? "Исключённых операций пока нет"
                    : "Операций в этой выборке нет"}
                </strong>
                <span>
                  {filter === "excluded"
                    ? "Исключённые операции и пропущенные дубликаты появятся здесь"
                    : "Измените фильтр или поисковый запрос"}
                </span>
              </div>
            )}
          </div>

          {openDuplicateOperation && (
            <DuplicateComparisonPopover
              operation={openDuplicateOperation}
              matchingInFile={matchingFileOperation}
              anchorRect={duplicateAnchorRect}
              popoverRef={duplicatePopoverRef}
              onClose={() => setOpenDuplicateId(null)}
              onSkipDuplicate={skipDuplicate}
              onKeepOperation={keepDuplicate}
            />
          )}

          <ImportStickyActionBar
            selectedCount={selectedIds.length}
            selectedIncomeTotal={selectedTotals.income}
            selectedExpenseTotal={selectedTotals.expense}
            confirmedReadyCount={confirmedReadyCount}
            submitting={submitting}
            onConfirmSelected={() => confirmOperations(selectedIds)}
            onExcludeSelected={() => excludeOperations(selectedIds)}
            onFinalizeImport={finalizeImport}
          />

          <footer className="operation-review__footer">
            <span>
              <CheckCheck size={15} />
              {counts.review === 0
                ? "Все операции проверены"
                : `${counts.review} операций ожидают проверки`}
            </span>
            {notice && (
              <span
                className={`operation-review__toast${notice.kind === "error" ? " is-error" : ""}`}
                role="status"
              >
                <Check size={14} />
                {notice.text}
              </span>
            )}
            <span>
              Проверьте назначение и категорию перед подтверждением
            </span>
          </footer>
        </>
      )}
    </section>
  )
}
