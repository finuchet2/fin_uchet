export type BankAccountType = "business" | "personal"

export interface BankAccount {
  id: string
  name: string
  bankName: string
  accountType: BankAccountType
  currency: "RUB"
  lastImportAt?: string
}

export const DEFAULT_BANK_ACCOUNTS: BankAccount[] = [
  {
    id: "acc-ip-main",
    name: "Расчётный счёт ИП",
    bankName: "Т-Банк",
    accountType: "business",
    currency: "RUB",
  },
  {
    id: "acc-ip-second",
    name: "Расчётный счёт № 2",
    bankName: "СберБизнес",
    accountType: "business",
    currency: "RUB",
  },
  {
    id: "acc-personal-card",
    name: "Личная карта •• 4821",
    bankName: "Личная карта",
    accountType: "personal",
    currency: "RUB",
  },
]

export const IMPORT_OPERATION_TYPES = [
  "Доход",
  "Расход",
  "Личный расход",
  "Перевод между собственными счетами",
  "Возврат от поставщика",
  "Возврат покупателю",
  "Банковская комиссия",
  "Налоговый платёж",
  "Снятие наличных",
  "Перевод физлицу",
  "Получение кредита",
  "Погашение кредита",
  "Неопределённая операция",
] as const

export type ImportOperationType = (typeof IMPORT_OPERATION_TYPES)[number]

export type ApiImportOperationTypeCode =
  | "income"
  | "expense"
  | "transfer"
  | "supplier_refund"
  | "customer_refund"
  | "bank_fee"
  | "tax_payment"
  | "loan_received"
  | "loan_repayment"
  | "cash_withdrawal"
  | "individual_transfer"
  | "undefined"

export const IMPORT_OPERATION_TYPE_TO_API_CODE: Record<
  ImportOperationType,
  ApiImportOperationTypeCode
> = {
  Доход: "income",
  Расход: "expense",
  "Личный расход": "expense",
  "Перевод между собственными счетами": "transfer",
  "Возврат от поставщика": "supplier_refund",
  "Возврат покупателю": "customer_refund",
  "Банковская комиссия": "bank_fee",
  "Налоговый платёж": "tax_payment",
  "Снятие наличных": "cash_withdrawal",
  "Перевод физлицу": "individual_transfer",
  "Получение кредита": "loan_received",
  "Погашение кредита": "loan_repayment",
  "Неопределённая операция": "undefined",
}

export const API_CODE_TO_IMPORT_OPERATION_TYPE: Record<
  ApiImportOperationTypeCode,
  ImportOperationType
> = {
  income: "Доход",
  expense: "Расход",
  transfer: "Перевод между собственными счетами",
  supplier_refund: "Возврат от поставщика",
  customer_refund: "Возврат покупателю",
  bank_fee: "Банковская комиссия",
  tax_payment: "Налоговый платёж",
  cash_withdrawal: "Снятие наличных",
  individual_transfer: "Перевод физлицу",
  loan_received: "Получение кредита",
  loan_repayment: "Погашение кредита",
  undefined: "Неопределённая операция",
}

export const OWNERSHIP_OPTIONS = ["Бизнес", "Личное", "Неопределённое"] as const

export type OwnershipStatus = (typeof OWNERSHIP_OPTIONS)[number]

export type ApiOwnershipCode = "business" | "personal" | "undefined"

export const OWNERSHIP_TO_API_CODE: Record<OwnershipStatus, ApiOwnershipCode> = {
  Бизнес: "business",
  Личное: "personal",
  Неопределённое: "undefined",
}

export const API_CODE_TO_OWNERSHIP: Record<ApiOwnershipCode, OwnershipStatus> = {
  business: "Бизнес",
  personal: "Личное",
  undefined: "Неопределённое",
}

export type ImportedOperationStatus = "review" | "confirmed" | "excluded"

export type ImportQuickFilter = "all" | "review" | "confirmed" | "duplicates" | "excluded"

