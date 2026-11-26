import { apiRequest } from "./client"
import { API_ENDPOINTS } from "./endpoints"
import {
  buildSampleBatchForOfflineXlsx,
  computeBatchSummary,
  parseLocalCsvBatch,
} from "../services/statementParser"
import {
  API_CODE_TO_IMPORT_OPERATION_TYPE,
  API_CODE_TO_OWNERSHIP,
  DEFAULT_BANK_ACCOUNTS,
  IMPORT_OPERATION_TYPE_TO_API_CODE,
  OWNERSHIP_TO_API_CODE,
  getConfidenceLevel,
  isOperationUncertain,
  isUncertainValue,
  isoToUiDate,
  mapImportedOperationToLedger,
  uiDateToIso,
  type ApiImportOperationTypeCode,
  type ApiOwnershipCode,
  type BankAccount,
  type DuplicateInfo,
  type ExistingLedgerOperation,
  type FieldSuggestion,
  type ImportBatch,
  type ImportCategoryBuckets,
  type ImportConfirmResult,
  type ImportOperationType,
  type ImportProjectOption,
  type ImportedOperation,
  type ImportedOperationStatus,
  type ManualCorrection,
  type MissingDataField,
  type OwnershipStatus,
  type SuggestedField,
} from "../types/import"

export interface BackendSuggestionDto {
  id?: number
  operation_type: string | null
  category_id: string | number | null
  project_id: string | number | null
  business_status: string | null
  confidence: number | null
  reason: string | null
  user_decision?: "approved" | "rejected" | "needs_review" | null
}

export interface BackendUploadTransactionItemDto {
  imported_transaction_id: number
  status: string
  is_duplicate: "none" | "exact" | "possible" | string
  validation_error: string | null
  suggestion: BackendSuggestionDto | null
}

export interface BackendUploadResponse {
  batch_id: number
  filename: string
  file_format: string
  status: string
  total_rows: number
  valid_rows: number
  invalid_rows: number
  exact_duplicates: number
  possible_duplicates: number
  transactions: BackendUploadTransactionItemDto[]
}

export interface BackendBatchTransactionDto {
  id: number
  account_id: string | null
  external_id: string | null
  transaction_date: string | null
  date_fact: string | null
  date_period: string | null
  amount: number | null
  direction: string | null
  currency: string | null
  description: string | null
  counterparty: string | null
  operation_type: string | null
  status: string
  validation_error: string | null
  is_duplicate: "none" | "exact" | "possible" | string
  confirmed_at: string | null
  suggestion: BackendSuggestionDto | null
}

export interface BackendBatchPreviewResponse {
  batch_id: number
  user_id: number | null
  account_id: string | null
  filename: string
  file_format: string
  status: string
  period_start: string | null
  period_end: string | null
  created_at: string
  transactions: BackendBatchTransactionDto[]
}

export interface BackendTransactionUpdatePayload {
  transaction_date?: string
  date_fact?: string
  date_period?: string
  amount?: number
  direction?: string
  currency?: string
  description?: string
  counterparty?: string
  operation_type?: ApiImportOperationTypeCode | string
  category_id?: number | string
  project_id?: number | string
  business_status?: ApiOwnershipCode
  user_decision?: "approved" | "rejected" | "needs_review"
  status?: string
}

export interface BackendConfirmBatchPayload {
  transaction_ids?: number[]
}

export interface BackendConfirmBatchResponse {
  batch_id: number
  status: string
  confirmed_count: number
  skipped_count: number
}

export interface ImportDirectoryLookup {
  projects?: ImportProjectOption[]
  categories?: ImportCategoryBuckets
}

export interface OperationUpdatePatch {
  type?: ImportOperationType
  category?: string
  project?: string
  ownership?: OwnershipStatus
  datePeriod?: string
  paidByPersonalFunds?: boolean
  amountKind?: ImportedOperation["amountKind"]
  status?: ImportedOperationStatus
  duplicate?: DuplicateInfo
  corrections?: ManualCorrection[]
}

export interface UploadStatementParams {
  file: File
  account?: BankAccount
  periodStart?: string
  periodEnd?: string
  userId?: number
  projects: ImportProjectOption[]
  categories: ImportCategoryBuckets
  existingOperations: ExistingLedgerOperation[]
  signal?: AbortSignal
}

