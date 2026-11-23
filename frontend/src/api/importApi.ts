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
  isoToUiDate,
  mapImportedOperationToLedger,
  uiDateToIso,
  type ApiImportOperationTypeCode,
  type ApiOwnershipCode,
  type BankAccount,
  type BankAccountType,
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

export interface ApiFieldSuggestionDto {
  value: string
  confidence: number
  reason: string
  source?: "rule" | "dictionary" | "history" | "llm"
}

export interface ApiDuplicateDto {
  kind: "exact" | "possible"
  source: "in_file" | "in_ledger"
  matched_operation_id?: string
  matched_snapshot?: {
    date: string
    counterparty: string
    purpose: string
    amount: number
    category?: string
    project?: string
  }
  reason: string
  resolved?: "kept" | "skipped"
}

export interface ApiImportedTransactionDto {
  id: string
  import_batch_id: string
  account_id: string
  external_id?: string
  duplicate_hash: string
  transaction_date: string
  date_period?: string
  counterparty: string
  description: string
  amount: number
  currency: "RUB"
  direction: "credit" | "debit"
  operation_type: ApiImportOperationTypeCode | ImportOperationType
  category_id?: string
  category_name?: string
  project_id?: string
  project_name?: string
  business_status: ApiOwnershipCode | OwnershipStatus
  paid_by_personal_funds?: boolean
  suggestions?: Partial<Record<SuggestedField, ApiFieldSuggestionDto>>
  duplicate?: ApiDuplicateDto
  missing_fields?: MissingDataField[]
  review_reasons?: string[]
  status: ImportedOperationStatus
  imported_to_ledger?: boolean
}

export interface ApiImportBatchResponse {
  id: string
  file_name: string
  file_size: number
  file_format: "csv" | "xlsx"
  account_id: string
  account_name: string
  account_type: BankAccountType
  period_start: string
  period_end: string
  uploaded_at: string
  transactions: ApiImportedTransactionDto[]
}

export interface ApiUpdateOperationPayload {
  operation_type?: ApiImportOperationTypeCode
  category_id?: string
  category_name?: string
  project_id?: string
  project_name?: string
  business_status?: ApiOwnershipCode
  date_period?: string
  paid_by_personal_funds?: boolean
  status?: ImportedOperationStatus
  duplicate_resolved?: "kept" | "skipped"
}

export interface ApiBulkUpdatePayload extends ApiUpdateOperationPayload {
  transaction_ids: string[]
}

export interface ApiConfirmBatchPayload {
  confirmed_ids: string[]
  excluded_ids: string[]
  corrections: Array<{
    transaction_id: string
    field: ManualCorrection["field"]
    original_value: string
    new_value: string
    corrected_at: string
  }>
}

export interface ApiConfirmBatchResponse {
  imported_to_ledger: number
  confirmed_non_reportable: number
  skipped_duplicates: number
  unclassified_count: number
  pending_review_count: number
  excluded_count: number
  saved_corrections_count: number
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
  projects: ImportProjectOption[]
  categories: ImportCategoryBuckets
  existingOperations: ExistingLedgerOperation[]
  signal?: AbortSignal
}

export function isRemoteImportEnabled(): boolean {
  return (
    typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_USE_IMPORT_API === "true"
  )
}

function normalizeSuggestion(dto?: ApiFieldSuggestionDto): FieldSuggestion | undefined {
  if (!dto) return undefined
  const confidence = Math.max(0, Math.min(100, Math.round(dto.confidence)))
  return {
    value: dto.value,
    confidence,
    level: getConfidenceLevel(confidence),
    reason: dto.reason,
    source: dto.source ?? "llm",
  }
}

function mapOperationType(
  raw: ApiImportOperationTypeCode | ImportOperationType,
): ImportOperationType {
  if (raw in API_CODE_TO_IMPORT_OPERATION_TYPE) {
    return API_CODE_TO_IMPORT_OPERATION_TYPE[raw as ApiImportOperationTypeCode]
  }
  return raw as ImportOperationType
}

function mapOwnership(raw: ApiOwnershipCode | OwnershipStatus): OwnershipStatus {
  if (raw in API_CODE_TO_OWNERSHIP) {
    return API_CODE_TO_OWNERSHIP[raw as ApiOwnershipCode]
  }
  return raw as OwnershipStatus
}