export type ConfidenceLevel = "high" | "medium" | "low"

export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 85) return "high"
  if (confidence >= 60) return "medium"
  return "low"
}

export type SuggestedField = "type" | "category" | "project" | "ownership"

export type SuggestionSource = "rule" | "dictionary" | "history" | "llm"

export interface FieldSuggestion {
  value: string
  confidence: number
  level: ConfidenceLevel
  reason: string
  source: SuggestionSource
}

export interface DuplicateSnapshot {
  date: string
  counterparty: string
  purpose: string
  amount: number
  category?: string
  project?: string
}

export interface DuplicateInfo {
  kind: "exact" | "possible"
  source: "in_file" | "in_ledger"
  matchedOperationId?: string
  matchedSnapshot?: DuplicateSnapshot
  reason: string
  resolved?: "kept" | "skipped"
}

export interface ManualCorrection {
  field: SuggestedField | "datePeriod" | "paidByPersonalFunds"
  originalValue: string
  newValue: string
  correctedAt: string
}

export type MissingDataField = "date" | "amount" | "counterparty" | "purpose"

export type AmountKind = "income" | "expense" | "transfer"

export interface ImportedOperation {
  id: string
  batchId: string
  accountId: string
  externalId?: string
  duplicateHash: string
  dateFact: string
  datePeriod: string
  counterparty: string
  purpose: string
  amount: number
  currency: "RUB"
  direction: "credit" | "debit"
  amountKind: AmountKind
  type: ImportOperationType
  category: string
  project: string
  ownership: OwnershipStatus
  paidByPersonalFunds: boolean
  suggestions: Partial<Record<SuggestedField, FieldSuggestion>>
  duplicate?: DuplicateInfo
  missingFields: MissingDataField[]
  reviewReasons: string[]
  status: ImportedOperationStatus
  corrections: ManualCorrection[]
  importedToLedger?: boolean
}

export interface ImportBatchSummary {
  totalFound: number
  recognizedCount: number
  exactDuplicatesCount: number
  possibleDuplicatesCount: number
  missingDataCount: number
  unclassifiedCount: number
  detectedPeriodStart?: string
  detectedPeriodEnd?: string
}

export interface ImportBatch {
  id: string
  fileName: string
  fileSize: number
  fileFormat: "csv" | "xlsx"
  accountId: string
  accountName: string
  accountType: BankAccountType
  periodStart: string
  periodEnd: string
  uploadedAt: string
  sourceMode: "api" | "local_csv" | "demo_preview"
  summary: ImportBatchSummary
  operations: ImportedOperation[]
}

export interface ImportConfirmResult {
  importedToLedger: number
  confirmedNonReportable: number
  skippedDuplicates: number
  unclassifiedCount: number
  pendingReviewCount: number
  excludedCount: number
  savedCorrectionsCount: number
}

export interface LedgerOperationInput {
  id: string
  type: "income" | "expense" | "tax"
  category: string
  project: string
  date: string
  periodDate: string
  comment: string
  amount: number
  paidByPersonalFunds?: boolean
}

export interface ExistingLedgerOperation {
  id: string
  type: "income" | "expense" | "tax"
  category: string
  project: string
  date: string
  periodDate: string
  comment: string
  amount: number
  paidByPersonalFunds?: boolean
}

export interface ImportCategoryBuckets {
  expenses: Array<{ id: string; name: string; active: boolean }>
  income: Array<{ id: string; name: string; active: boolean }>
  taxes: Array<{ id: string; name: string; active: boolean }>
}

export interface ImportProjectOption {
  id: string
  name: string
  archived: boolean
}

export const DEFAULT_FALLBACK_CATEGORIES: string[] = [
  "Аренда",
  "Коммуналка",
  "Интернет",
  "Закупка товаров",
  "Упаковка",
  "Логистика и доставка",
  "Реклама",
  "Банковские комиссии",
  "Налоги",
  "Подписки и сервисы",
  "Прочие расходы",
  "Продажи",
  "Авансы",
  "Прочие поступления",
  "Неопределённое",
]