const LEGACY_UPPERCASE_OPERATION_TYPES: Record<string, ImportOperationType> = {
  BUSINESS_INCOME: "Доход",
  BUSINESS_EXPENSE: "Расход",
  PERSONAL_EXPENSE: "Личный расход",
  INTERNAL_TRANSFER: "Перевод между собственными счетами",
  SUPPLIER_REFUND: "Возврат от поставщика",
  CUSTOMER_REFUND: "Возврат покупателю",
  BANK_FEE: "Банковская комиссия",
  TAX_PAYMENT: "Налоговый платёж",
  CASH_WITHDRAWAL: "Снятие наличных",
  INDIVIDUAL_TRANSFER: "Перевод физлицу",
  LOAN_RECEIPT: "Получение кредита",
  LOAN_REPAYMENT: "Погашение кредита",
  UNDEFINED: "Неопределённая операция",
}

const LEGACY_UPPERCASE_OWNERSHIP: Record<string, OwnershipStatus> = {
  BUSINESS: "Бизнес",
  PERSONAL: "Личное",
  UNKNOWN: "Неопределённое",
}

const SYNTHETIC_CATEGORY_RE = /^Категория #(\d+)$/
const SYNTHETIC_PROJECT_RE = /^Проект #(\d+)$/

export function isRemoteImportEnabled(): boolean {
  return (
    typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_USE_IMPORT_API === "true"
  )
}

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : undefined
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed)
      return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
    }
  }
  return undefined
}

function normalizeLookupToken(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").trim()
}

function flattenCategoryItems(categories?: ImportCategoryBuckets) {
  if (!categories) return []
  return [...categories.expenses, ...categories.income, ...categories.taxes]
}

/**
 * Resolves the active user ID for statement uploads from an explicit argument,
 * stored JWT payload (`sub` or `user_id`), or `VITE_DEFAULT_USER_ID`.
 */
export function resolveCurrentUserId(explicitUserId?: number): number | undefined {
  const explicit = parsePositiveInt(explicitUserId)
  if (explicit !== undefined) return explicit

  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("token")
    if (token) {
      const segments = token.split(".")
      if (segments.length >= 2 && segments[1]) {
        try {
          const base64 = segments[1].replace(/-/g, "+").replace(/_/g, "/")
          const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
          const payload = JSON.parse(atob(padded)) as { sub?: unknown; user_id?: unknown }
          const fromJwt = parsePositiveInt(payload.sub) ?? parsePositiveInt(payload.user_id)
          if (fromJwt !== undefined) return fromJwt
        } catch {
          // Ignore malformed tokens so uploads still proceed gracefully.
        }
      }
    }
  }

  if (typeof import.meta !== "undefined") {
    return parsePositiveInt(import.meta.env?.VITE_DEFAULT_USER_ID)
  }

  return undefined
}

export function normalizeConfidencePercent(raw: number | null | undefined): number {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return 0
  const scaled = raw <= 1 ? raw * 100 : raw
  return Math.max(0, Math.min(100, Math.round(scaled)))
}

export function inferSuggestionSource(
  reason: string | null | undefined,
): FieldSuggestion["source"] {
  const norm = (reason ?? "").toLowerCase().replace(/ё/g, "е")
  if (norm.includes("подтвержден") || norm.includes("истор")) {
    return "history"
  }
  if (
    (norm.includes("правил") ||
      norm.includes("справочник") ||
      norm.includes("направлени")) &&
    !norm.includes("gigachat") &&
    !norm.includes("ии") &&
    !norm.includes("llm") &&
    !norm.includes("проект")
  ) {
    return "rule"
  }
  return "llm"
}

export function resolveCategoryDisplayName(
  rawCategoryId: string | number | null | undefined,
  categories: ImportCategoryBuckets,
): string {
  if (rawCategoryId === null || rawCategoryId === undefined) return "Неопределённое"
  const key = String(rawCategoryId).trim()
  if (!key) return "Неопределённое"

  const normKey = normalizeLookupToken(key)
  const matched = flattenCategoryItems(categories).find(
    (item) => item.id === key || normalizeLookupToken(item.name) === normKey,
  )
  if (matched) return matched.name
  if (/^\d+$/.test(key)) return `Категория #${key}`
  return key
}

