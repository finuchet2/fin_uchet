import type { RefObject } from "react"
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  CreditCard,
  RotateCcw,
  X,
} from "lucide-react"
import CustomSelect from "../../CustomSelect"
import TruncatedValue from "../../TruncatedValue"
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

interface ImportedOperationRowProps {
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

export default function ImportedOperationRow({
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
}: ImportedOperationRowProps) {
  const isExcluded = operation.status === "excluded"
  const isConfirmed = operation.status === "confirmed"
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

  const rowClassName = [
    isExcluded ? "is-excluded" : "",
    isConfirmed ? "is-confirmed" : "",
    operation.duplicate && !isExcluded ? `has-${operation.duplicate.kind}-duplicate` : "",
    isUncertain && !isExcluded ? "has-uncertain" : "",
    isSelected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <tr className={rowClassName}>
      <td className="operation-review__select-cell">
        <input
          type="checkbox"
          aria-label={`Выбрать операцию: ${operation.counterparty}`}
          checked={isSelected}
          disabled={operation.status !== "review" || isExactDuplicate}
          title={
            isExactDuplicate
              ? "Сначала проверьте точный дубликат"
              : operation.status !== "review"
                ? "Можно выбирать только операции на проверке"
                : "Выбрать операцию"
          }
          onChange={() => onToggleSelect(operation.id)}
        />
      </td>

      <td className="operation-review__date">
        <span
          className={
            operation.missingFields.includes("date") ? "operation-review__missing-text" : ""
          }
        >
          {operation.dateFact}
        </span>
      </td>

      <td className="operation-review__details-cell">
        <div className="operation-review__details">
          <div className="operation-review__counterparty-line">
            <TruncatedValue
              value={operation.counterparty}
              strictOverflow
              className={`operation-review__counterparty${operation.missingFields.includes("counterparty") ? " operation-review__missing-text" : ""}`}
            />
            {operation.duplicate && !isExcluded && (
              <button
                ref={isDuplicateOpen ? duplicateBadgeRef : undefined}
                type="button"
                className={`operation-review__duplicate operation-review__duplicate--${operation.duplicate.kind}`}
                aria-expanded={isDuplicateOpen}
                aria-label={`Сравнить дубликат: ${operation.counterparty}`}
                onClick={(event) => onOpenDuplicate(operation, event.currentTarget)}
              >
                <span aria-hidden="true">!</span>
                {operation.duplicate.kind === "exact" ? "Дубликат" : "Возможный дубликат"}
              </button>
            )}
            {operation.missingFields.length > 0 && !isExcluded && (
              <span
                className="operation-review__missing-badge"
                title={`Отсутствуют поля: ${operation.missingFields.join(", ")}`}
              >
                Неполные данные
              </span>
            )}
          </div>

          <TruncatedValue
            value={operation.purpose}
            strictOverflow
            className={`operation-review__purpose${operation.missingFields.includes("purpose") ? " operation-review__missing-text" : ""}`}
          />

          {(showPersonalFundsControl || (!isExcluded && operation.reviewReasons.length > 0)) && (
            <div className="operation-review__meta-chips">
              {showPersonalFundsControl && (
                <button
                  type="button"
                  className={`operation-review__personal-flag${operation.paidByPersonalFunds ? " is-active" : ""}`}
                  title="Бизнес-расход, оплаченный личными средствами: попадёт в P&L, но не исказит Cash Flow по бизнес-счёту"
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
              {!isExcluded && operation.reviewReasons.length > 0 && (
                <TruncatedValue
                  value={operation.reviewReasons[0]}
                  tooltipValue={operation.reviewReasons.join(" • ")}
                  className="operation-review__reason-chip"
                  tooltipOnHover
                />
              )}
            </div>
          )}
        </div>
      </td>

      <td className={`operation-review__amount operation-review__amount--${operation.amountKind}`}>
        {operation.amountKind === "transfer" ? (
          <span className="operation-review__transfer">
            <ArrowLeftRight size={14} />
            <TruncatedValue
              value={amountLabel}
              strictOverflow
              className="operation-review__amount-value"
            />
          </span>
        ) : (
          <TruncatedValue
            value={amountLabel}
            strictOverflow
            className="operation-review__amount-value"
          />
        )}
      </td>

      <td>
        <div className="operation-review__field-content">
          <div className="operation-review__field">
            <CustomSelect
              ariaLabel={`Тип операции: ${operation.counterparty}`}
              value={operation.type}
              options={typeOptions}
              disabled={isExcluded}
              menuPortal
              strictTooltip
              className={`operation-review__select operation-review__select--type${isUncertainValue(operation.type) ? " operation-review__select--uncertain" : ""}`}
              onChange={(value) =>
                onUpdateField(operation.id, { type: value as ImportOperationType })
              }
            />
            {isUncertainValue(operation.type) && (
              <TruncatedValue
                value="Требует проверки: не удалось определить тип операции"
                className="operation-review__field-alert"
                tooltipOnHover
                ariaLabel="Требует проверки: не удалось определить тип операции"
              >
                <AlertCircle size={14} aria-hidden="true" />
              </TruncatedValue>
            )}
          </div>
          <FieldConfidenceBadge suggestion={operation.suggestions.type} />
        </div>
      </td>

      <td>
        <div className="operation-review__field-content">
          <div className="operation-review__field">
            <CustomSelect
              ariaLabel={`Категория: ${operation.counterparty}`}
              value={operation.category}
              options={categoryOptions}
              disabled={isExcluded}
              menuPortal
              strictTooltip
              className={`operation-review__select operation-review__select--category${isUncertainValue(operation.category) ? " operation-review__select--uncertain" : ""}`}
              onChange={(value) => onUpdateField(operation.id, { category: value })}
            />
            {isUncertainValue(operation.category) && (
              <TruncatedValue
                value="Требует проверки: не удалось определить категорию"
                className="operation-review__field-alert"
                tooltipOnHover
                ariaLabel="Требует проверки: не удалось определить категорию"
              >
                <AlertCircle size={14} aria-hidden="true" />
              </TruncatedValue>
            )}
          </div>
          <FieldConfidenceBadge suggestion={operation.suggestions.category} />
        </div>
      </td>

      <td>
        <div className="operation-review__field-content">
          <div className="operation-review__field">
            <CustomSelect
              ariaLabel={`Проект: ${operation.counterparty}`}
              value={operation.project}
              options={projectOptions}
              disabled={isExcluded}
              menuPortal
              strictTooltip
              className="operation-review__select operation-review__select--project"
              onChange={(value) => onUpdateField(operation.id, { project: value })}
            />
          </div>
          <FieldConfidenceBadge suggestion={operation.suggestions.project} />
        </div>
      </td>

      <td>
        <div className="operation-review__field-content">
          <div className="operation-review__field">
            <CustomSelect
              ariaLabel={`Принадлежность: ${operation.counterparty}`}
              options={ownershipOptions}
              className={`operation-review__owner operation-review__owner--${operation.ownership === "Бизнес" ? "business" : operation.ownership === "Личное" ? "personal" : "unknown"}${isUncertainValue(operation.ownership) ? " operation-review__select--uncertain" : ""}`}
              value={operation.ownership}
              disabled={isExcluded}
              menuPortal
              strictTooltip
              onChange={(value) =>
                onUpdateField(operation.id, { ownership: value as OwnershipStatus })
              }
            />
            {isUncertainValue(operation.ownership) && (
              <TruncatedValue
                value="Требует проверки: не удалось определить принадлежность операции"
                className="operation-review__field-alert"
                tooltipOnHover
                ariaLabel="Требует проверки: не удалось определить принадлежность операции"
              >
                <AlertCircle size={14} aria-hidden="true" />
              </TruncatedValue>
            )}
          </div>
          <FieldConfidenceBadge suggestion={operation.suggestions.ownership} />
        </div>
      </td>

      <td className="operation-review__actions">
        <div className="operation-review__status-wrap">
          <span className={`operation-review__status-pill operation-review__status-pill--${operation.status}`}>
            {operation.status === "review"
              ? "На проверке"
              : operation.importedToLedger
                ? "В учёте"
                : operation.status === "confirmed"
                  ? "Подтверждена"
                  : "Исключена"}
            {operation.corrections.length > 0 && (
              <i
                className="operation-review__modified-dot"
                title={`Изменено полей: ${operation.corrections.length}`}
              />
            )}
          </span>
          <div className="operation-review__action-buttons">
            {operation.status === "review" && (
              <>
                <button
                  type="button"
                  className="operation-review__confirm"
                  disabled={isExactDuplicate}
                  aria-label={`Подтвердить операцию: ${operation.counterparty}`}
                  title={
                    isExactDuplicate
                      ? "Сначала проверьте дубликат"
                      : "Подтвердить операцию"
                  }
                  onClick={() => onConfirm(operation.id)}
                >
                  <Check size={15} />
                </button>
                <button
                  type="button"
                  className="operation-review__exclude"
                  aria-label={`Исключить из импорта: ${operation.counterparty}`}
                  title="Исключить из импорта"
                  onClick={() => onExclude(operation.id)}
                >
                  <X size={14} />
                </button>
              </>
            )}
            {operation.status === "confirmed" && !operation.importedToLedger && (
              <>
                <button
                  type="button"
                  className="operation-review__undo"
                  aria-label={`Вернуть на проверку: ${operation.counterparty}`}
                  title="Вернуть на проверку"
                  onClick={() => onRestoreToReview(operation.id)}
                >
                  <RotateCcw size={13} />
                </button>
                <button
                  type="button"
                  className="operation-review__exclude"
                  aria-label={`Исключить из импорта: ${operation.counterparty}`}
                  title="Исключить из импорта"
                  onClick={() => onExclude(operation.id)}
                >
                  <X size={14} />
                </button>
              </>
            )}
            {operation.status === "excluded" && (
              <button
                type="button"
                className="operation-review__undo"
                aria-label={`Восстановить на проверку: ${operation.counterparty}`}
                title="Восстановить на проверку"
                onClick={() => onRestoreToReview(operation.id)}
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}
