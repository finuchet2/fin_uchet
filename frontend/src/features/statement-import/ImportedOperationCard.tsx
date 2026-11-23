import type { RefObject } from "react"
import { ArrowLeftRight, Check, CreditCard, RotateCcw, X } from "lucide-react"
import CustomSelect from "../../CustomSelect"
import FieldConfidenceBadge from "./FieldConfidenceBadge"
import {
  formatRuCurrency,
  isOperationUncertain,
  isUncertainValue,
  type BankAccountType,
  type ImportOperationType,
  type ImportedOperation,
  type OwnershipStatus,
} from "../../types/import"

interface SelectOption {
  value: string
  label: string
}

interface ImportedOperationCardProps {
  operation: ImportedOperation
  accountType: BankAccountType
  typeOptions: SelectOption[]
  categoryOptions: SelectOption[]
  projectOptions: SelectOption[]
  ownershipOptions: SelectOption[]
  isSelected: boolean
  isDuplicateOpen: boolean
  duplicateBadgeRef: RefObject<HTMLButtonElement>
  onToggleSelect: (id: string) => void
  onUpdateField: (
    id: string,
    patch: {
      type?: ImportOperationType
      category?: string
      project?: string
      ownership?: OwnershipStatus
      paidByPersonalFunds?: boolean
    },
  ) => void
  onConfirm: (id: string) => void
  onExclude: (id: string) => void
  onRestoreToReview: (id: string) => void
  onOpenDuplicate: (operation: ImportedOperation, trigger: HTMLButtonElement) => void
}