export function resolveProjectDisplayName(
  rawProjectId: string | number | null | undefined,
  projects: ImportProjectOption[],
): string {
  if (rawProjectId === null || rawProjectId === undefined) return "Без проекта"
  const key = String(rawProjectId).trim()
  if (!key) return "Без проекта"

  const normKey = normalizeLookupToken(key)
  const matched = projects.find(
    (item) => item.id === key || normalizeLookupToken(item.name) === normKey,
  )
  if (matched) return matched.name
  if (/^\d+$/.test(key)) return `Проект #${key}`
  return key
}

export function resolveBackendCategoryRef(
  rawValue: string | undefined,
  categories?: ImportCategoryBuckets,
): number | string | undefined {
  if (rawValue === undefined) return undefined
  const clean = rawValue.trim()
  if (!clean || clean === "Неопределённое") return undefined

  const syntheticMatch = SYNTHETIC_CATEGORY_RE.exec(clean)
  if (syntheticMatch) return Number(syntheticMatch[1])
  if (/^\d+$/.test(clean)) return Number(clean)

  const normClean = normalizeLookupToken(clean)
  const matched = flattenCategoryItems(categories).find(
    (item) => normalizeLookupToken(item.name) === normClean,
  )
  if (matched && /^\d+$/.test(matched.id.trim())) {
    return Number(matched.id.trim())
  }
  return clean
}

export function resolveBackendProjectRef(
  rawValue: string | undefined,
  projects?: ImportProjectOption[],
): number | string | undefined {
  if (rawValue === undefined) return undefined
  const clean = rawValue.trim()
  if (!clean || clean === "Без проекта") return undefined

  const syntheticMatch = SYNTHETIC_PROJECT_RE.exec(clean)
  if (syntheticMatch) return Number(syntheticMatch[1])
  if (/^\d+$/.test(clean)) return Number(clean)

  const normClean = normalizeLookupToken(clean)
  const matched = (projects ?? []).find(
    (item) => normalizeLookupToken(item.name) === normClean,
  )
  if (matched && /^\d+$/.test(matched.id.trim())) {
    return Number(matched.id.trim())
  }
  return clean
}

function mapBackendOwnership(raw: string | null | undefined): OwnershipStatus {
  const clean = (raw ?? "").trim()
  if (!clean) return "Неопределённое"
  if (clean in API_CODE_TO_OWNERSHIP) {
    return API_CODE_TO_OWNERSHIP[clean as ApiOwnershipCode]
  }
  if (clean in LEGACY_UPPERCASE_OWNERSHIP) {
    return LEGACY_UPPERCASE_OWNERSHIP[clean]
  }
  if (clean === "Бизнес" || clean === "Личное" || clean === "Неопределённое") {
    return clean
  }
  return "Неопределённое"
}

function mapBackendOperationType(
  rawOp: string | null | undefined,
  ownership: OwnershipStatus,
): ImportOperationType {
  const clean = (rawOp ?? "").trim()
  if (!clean) return "Неопределённая операция"
  if (clean === "expense" && ownership === "Личное") {
    return "Личный расход"
  }
  if (clean in API_CODE_TO_IMPORT_OPERATION_TYPE) {
    return API_CODE_TO_IMPORT_OPERATION_TYPE[clean as ApiImportOperationTypeCode]
  }
  if (clean in LEGACY_UPPERCASE_OPERATION_TYPES) {
    return LEGACY_UPPERCASE_OPERATION_TYPES[clean]
  }
  if (clean in IMPORT_OPERATION_TYPE_TO_API_CODE) {
    return clean as ImportOperationType
  }
  return "Неопределённая операция"
}

function mapStatusFromBackend(
  rawStatus: string,
  userDecision?: "approved" | "rejected" | "needs_review" | null,
): ImportedOperationStatus {
  if (rawStatus === "excluded" || userDecision === "rejected") {
    return "excluded"
  }
  if (rawStatus === "confirmed" || userDecision === "approved") {
    return "confirmed"
  }
  return "review"
}