export function mapApiBatchToDomain(
  dto: ApiImportBatchResponse,
  projects: ImportProjectOption[],
  categories: ImportCategoryBuckets,
): ImportBatch {
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]))
  const allCategoryItems = [
    ...categories.expenses,
    ...categories.income,
    ...categories.taxes,
  ]
  const categoryNameById = new Map(allCategoryItems.map((category) => [category.id, category.name]))

  const operations: ImportedOperation[] = dto.transactions.map((tx) => {
    const mappedType = mapOperationType(tx.operation_type)
    const mappedOwnership = mapOwnership(tx.business_status)
    const resolvedCategory =
      tx.category_name ||
      (tx.category_id ? categoryNameById.get(tx.category_id) : undefined) ||
      "Неопределённое"
    const resolvedProject =
      tx.project_name ||
      (tx.project_id ? projectNameById.get(tx.project_id) : undefined) ||
      "Без проекта"
    const uiDateFact = isoToUiDate(tx.transaction_date) || tx.transaction_date
    const uiDatePeriod =
      (tx.date_period ? isoToUiDate(tx.date_period) || tx.date_period : "") || uiDateFact

    const suggestions: Partial<Record<SuggestedField, FieldSuggestion>> = {}
    if (tx.suggestions?.type) suggestions.type = normalizeSuggestion(tx.suggestions.type)
    if (tx.suggestions?.category) suggestions.category = normalizeSuggestion(tx.suggestions.category)
    if (tx.suggestions?.project) suggestions.project = normalizeSuggestion(tx.suggestions.project)
    if (tx.suggestions?.ownership) suggestions.ownership = normalizeSuggestion(tx.suggestions.ownership)

    const amountKind: ImportedOperation["amountKind"] =
      mappedType === "Перевод между собственными счетами"
        ? "transfer"
        : tx.direction === "credit"
          ? "income"
          : "expense"

    return {
      id: tx.id,
      batchId: tx.import_batch_id,
      accountId: tx.account_id,
      externalId: tx.external_id,
      duplicateHash: tx.duplicate_hash,
      dateFact: uiDateFact,
      datePeriod: uiDatePeriod,
      counterparty: tx.counterparty,
      purpose: tx.description,
      amount: Math.abs(tx.amount),
      currency: tx.currency,
      direction: tx.direction,
      amountKind,
      type: mappedType,
      category: resolvedCategory,
      project: resolvedProject,
      ownership: mappedOwnership,
      paidByPersonalFunds: Boolean(tx.paid_by_personal_funds),
      suggestions,
      duplicate: tx.duplicate
        ? {
            kind: tx.duplicate.kind,
            source: tx.duplicate.source,
            matchedOperationId: tx.duplicate.matched_operation_id,
            matchedSnapshot: tx.duplicate.matched_snapshot
              ? {
                  ...tx.duplicate.matched_snapshot,
                  date:
                    isoToUiDate(tx.duplicate.matched_snapshot.date) ||
                    tx.duplicate.matched_snapshot.date,
                }
              : undefined,
            reason: tx.duplicate.reason,
            resolved: tx.duplicate.resolved,
          }
        : undefined,
      missingFields: tx.missing_fields ?? [],
      reviewReasons: tx.review_reasons ?? [],
      status: tx.status,
      corrections: [],
      importedToLedger: tx.imported_to_ledger,
    }
  })

  const summary = computeBatchSummary(operations)

  return {
    id: dto.id,
    fileName: dto.file_name,
    fileSize: dto.file_size,
    fileFormat: dto.file_format,
    accountId: dto.account_id,
    accountName: dto.account_name,
    accountType: dto.account_type,
    periodStart: dto.period_start || summary.detectedPeriodStart || "",
    periodEnd: dto.period_end || summary.detectedPeriodEnd || "",
    uploadedAt: dto.uploaded_at,
    sourceMode: "api",
    summary,
    operations,
  }
}

export function mapPatchToApiPayload(patch: OperationUpdatePatch): ApiUpdateOperationPayload {
  const payload: ApiUpdateOperationPayload = {}
  if (patch.type !== undefined) {
    payload.operation_type = IMPORT_OPERATION_TYPE_TO_API_CODE[patch.type]
  }
  if (patch.category !== undefined) {
    payload.category_name = patch.category
  }
  if (patch.project !== undefined) {
    payload.project_name = patch.project
  }
  if (patch.ownership !== undefined) {
    payload.business_status = OWNERSHIP_TO_API_CODE[patch.ownership]
  }
  if (patch.datePeriod !== undefined) {
    payload.date_period = uiDateToIso(patch.datePeriod) || patch.datePeriod
  }
  if (patch.paidByPersonalFunds !== undefined) {
    payload.paid_by_personal_funds = patch.paidByPersonalFunds
  }
  if (patch.status !== undefined) {
    payload.status = patch.status
  }
  if (patch.duplicate === undefined && "duplicate" in patch) {
    payload.duplicate_resolved = "kept"
  }
  return payload
}