const NON_REPORTABLE_TYPES = new Set<ImportOperationType>([
  "Личный расход",
  "Перевод между собственными счетами",
  "Снятие наличных",
  "Перевод физлицу",
  "Получение кредита",
  "Погашение кредита",
  "Неопределённая операция",
])

export function isUncertainValue(value: string): boolean {
  return value === "Неопределённое" || value === "Неопределённая операция"
}

export function isOperationUncertain(op: ImportedOperation): boolean {
  if (
    isUncertainValue(op.type) ||
    isUncertainValue(op.category) ||
    isUncertainValue(op.ownership) ||
    op.missingFields.length > 0
  ) {
    return true
  }

  const editedFields = new Set(op.corrections.map((correction) => correction.field))
  const suggestedFields: SuggestedField[] = ["type", "category", "project", "ownership"]
  return suggestedFields.some((field) => {
    if (editedFields.has(field)) return false
    const suggestion = op.suggestions[field]
    return suggestion !== undefined && suggestion.confidence < 60
  })
}

export function isHighConfidenceReady(op: ImportedOperation): boolean {
  if (op.status !== "review" || op.duplicate || isOperationUncertain(op)) {
    return false
  }
  if (op.missingFields.length > 0) return false
  if (op.type === "Снятие наличных" || op.type === "Перевод физлицу") {
    return false
  }
  const suggestions = Object.values(op.suggestions).filter(
    (item): item is FieldSuggestion => item !== undefined,
  )
  return suggestions.length > 0 && suggestions.every((item) => item.confidence >= 85)
}

export function mapImportedOperationToLedger(op: ImportedOperation): LedgerOperationInput | null {
  if (op.status !== "confirmed") return null
  if (op.ownership === "Личное") return null
  if (NON_REPORTABLE_TYPES.has(op.type)) return null

  const absAmount = Math.abs(op.amount)
  if (!Number.isFinite(absAmount) || absAmount <= 0) return null

  let ledgerType: "income" | "expense" | "tax"
  let signedAmount: number

  if (op.type === "Доход" || op.type === "Возврат от поставщика") {
    ledgerType = "income"
    signedAmount = absAmount
  } else if (op.type === "Налоговый платёж") {
    ledgerType = "tax"
    signedAmount = -absAmount
  } else {
    ledgerType = "expense"
    signedAmount = -absAmount
  }

  const comment = [op.counterparty, op.purpose]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" — ")
    .slice(0, 255)

  return {
    id: `imp-${op.id}-${Date.now()}`,
    type: ledgerType,
    category: isUncertainValue(op.category) ? "Без категории" : op.category,
    project: op.project === "Без проекта" ? "" : op.project,
    date: op.dateFact,
    periodDate: op.datePeriod || op.dateFact,
    comment: comment || op.type,
    amount: signedAmount,
    ...(op.paidByPersonalFunds ? { paidByPersonalFunds: true } : {}),
  }
}

export function uiDateToIso(ddmmyyyy: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ddmmyyyy.trim())
  if (!match) return ""
  const [, day, month, year] = match
  return `${year}-${month}-${day}`
}

export function isoToUiDate(yyyymmdd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(yyyymmdd.trim())
  if (!match) return ""
  const [, year, month, day] = match
  return `${day}.${month}.${year}`
}

const currencyFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatRuCurrency(amount: number): string {
  return `${currencyFormatter.format(amount).replace(/[\u00a0\u202f]/g, " ")} ₽`
}

export function formatOperationCount(count: number): string {
  const lastTwoDigits = count % 100
  const lastDigit = count % 10
  const word =
    lastTwoDigits >= 11 && lastTwoDigits <= 14
      ? "операций"
      : lastDigit === 1
        ? "операция"
        : lastDigit >= 2 && lastDigit <= 4
          ? "операции"
          : "операций"
  return `${count} ${word}`
}