function buildFieldSuggestion(
  value: string,
  confidence: number,
  reason: string,
  source: FieldSuggestion["source"],
): FieldSuggestion {
  return {
    value,
    confidence,
    level: getConfidenceLevel(confidence),
    reason,
    source,
  }
}

function buildBackendDuplicateInfo(
  tx: BackendBatchTransactionDto,
  uiDateFact: string,
  numericAmount: number,
  direction: "credit" | "debit",
  counterparty: string,
  earlierOps: ImportedOperation[],
  existingOperations: ExistingLedgerOperation[],
): DuplicateInfo | undefined {
  if (tx.is_duplicate !== "exact" && tx.is_duplicate !== "possible") {
    return undefined
  }

  const kind: DuplicateInfo["kind"] = tx.is_duplicate
  const normCounterparty = normalizeLookupToken(counterparty)

  const inFileMatch = earlierOps.find((candidate) => {
    if (
      tx.external_id &&
      candidate.externalId &&
      candidate.externalId.trim() === tx.external_id.trim()
    ) {
      return true
    }
    const sameBase =
      candidate.dateFact === uiDateFact &&
      Math.abs(candidate.amount - numericAmount) <= 0.01 &&
      candidate.direction === direction
    if (!sameBase) return false
    return kind === "possible" || normalizeLookupToken(candidate.counterparty) === normCounterparty
  })

  if (inFileMatch) {
    return {
      kind,
      source: "in_file",
      matchedOperationId: inFileMatch.id,
      matchedSnapshot: {
        date: inFileMatch.dateFact,
        counterparty: inFileMatch.counterparty,
        purpose: inFileMatch.purpose,
        amount: inFileMatch.amount,
      },
      reason:
        kind === "exact"
          ? "Точный дубликат операции в загруженной выписке"
          : "Похожая операция в загруженной выписке на ту же дату и сумму",
    }
  }

  const ledgerMatch = existingOperations.find((existing) => {
    const sameDirection =
      (existing.type === "income" && direction === "credit") ||
      (existing.type !== "income" && direction === "debit")
    return (
      sameDirection &&
      existing.date === uiDateFact &&
      Math.abs(Math.abs(existing.amount) - numericAmount) <= 0.01
    )
  })

  return {
    kind,
    source: "in_ledger",
    matchedOperationId: ledgerMatch?.id,
    matchedSnapshot: ledgerMatch
      ? {
          date: ledgerMatch.date,
          counterparty: ledgerMatch.comment.split(" — ")[0] || ledgerMatch.category,
          purpose: ledgerMatch.comment,
          amount: Math.abs(ledgerMatch.amount),
          category: ledgerMatch.category,
          project: ledgerMatch.project,
        }
      : undefined,
    reason:
      kind === "exact"
        ? "Операция с такими реквизитами уже зарегистрирована на сервере"
        : "На сервере найдена похожая операция на ту же дату и сумму",
  }
}

export interface MapBackendBatchOptions {
  fileSize?: number
  account?: BankAccount
  projects: ImportProjectOption[]
  categories: ImportCategoryBuckets
  existingOperations?: ExistingLedgerOperation[]
}

/**
 * Converts a `GET /api/import/batches/{batch_id}` payload into the UI `ImportBatch` model.
 */