export function mapConfirmPayloadToApi(
  operations: ImportedOperation[],
  confirmedIds: string[],
  excludedIds: string[],
): ApiConfirmBatchPayload {
  const corrections = operations.flatMap((operation) =>
    operation.corrections.map((correction) => ({
      transaction_id: operation.id,
      field: correction.field,
      original_value: correction.originalValue,
      new_value: correction.newValue,
      corrected_at: correction.correctedAt,
    })),
  )

  return {
    confirmed_ids: confirmedIds,
    excluded_ids: excludedIds,
    corrections,
  }
}

export const importApi = {
  async uploadStatement(params: UploadStatementParams): Promise<ImportBatch> {
    const account = params.account ?? DEFAULT_BANK_ACCOUNTS[0]
    if (isRemoteImportEnabled()) {
      const formData = new FormData()
      formData.append("file", params.file)
      formData.append("account_id", account.id)
      formData.append("account_type", account.accountType)
      if (params.periodStart) formData.append("period_start", params.periodStart)
      if (params.periodEnd) formData.append("period_end", params.periodEnd)

      const response = await apiRequest<ApiImportBatchResponse>(API_ENDPOINTS.importUpload, {
        method: "POST",
        body: formData,
        signal: params.signal,
      })

      return mapApiBatchToDomain(response, params.projects, params.categories)
    }

    const extension = params.file.name.split(".").pop()?.toLowerCase()
    if (extension === "csv") {
      return parseLocalCsvBatch(params)
    }

    return buildSampleBatchForOfflineXlsx(params)
  },

  async updateOperation(
    batchId: string,
    operationId: string,
    patch: OperationUpdatePatch,
  ): Promise<void> {
    if (!isRemoteImportEnabled()) return
    await apiRequest<void>(`${API_ENDPOINTS.importBatches}/${batchId}/transactions/${operationId}`, {
      method: "PATCH",
      body: mapPatchToApiPayload(patch),
    })
  },

  async bulkUpdateOperations(
    batchId: string,
    ids: string[],
    patch: OperationUpdatePatch,
  ): Promise<void> {
    if (!isRemoteImportEnabled() || ids.length === 0) return
    const payload: ApiBulkUpdatePayload = {
      transaction_ids: ids,
      ...mapPatchToApiPayload(patch),
    }
    await apiRequest<void>(`${API_ENDPOINTS.importBatches}/${batchId}/transactions/bulk`, {
      method: "POST",
      body: payload,
    })
  },

  async confirmBatch(
    batchId: string,
    params: {
      operations: ImportedOperation[]
      newlyConfirmedIds: string[]
      excludedIds: string[]
    },
  ): Promise<ImportConfirmResult> {
    if (isRemoteImportEnabled()) {
      const response = await apiRequest<ApiConfirmBatchResponse>(
        `${API_ENDPOINTS.importBatches}/${batchId}/confirm`,
        {
          method: "POST",
          body: mapConfirmPayloadToApi(
            params.operations,
            params.newlyConfirmedIds,
            params.excludedIds,
          ),
        },
      )

      return {
        importedToLedger: response.imported_to_ledger,
        confirmedNonReportable: response.confirmed_non_reportable,
        skippedDuplicates: response.skipped_duplicates,
        unclassifiedCount: response.unclassified_count,
        pendingReviewCount: response.pending_review_count,
        excludedCount: response.excluded_count,
        savedCorrectionsCount: response.saved_corrections_count,
      }
    }

    const confirmedSet = new Set(params.newlyConfirmedIds)
    const newlyConfirmedOps = params.operations.filter((operation) =>
      confirmedSet.has(operation.id),
    )
    const importedToLedger = newlyConfirmedOps.filter(
      (operation) => mapImportedOperationToLedger(operation) !== null,
    ).length
    const confirmedNonReportable = newlyConfirmedOps.length - importedToLedger

    return {
      importedToLedger,
      confirmedNonReportable,
      skippedDuplicates: params.operations.filter(
        (operation) => operation.status === "excluded" && Boolean(operation.duplicate),
      ).length,
      unclassifiedCount: params.operations.filter(
        (operation) => operation.status !== "excluded" && isOperationUncertain(operation),
      ).length,
      pendingReviewCount: params.operations.filter((operation) => operation.status === "review")
        .length,
      excludedCount: params.operations.filter((operation) => operation.status === "excluded")
        .length,
      savedCorrectionsCount: params.operations.reduce(
        (sum, operation) => sum + operation.corrections.length,
        0,
      ),
    }
  },
}