export default function ImportedOperationCard({
  operation,
  accountType,
  typeOptions,
  categoryOptions,
  projectOptions,
  ownershipOptions,
  isSelected,
  isDuplicateOpen,
  duplicateBadgeRef,
  onToggleSelect,
  onUpdateField,
  onConfirm,
  onExclude,
  onRestoreToReview,
  onOpenDuplicate,
}: ImportedOperationCardProps) {
  const isExcluded = operation.status === "excluded"
  const isExactDuplicate = operation.duplicate?.kind === "exact"
  const isUncertain = isOperationUncertain(operation)
  const amountPrefix =
    operation.amountKind === "income" ? "+" : operation.amountKind === "expense" ? "−" : ""
  const amountLabel =
    operation.missingFields.includes("amount") && operation.amount === 0
      ? "Сумма не указана"
      : `${amountPrefix}${formatRuCurrency(operation.amount)}`
  const showPersonalFundsControl =
    !isExcluded &&
    operation.ownership === "Бизнес" &&
    operation.amountKind === "expense" &&
    (accountType === "personal" || operation.paidByPersonalFunds)

  return (
    <article
      className={[
        "operation-review-card",
        isExcluded ? "is-excluded" : "",
        operation.status === "confirmed" ? "is-confirmed" : "",
        isUncertain && !isExcluded ? "has-uncertain" : "",
        isSelected ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="operation-review-card__top">
        <div className="operation-review-card__select">
          <input
            type="checkbox"
            aria-label={`Выбрать операцию: ${operation.counterparty}`}
            checked={isSelected}
            disabled={operation.status !== "review" || isExactDuplicate}
            onChange={() => onToggleSelect(operation.id)}
          />
          <span className="operation-review__date">{operation.dateFact}</span>
          <span className={`operation-review__status-pill operation-review__status-pill--${operation.status}`}>
            {operation.status === "review"
              ? "На проверке"
              : operation.importedToLedger
                ? "В учёте"
                : operation.status === "confirmed"
                  ? "Подтверждена"
                  : "Исключена"}
          </span>
        </div>

        <div className={`operation-review__amount operation-review__amount--${operation.amountKind}`}>
          {operation.amountKind === "transfer" && <ArrowLeftRight size={14} />}
          <span>{amountLabel}</span>
        </div>
      </div>

      <div className="operation-review-card__details">
        <strong>{operation.counterparty}</strong>
        <p>{operation.purpose}</p>
        <div className="operation-review__meta-chips">
          {operation.duplicate && !isExcluded && (
            <button
              ref={isDuplicateOpen ? duplicateBadgeRef : undefined}
              type="button"
              className={`operation-review__duplicate operation-review__duplicate--${operation.duplicate.kind}`}
              aria-expanded={isDuplicateOpen}
              onClick={(event) => onOpenDuplicate(operation, event.currentTarget)}
            >
              <span aria-hidden="true">!</span>
              {operation.duplicate.kind === "exact" ? "Дубликат" : "Возможный дубликат"}
            </button>
          )}
          {showPersonalFundsControl && (
            <button
              type="button"
              className={`operation-review__personal-flag${operation.paidByPersonalFunds ? " is-active" : ""}`}
              onClick={() =>
                onUpdateField(operation.id, {
                  paidByPersonalFunds: !operation.paidByPersonalFunds,
                })
              }
            >
              <CreditCard size={10} aria-hidden="true" />
              <span>
                {operation.paidByPersonalFunds ? "Личные средства (P&L)" : "Личные средства?"}
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="operation-review-card__fields">
        <div className="operation-review-card__field">
          <div className="operation-review-card__field-head">
            <span>Тип операции</span>
            <FieldConfidenceBadge suggestion={operation.suggestions.type} />
          </div>
          <CustomSelect
            ariaLabel={`Тип операции: ${operation.counterparty}`}
            value={operation.type}
            options={typeOptions}
            disabled={isExcluded}
            menuPortal
            className={`operation-review__select${isUncertainValue(operation.type) ? " operation-review__select--uncertain" : ""}`}
            onChange={(value) =>
              onUpdateField(operation.id, { type: value as ImportOperationType })
            }
          />
        </div>

        <div className="operation-review-card__field">
          <div className="operation-review-card__field-head">
            <span>Категория</span>
            <FieldConfidenceBadge suggestion={operation.suggestions.category} />
          </div>
          <CustomSelect
            ariaLabel={`Категория: ${operation.counterparty}`}
            value={operation.category}
            options={categoryOptions}
            disabled={isExcluded}
            menuPortal
            className={`operation-review__select${isUncertainValue(operation.category) ? " operation-review__select--uncertain" : ""}`}
            onChange={(value) => onUpdateField(operation.id, { category: value })}
          />
        </div>

        <div className="operation-review-card__field">
          <div className="operation-review-card__field-head">
            <span>Проект</span>
            <FieldConfidenceBadge suggestion={operation.suggestions.project} />
          </div>
          <CustomSelect
            ariaLabel={`Проект: ${operation.counterparty}`}
            value={operation.project}
            options={projectOptions}
            disabled={isExcluded}
            menuPortal
            className="operation-review__select"
            onChange={(value) => onUpdateField(operation.id, { project: value })}
          />
        </div>

        <div className="operation-review-card__field">
          <div className="operation-review-card__field-head">
            <span>Принадлежность</span>
            <FieldConfidenceBadge suggestion={operation.suggestions.ownership} />
          </div>
          <CustomSelect
            ariaLabel={`Принадлежность: ${operation.counterparty}`}
            value={operation.ownership}
            options={ownershipOptions}
            disabled={isExcluded}
            menuPortal
            className={`operation-review__owner operation-review__owner--${operation.ownership === "Бизнес" ? "business" : operation.ownership === "Личное" ? "personal" : "unknown"}${isUncertainValue(operation.ownership) ? " operation-review__select--uncertain" : ""}`}
            onChange={(value) =>
              onUpdateField(operation.id, { ownership: value as OwnershipStatus })
            }
          />
        </div>
      </div>

      <div className="operation-review-card__actions">
        {operation.status === "review" && (
          <>
            <button
              type="button"
              className="operation-review-card__btn operation-review-card__btn--confirm"
              disabled={isExactDuplicate}
              onClick={() => onConfirm(operation.id)}
            >
              <Check size={14} /> Подтвердить
            </button>
            <button
              type="button"
              className="operation-review-card__btn operation-review-card__btn--exclude"
              onClick={() => onExclude(operation.id)}
            >
              <X size={14} /> Исключить
            </button>
          </>
        )}
        {operation.status === "confirmed" && !operation.importedToLedger && (
          <>
            <button
              type="button"
              className="operation-review-card__btn"
              onClick={() => onRestoreToReview(operation.id)}
            >
              <RotateCcw size={14} /> На проверку
            </button>
            <button
              type="button"
              className="operation-review-card__btn operation-review-card__btn--exclude"
              onClick={() => onExclude(operation.id)}
            >
              <X size={14} /> Исключить
            </button>
          </>
        )}
        {operation.status === "excluded" && (
          <button
            type="button"
            className="operation-review-card__btn"
            onClick={() => onRestoreToReview(operation.id)}
          >
            <RotateCcw size={14} /> Вернуть на проверку
          </button>
        )}
      </div>
    </article>
  )
}