export function mapBackendBatchPreviewToDomain(
  preview: BackendBatchPreviewResponse,
  options: MapBackendBatchOptions,
): ImportBatch {
  const resolvedAccount =
    options.account ??
    DEFAULT_BANK_ACCOUNTS.find((candidate) => candidate.id === preview.account_id) ??
    DEFAULT_BANK_ACCOUNTS[0]
  const batchId = String(preview.batch_id)
  const operations: ImportedOperation[] = []

  for (const tx of preview.transactions) {
    const sug = tx.suggestion
    const mappedOwnership = mapBackendOwnership(sug?.business_status)
    const mappedType = mapBackendOperationType(
      sug?.operation_type ?? tx.operation_type,
      mappedOwnership,
    )

    const resolvedCategory = resolveCategoryDisplayName(sug?.category_id, options.categories)
    const resolvedProject = resolveProjectDisplayName(sug?.project_id, options.projects)

    const rawDir = (tx.direction ?? "").toLowerCase()
    const direction: "credit" | "debit" =
      rawDir === "income" || rawDir === "credit" ? "credit" : "debit"
    const amountKind: ImportedOperation["amountKind"] =
      mappedType === "Перевод между собственными счетами"
        ? "transfer"
        : direction === "credit"
          ? "income"
          : "expense"

    const rawDateFact = tx.date_fact ?? tx.transaction_date ?? ""
    const uiDateFact =
      (rawDateFact ? isoToUiDate(rawDateFact) || rawDateFact : "") || "Дата не указана"
    const rawDatePeriod = tx.date_period ?? ""
    const uiDatePeriod =
      (rawDatePeriod ? isoToUiDate(rawDatePeriod) || rawDatePeriod : "") || uiDateFact

    const counterparty = tx.counterparty?.trim() || "Контрагент не указан"
    const purpose = tx.description?.trim() || "Назначение не указано"
    const numericAmount =
      tx.amount !== null && tx.amount !== undefined && Number.isFinite(tx.amount)
        ? Math.abs(tx.amount)
        : 0

    const missingFields: MissingDataField[] = []
    if (!rawDateFact) missingFields.push("date")
    if (tx.amount === null || tx.amount === undefined || !Number.isFinite(tx.amount) || numericAmount === 0) {
      missingFields.push("amount")
    }
    if (!tx.counterparty?.trim()) missingFields.push("counterparty")
    if (!tx.description?.trim()) missingFields.push("purpose")

    const duplicate = buildBackendDuplicateInfo(
      tx,
      uiDateFact,
      numericAmount,
      direction,
      counterparty,
      operations,
      options.existingOperations ?? [],
    )

    const suggestions: Partial<Record<SuggestedField, FieldSuggestion>> = {}
    if (sug) {
      const confidence = normalizeConfidencePercent(sug.confidence)
      const reason = sug.reason?.trim() || "Классифицировано сервером"
      const source = inferSuggestionSource(reason)

      suggestions.type = buildFieldSuggestion(
        mappedType,
        mappedType === "Неопределённая операция" ? Math.min(confidence, 45) : confidence,
        reason,
        source,
      )
      suggestions.ownership = buildFieldSuggestion(
        mappedOwnership,
        mappedOwnership === "Неопределённое" ? Math.min(confidence, 45) : confidence,
        reason,
        source,
      )

      const hasCategoryId =
        sug.category_id !== null &&
        sug.category_id !== undefined &&
        String(sug.category_id).trim() !== ""
      suggestions.category = hasCategoryId
        ? buildFieldSuggestion(resolvedCategory, confidence, reason, source)
        : buildFieldSuggestion(
            "Неопределённое",
            0,
            "Категория не определена автоматически — выберите вручную",
            source,
          )

      const hasProjectId =
        sug.project_id !== null &&
        sug.project_id !== undefined &&
        String(sug.project_id).trim() !== ""
      if (hasProjectId) {
        suggestions.project = buildFieldSuggestion(resolvedProject, confidence, reason, source)
      }
    }

    const reviewReasons: string[] = []
    if (tx.validation_error?.trim()) {
      reviewReasons.push(tx.validation_error.trim())
    }
    if (duplicate && !reviewReasons.includes(duplicate.reason)) {
      reviewReasons.push(duplicate.reason)
    }
    const isUncertainRow =
      isUncertainValue(mappedType) ||
      isUncertainValue(resolvedCategory) ||
      isUncertainValue(mappedOwnership) ||
      missingFields.length > 0
    if (isUncertainRow && sug?.reason?.trim()) {
      const sugReason = sug.reason.trim()
      if (!reviewReasons.includes(sugReason)) {
        reviewReasons.push(sugReason)
      }
    }

    const accountId = tx.account_id || preview.account_id || resolvedAccount.id
    const duplicateHash = [
      accountId,
      uiDateFact,
      numericAmount.toFixed(2),
      direction,
      normalizeLookupToken(counterparty),
      normalizeLookupToken(purpose),
    ].join("|")

    operations.push({
      id: String(tx.id),
      batchId,
      accountId,
      externalId: tx.external_id ?? undefined,
      duplicateHash,
      dateFact: uiDateFact,
      datePeriod: uiDatePeriod,
      counterparty,
      purpose,
      amount: numericAmount,
      currency: "RUB",
      direction,
      amountKind,
      type: mappedType,
      category: resolvedCategory,
      project: resolvedProject,
      ownership: mappedOwnership,
      paidByPersonalFunds: false,
      suggestions,
      duplicate,
      missingFields,
      reviewReasons,
      status: mapStatusFromBackend(tx.status, sug?.user_decision),
      corrections: [],
      importedToLedger: Boolean(tx.confirmed_at),
    })
  }

  const summary = computeBatchSummary(operations)

  return {
    id: batchId,
    fileName: preview.filename,
    fileSize: options.fileSize ?? 0,
    fileFormat: preview.file_format === "xlsx" ? "xlsx" : "csv",
    accountId: preview.account_id || resolvedAccount.id,
    accountName: resolvedAccount.name,
    accountType: resolvedAccount.accountType,
    periodStart: preview.period_start || summary.detectedPeriodStart || "",
    periodEnd: preview.period_end || summary.detectedPeriodEnd || "",
    uploadedAt: preview.created_at || new Date().toISOString(),
    sourceMode: "api",
    summary,
    operations,
  }
}

export function mapPatchToApiPayload(
  patch: OperationUpdatePatch,
  lookup?: ImportDirectoryLookup,
): BackendTransactionUpdatePayload {
  const payload: BackendTransactionUpdatePayload = {}

  if (patch.type !== undefined) {
    payload.operation_type = IMPORT_OPERATION_TYPE_TO_API_CODE[patch.type]
    if (patch.type === "Личный расход" && patch.ownership === undefined) {
      payload.business_status = "personal"
    }
  }
  if (patch.category !== undefined) {
    const resolvedCategory = resolveBackendCategoryRef(patch.category, lookup?.categories)
    if (resolvedCategory !== undefined) {
      payload.category_id = resolvedCategory
    }
  }
  if (patch.project !== undefined) {
    const resolvedProject = resolveBackendProjectRef(patch.project, lookup?.projects)
    if (resolvedProject !== undefined) {
      payload.project_id = resolvedProject
    }
  }
  if (patch.ownership !== undefined) {
    payload.business_status = OWNERSHIP_TO_API_CODE[patch.ownership]
  }
  if (patch.datePeriod !== undefined) {
    payload.date_period = uiDateToIso(patch.datePeriod) || patch.datePeriod
  }
  if (patch.status !== undefined) {
    if (patch.status === "confirmed") {
      payload.user_decision = "approved"
    } else if (patch.status === "excluded") {
      payload.user_decision = "rejected"
      payload.status = "excluded"
    } else {
      payload.user_decision = "needs_review"
      payload.status = "pending_review"
    }
  }
  if ("duplicate" in patch && patch.duplicate === undefined) {
    payload.status = "pending_review"
    payload.user_decision = "needs_review"
  }

  return payload
}

export const importApi = {
  async uploadStatement(params: UploadStatementParams): Promise<ImportBatch> {
    if (isRemoteImportEnabled()) {
      const formData = new FormData()
      formData.append("file", params.file)
      formData.append("default_currency", "RUB")

      const userId = resolveCurrentUserId(params.userId)
      if (userId !== undefined) {
        formData.append("user_id", String(userId))
      }
      if (params.account?.id) {
        formData.append("account_id", params.account.id)
      }

      const uploaded = await apiRequest<BackendUploadResponse>(API_ENDPOINTS.importUpload, {
        method: "POST",
        body: formData,
        signal: params.signal,
      })

      const preview = await apiRequest<BackendBatchPreviewResponse>(
        `${API_ENDPOINTS.importBatches}/${uploaded.batch_id}`,
        {
          method: "GET",
          signal: params.signal,
        },
      )

      return mapBackendBatchPreviewToDomain(preview, {
        fileSize: params.file.size,
        account: params.account,
        projects: params.projects,
        categories: params.categories,
        existingOperations: params.existingOperations,
      })
    }

    const account = params.account ?? DEFAULT_BANK_ACCOUNTS[0]
    const extension = params.file.name.split(".").pop()?.toLowerCase()
    if (extension === "csv") {
      return parseLocalCsvBatch({ ...params, account })
    }

    return buildSampleBatchForOfflineXlsx({ ...params, account })
  },

  async getBatchPreview(
    batchId: string,
    params: MapBackendBatchOptions & { signal?: AbortSignal },
  ): Promise<ImportBatch> {
    const preview = await apiRequest<BackendBatchPreviewResponse>(
      `${API_ENDPOINTS.importBatches}/${batchId}`,
      {
        method: "GET",
        signal: params.signal,
      },
    )
    return mapBackendBatchPreviewToDomain(preview, params)
  },

  async updateOperation(
    _batchId: string,
    operationId: string,
    patch: OperationUpdatePatch,
    lookup?: ImportDirectoryLookup,
  ): Promise<void> {
    if (!isRemoteImportEnabled()) return
    const payload = mapPatchToApiPayload(patch, lookup)
    if (Object.keys(payload).length === 0) return

    await apiRequest<unknown>(`${API_ENDPOINTS.importTransactions}/${operationId}`, {
      method: "PATCH",
      body: payload,
    })
  },

  async bulkUpdateOperations(
    batchId: string,
    ids: string[],
    patch: OperationUpdatePatch,
    lookup?: ImportDirectoryLookup,
  ): Promise<void> {
    if (!isRemoteImportEnabled() || ids.length === 0) return
    await Promise.all(
      ids.map((id) => importApi.updateOperation(batchId, id, patch, lookup)),
    )
  },

  async confirmBatch(
    batchId: string,
    params: {
      operations: ImportedOperation[]
      newlyConfirmedIds: string[]
      excludedIds: string[]
    },
  ): Promise<ImportConfirmResult> {
    const confirmedSet = new Set(params.newlyConfirmedIds)
    const newlyConfirmedOps = params.operations.filter((operation) =>
      confirmedSet.has(operation.id),
    )
    const importedToLedgerLocal = newlyConfirmedOps.filter(
      (operation) => mapImportedOperationToLedger(operation) !== null,
    ).length
    const localSkippedDuplicates = params.operations.filter(
      (operation) => operation.status === "excluded" && Boolean(operation.duplicate),
    ).length
    const unclassifiedCount = params.operations.filter(
      (operation) => operation.status !== "excluded" && isOperationUncertain(operation),
    ).length
    const pendingReviewCount = params.operations.filter(
      (operation) => operation.status === "review",
    ).length
    const excludedCount = params.operations.filter(
      (operation) => operation.status === "excluded",
    ).length
    const savedCorrectionsCount = params.operations.reduce(
      (sum, operation) => sum + operation.corrections.length,
      0,
    )

    if (isRemoteImportEnabled()) {
      const numericIds = params.newlyConfirmedIds
        .map((rawId) => Number(rawId))
        .filter((num) => Number.isInteger(num) && num > 0)
      const body: BackendConfirmBatchPayload | undefined =
        numericIds.length > 0 ? { transaction_ids: numericIds } : undefined

      const response = await apiRequest<BackendConfirmBatchResponse>(
        `${API_ENDPOINTS.importBatches}/${batchId}/confirm`,
        {
          method: "POST",
          ...(body ? { body } : {}),
        },
      )

      const totalConfirmed = Number.isFinite(response.confirmed_count)
        ? response.confirmed_count
        : newlyConfirmedOps.length
      const importedToLedger = Math.min(totalConfirmed, importedToLedgerLocal)
      const confirmedNonReportable = Math.max(0, totalConfirmed - importedToLedger)

      return {
        importedToLedger,
        confirmedNonReportable,
        skippedDuplicates:
          localSkippedDuplicates > 0
            ? localSkippedDuplicates
            : Number.isFinite(response.skipped_count)
              ? response.skipped_count
              : 0,
        unclassifiedCount,
        pendingReviewCount,
        excludedCount,
        savedCorrectionsCount,
      }
    }

    return {
      importedToLedger: importedToLedgerLocal,
      confirmedNonReportable: newlyConfirmedOps.length - importedToLedgerLocal,
      skippedDuplicates: localSkippedDuplicates,
      unclassifiedCount,
      pendingReviewCount,
      excludedCount,
      savedCorrectionsCount,
    }
  },
}
