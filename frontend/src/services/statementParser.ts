import {
  DEFAULT_BANK_ACCOUNTS,
  DEFAULT_FALLBACK_CATEGORIES,
  getConfidenceLevel,
  isUncertainValue,
  uiDateToIso,
  type AmountKind,
  type BankAccount,
  type DuplicateInfo,
  type ExistingLedgerOperation,
  type FieldSuggestion,
  type ImportBatch,
  type ImportBatchSummary,
  type ImportCategoryBuckets,
  type ImportOperationType,
  type ImportProjectOption,
  type ImportedOperation,
  type MissingDataField,
  type OwnershipStatus,
} from "../types/import"

const MAX_STATEMENT_FILE_BYTES = 10 * 1024 * 1024

export interface RawStatementRow {
  rowIndex: number
  dateFact: string
  amount: number | null
  direction: "credit" | "debit"
  counterparty: string
  purpose: string
  externalId?: string
  currency: "RUB"
  missingFields: MissingDataField[]
}

export interface ClassificationContext {
  batchId: string
  account: BankAccount
  projects: ImportProjectOption[]
  categories: ImportCategoryBuckets
  existingOperations: ExistingLedgerOperation[]
}

export function validateStatementFile(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase()
  if (extension !== "csv" && extension !== "xlsx") {
    return "Этот формат не поддерживается. Выберите файл CSV или XLSX."
  }
  if (file.size === 0) {
    return "Файл пуст. Выберите выписку с операциями."
  }
  if (file.size > MAX_STATEMENT_FILE_BYTES) {
    return "Файл превышает 10 МБ. Загрузите выписку меньшего объёма."
  }
  return null
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function detectDelimiter(headerLine: string): ";" | "," | "\t" {
  const candidates: Array<";" | "," | "\t"> = [";", ",", "\t"]
  let bestDelimiter: ";" | "," | "\t" = ";"
  let bestCount = -1

  for (const candidate of candidates) {
    let count = 0
    let inQuotes = false
    for (let i = 0; i < headerLine.length; i += 1) {
      const char = headerLine[i]
      if (char === '"') inQuotes = !inQuotes
      else if (!inQuotes && char === candidate) count += 1
    }
    if (count > bestCount) {
      bestCount = count
      bestDelimiter = candidate
    }
  }

  return bestCount > 0 ? bestDelimiter : ";"
}

function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"'
        i += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        currentField += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      currentRow.push(currentField.trim())
      currentField = ""
    } else if (char === "\r" && nextChar === "\n") {
      currentRow.push(currentField.trim())
      if (currentRow.some((cell) => cell !== "")) rows.push(currentRow)
      currentRow = []
      currentField = ""
      i += 1
    } else if (char === "\n" || char === "\r") {
      currentRow.push(currentField.trim())
      if (currentRow.some((cell) => cell !== "")) rows.push(currentRow)
      currentRow = []
      currentField = ""
    } else {
      currentField += char
    }
  }

  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    if (currentRow.some((cell) => cell !== "")) rows.push(currentRow)
  }

  return rows
}

function isValidCalendarDate(day: number, month: number, year: number): boolean {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1) return false
  const candidate = new Date(year, month - 1, day)
  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day
  )
}

export function normalizeStatementDate(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""

  const dmyMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(trimmed)
  if (dmyMatch) {
    const day = Number(dmyMatch[1])
    const month = Number(dmyMatch[2])
    const year = Number(dmyMatch[3])
    if (!isValidCalendarDate(day, month, year)) return ""
    return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`
  }

  const ymdMatch = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/.exec(trimmed)
  if (ymdMatch) {
    const year = Number(ymdMatch[1])
    const month = Number(ymdMatch[2])
    const day = Number(ymdMatch[3])
    if (!isValidCalendarDate(day, month, year)) return ""
    return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`
  }

  return ""
}

export function normalizeStatementAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const isParenthesesNegative = /^\(.*\)$/.test(trimmed)
  const cleaned = trimmed
    .replace(/[\u00a0\u202f\s]/g, "")
    .replace(/[₽рубRUB()]/gi, "")
    .replace(/−/g, "-")

  if (!cleaned || cleaned === "-" || cleaned === "+") return null

  let normalized = cleaned
  const lastComma = cleaned.lastIndexOf(",")
  const lastDot = cleaned.lastIndexOf(".")

  if (lastComma > -1 && lastDot > -1) {
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "")
  } else if (lastComma > -1) {
    const decimals = cleaned.slice(lastComma + 1)
    normalized = decimals.length <= 2 ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "")
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return null
  return isParenthesesNegative ? -Math.abs(parsed) : parsed
}

interface ColumnMap {
  date: number
  amount: number
  debit: number
  credit: number
  direction: number
  counterparty: number
  purpose: number
  externalId: number
  currency: number
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalizedHeaders = headers.map(normalizeToken)
  for (const alias of aliases) {
    const exactIndex = normalizedHeaders.findIndex((header) => header === alias)
    if (exactIndex !== -1) return exactIndex
  }
  for (const alias of aliases) {
    const partialIndex = normalizedHeaders.findIndex((header) => header.includes(alias))
    if (partialIndex !== -1) return partialIndex
  }
  return -1
}

function buildColumnMap(headers: string[]): ColumnMap {
  return {
    date: findColumnIndex(headers, [
      "дата операции",
      "дата платежа",
      "дата списания",
      "дата",
      "transaction_date",
      "date_fact",
      "date",
    ]),
    amount: findColumnIndex(headers, ["сумма операции", "сумма платежа", "сумма", "amount", "sum"]),
    debit: findColumnIndex(headers, ["списание", "дебет", "расход", "debit"]),
    credit: findColumnIndex(headers, ["поступление", "кредит", "приход", "credit"]),
    direction: findColumnIndex(headers, ["направление", "вид операции", "тип операции", "direction"]),
    counterparty: findColumnIndex(headers, [
      "контрагент",
      "получатель",
      "плательщик",
      "наименование контрагента",
      "counterparty",
      "merchant",
    ]),
    purpose: findColumnIndex(headers, [
      "назначение платежа",
      "назначение",
      "описание",
      "комментарий",
      "детали платежа",
      "description",
      "purpose",
    ]),
    externalId: findColumnIndex(headers, [
      "идентификатор",
      "номер документа",
      "id операции",
      "external_id",
      "doc_id",
      "id",
    ]),
    currency: findColumnIndex(headers, ["валюта", "currency"]),
  }
}

export async function readCsvFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const utf8Text = new TextDecoder("utf-8").decode(buffer)
  if (!utf8Text.includes("\uFFFD")) {
    return utf8Text
  }
  try {
    return new TextDecoder("windows-1251").decode(buffer)
  } catch {
    return utf8Text
  }
}

export function parseCsvText(rawText: string): RawStatementRow[] {
  const text = rawText.replace(/^\uFEFF/, "").trim()
  if (!text) return []

  const firstLines = text.split(/\r?\n/).filter((line) => line.trim() !== "")
  if (firstLines.length < 2) return []

  const delimiter = detectDelimiter(firstLines[0])
  const allRows = parseCsvRows(text, delimiter)
  if (allRows.length < 2) return []

  let headerRowIndex = 0
  for (let i = 0; i < Math.min(allRows.length, 8); i += 1) {
    const candidateMap = buildColumnMap(allRows[i])
    if (
      candidateMap.date !== -1 &&
      (candidateMap.amount !== -1 || candidateMap.debit !== -1 || candidateMap.credit !== -1)
    ) {
      headerRowIndex = i
      break
    }
  }

  const columnMap = buildColumnMap(allRows[headerRowIndex])
  const hasKnownSchema =
    columnMap.date !== -1 ||
    columnMap.amount !== -1 ||
    columnMap.debit !== -1 ||
    columnMap.credit !== -1

  if (!hasKnownSchema) {
    throw new Error(
      "Не удалось распознать колонки выписки. Проверьте наличие столбцов «Дата», «Сумма» и «Назначение».",
    )
  }

  const parsedRows: RawStatementRow[] = []

  for (let rowIdx = headerRowIndex + 1; rowIdx < allRows.length; rowIdx += 1) {
    const cells = allRows[rowIdx]
    if (cells.every((cell) => cell === "")) continue

    const rawDate = columnMap.date !== -1 ? cells[columnMap.date] ?? "" : ""
    const dateFact = normalizeStatementDate(rawDate)

    const rawDirection = columnMap.direction !== -1 ? normalizeToken(cells[columnMap.direction] ?? "") : ""
    const rawAmount = columnMap.amount !== -1 ? normalizeStatementAmount(cells[columnMap.amount] ?? "") : null
    const rawDebit = columnMap.debit !== -1 ? normalizeStatementAmount(cells[columnMap.debit] ?? "") : null
    const rawCredit = columnMap.credit !== -1 ? normalizeStatementAmount(cells[columnMap.credit] ?? "") : null

    let signedAmount: number | null = rawAmount
    let direction: "credit" | "debit" = "debit"

    if (signedAmount !== null) {
      if (rawDirection) {
        const isCreditWord =
          rawDirection.includes("поступ") ||
          rawDirection.includes("приход") ||
          rawDirection.includes("доход") ||
          rawDirection.includes("credit") ||
          rawDirection === "+"
        const isDebitWord =
          rawDirection.includes("спис") ||
          rawDirection.includes("расход") ||
          rawDirection.includes("debit") ||
          rawDirection === "-"
        if (isCreditWord) direction = "credit"
        else if (isDebitWord) direction = "debit"
        else direction = signedAmount >= 0 ? "credit" : "debit"
      } else {
        direction = signedAmount >= 0 ? "credit" : "debit"
      }
    } else if (rawCredit !== null && Math.abs(rawCredit) > 0) {
      signedAmount = Math.abs(rawCredit)
      direction = "credit"
    } else if (rawDebit !== null && Math.abs(rawDebit) > 0) {
      signedAmount = Math.abs(rawDebit)
      direction = "debit"
    }

    const counterparty =
      columnMap.counterparty !== -1 ? (cells[columnMap.counterparty] ?? "").trim() : ""
    const purpose = columnMap.purpose !== -1 ? (cells[columnMap.purpose] ?? "").trim() : ""
    const externalId =
      columnMap.externalId !== -1 ? (cells[columnMap.externalId] ?? "").trim() || undefined : undefined

    const missingFields: MissingDataField[] = []
    if (!dateFact) missingFields.push("date")
    if (signedAmount === null || Math.abs(signedAmount) === 0) missingFields.push("amount")
    if (!counterparty) missingFields.push("counterparty")
    if (!purpose) missingFields.push("purpose")

    parsedRows.push({
      rowIndex: rowIdx,
      dateFact: dateFact || "Дата не указана",
      amount: signedAmount !== null ? Math.abs(signedAmount) : null,
      direction,
      counterparty: counterparty || "Контрагент не указан",
      purpose: purpose || "Назначение не указано",
      externalId,
      currency: "RUB",
      missingFields,
    })
  }

  return parsedRows
}

function buildSuggestion(
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

function pickCategoryName(
  desiredNames: string[],
  availableNames: string[],
  fallbackName: string,
): string {
  const normalizedAvailable = availableNames.map((name) => ({
    raw: name,
    norm: normalizeToken(name),
  }))

  for (const desired of desiredNames) {
    const targetNorm = normalizeToken(desired)
    const exactMatch = normalizedAvailable.find((item) => item.norm === targetNorm)
    if (exactMatch) return exactMatch.raw
  }

  for (const desired of desiredNames) {
    const targetNorm = normalizeToken(desired)
    const partialMatch = normalizedAvailable.find(
      (item) => item.norm.includes(targetNorm) || targetNorm.includes(item.norm),
    )
    if (partialMatch) return partialMatch.raw
  }

  return fallbackName
}

function collectAvailableCategories(categories: ImportCategoryBuckets): {
  all: string[]
  expenses: string[]
  income: string[]
  taxes: string[]
} {
  const expenses = categories.expenses.filter((item) => item.active).map((item) => item.name)
  const income = categories.income.filter((item) => item.active).map((item) => item.name)
  const taxes = categories.taxes.filter((item) => item.active).map((item) => item.name)
  const all = Array.from(new Set([...expenses, ...income, ...taxes, ...DEFAULT_FALLBACK_CATEGORIES]))
  return { all, expenses, income, taxes }
}

function suggestProject(
  text: string,
  projects: ImportProjectOption[],
  historyOp: ExistingLedgerOperation | undefined,
): FieldSuggestion | undefined {
  const activeProjects = projects.filter((project) => !project.archived)
  if (activeProjects.length === 0) return undefined
  if (historyOp && historyOp.project) {
    const activeMatch = activeProjects.find(
      (project) => normalizeToken(project.name) === normalizeToken(historyOp.project),
    )
    if (activeMatch) {
      return buildSuggestion(
        activeMatch.name,
        92,
        `Проект предложен по вашим прошлым операциям («${activeMatch.name}»)`,
        "history",
      )
    }
  }

  for (const project of activeProjects) {
    const normName = normalizeToken(project.name)
    const words = normName.split(" ").filter((word) => word.length >= 3)
    if (words.some((word) => text.includes(word))) {
      return buildSuggestion(
        project.name,
        88,
        `Название проекта «${project.name}» найдено в назначении или контрагенте`,
        "dictionary",
      )
    }
  }

  const projectKeywordMap: Array<{ tokens: string[]; projectHints: string[] }> = [
    { tokens: ["wildberries", "вайлдберриз", "пвз", "wb"], projectHints: ["пвз", "wildberries", "wb", "маркетплейс"] },
    { tokens: ["ozon", "озон", "книг"], projectHints: ["ozon", "озон", "книг", "интернет", "магазин"] },
    { tokens: ["квартир", "жильц", "найм", "арендатор"], projectHints: ["квартир", "аренд"] },
  ]

  for (const rule of projectKeywordMap) {
    if (rule.tokens.some((token) => text.includes(token))) {
      const matched = activeProjects.find((project) => {
        const norm = normalizeToken(project.name)
        return rule.projectHints.some((hint) => norm.includes(hint))
      })
      if (matched) {
        return buildSuggestion(
          matched.name,
          81,
          `Операция по контексту относится к направлению «${matched.name}»`,
          "llm",
        )
      }
    }
  }

  if (activeProjects.length === 1) {
    return buildSuggestion(
      activeProjects[0].name,
      74,
      "Предложен единственный активный проект, проверьте привязку",
      "rule",
    )
  }

  return buildSuggestion(
    "Без проекта",
    45,
    "Не удалось однозначно отнести операцию к одному из проектов",
    "rule",
  )
}

function buildDuplicateHash(
  accountId: string,
  dateFact: string,
  amount: number,
  direction: "credit" | "debit",
  counterparty: string,
  purpose: string,
): string {
  return [
    accountId,
    dateFact,
    amount.toFixed(2),
    direction,
    normalizeToken(counterparty),
    normalizeToken(purpose),
  ].join("|")
}

export function classifyRawRow(
  row: RawStatementRow,
  context: ClassificationContext,
): ImportedOperation {
  const categoryPool = collectAvailableCategories(context.categories)
  const combinedText = normalizeToken(`${row.counterparty} ${row.purpose}`)
  const normCounterparty = normalizeToken(row.counterparty)

  const historyMatch =
    normCounterparty.length >= 4 && normCounterparty !== "контрагент не указан"
      ? context.existingOperations.find((existing) =>
          normalizeToken(existing.comment).includes(normCounterparty),
        )
      : undefined

  let type: ImportOperationType = "Неопределённая операция"
  let typeSuggestion: FieldSuggestion
  let category = "Неопределённое"
  let categorySuggestion: FieldSuggestion
  let ownership: OwnershipStatus = "Неопределённое"
  let ownershipSuggestion: FieldSuggestion
  let amountKind: AmountKind = row.direction === "credit" ? "income" : "expense"
  let paidByPersonalFunds = false
  const reviewReasons: string[] = []

  if (row.missingFields.length > 0) {
    reviewReasons.push("Неполные данные в выписке — проверьте сумму, дату или назначение")
  }

  if (
    combinedText.includes("перевод между счетами") ||
    combinedText.includes("между собственными") ||
    combinedText.includes("накопительный счет") ||
    combinedText.includes("собственный счет")
  ) {
    type = "Перевод между собственными счетами"
    amountKind = "transfer"
    typeSuggestion = buildSuggestion(type, 95, "Распознан перевод между своими счетами", "rule")
    category = pickCategoryName(["Прочие расходы"], categoryPool.expenses, "Прочие расходы")
    categorySuggestion = buildSuggestion(category, 90, "Служебный перевод не влияет на P&L", "rule")
    ownership = context.account.accountType === "personal" ? "Личное" : "Бизнес"
    ownershipSuggestion = buildSuggestion(ownership, 90, "Определено по типу счёта выписки", "rule")
  } else if (
    combinedText.includes("снятие наличных") ||
    combinedText.includes("банкомат") ||
    combinedText.includes("выдача наличных") ||
    /\batm\b/.test(combinedText)
  ) {
    type = "Снятие наличных"
    amountKind = "expense"
    typeSuggestion = buildSuggestion(type, 91, "Операция похожа на снятие наличных", "rule")
    category = "Неопределённое"
    categorySuggestion = buildSuggestion(
      category,
      40,
      "Снятие наличных нельзя автоматически записывать в расходы",
      "rule",
    )
    ownership = "Неопределённое"
    ownershipSuggestion = buildSuggestion(
      ownership,
      45,
      "Уточните, на личные или бизнес-цели сняты наличные",
      "rule",
    )
    reviewReasons.push("Уточните назначение снятия наличных перед включением в отчёты")
  } else if (
    combinedText.includes("перевод физлицу") ||
    combinedText.includes("сбп") ||
    combinedText.includes("на карту физ")
  ) {
    type = "Перевод физлицу"
    amountKind = "expense"
    typeSuggestion = buildSuggestion(type, 82, "Обнаружен перевод физическому лицу", "rule")
    category = "Неопределённое"
    categorySuggestion = buildSuggestion(
      category,
      42,
      "Запросите назначение перевода (оплата услуг или личный перевод)",
      "rule",
    )
    ownership = "Неопределённое"
    ownershipSuggestion = buildSuggestion(
      ownership,
      48,
      "Требуется подтверждение бизнес-назначения перевода",
      "rule",
    )
    reviewReasons.push("Уточните назначение перевода физлицу")
  } else if (
    combinedText.includes("комиссия") ||
    combinedText.includes("обслуживание счет") ||
    combinedText.includes("обслуживание расч") ||
    combinedText.includes("рко") ||
    combinedText.includes("эквайринг")
  ) {
    type = "Банковская комиссия"
    amountKind = "expense"
    typeSuggestion = buildSuggestion(type, 97, "Правило по ключевым словам банковского обслуживания", "rule")
    category = pickCategoryName(
      ["Банковские комиссии", "Прочие расходы", "Прочие"],
      categoryPool.expenses,
      "Банковские комиссии",
    )
    categorySuggestion = buildSuggestion(
      category,
      96,
      "Категория предложена по правилу банковских комиссий",
      "rule",
    )
    ownership = "Бизнес"
    ownershipSuggestion = buildSuggestion(ownership, 95, "Обслуживание бизнес-счёта", "rule")
  } else if (
    combinedText.includes("фнс") ||
    combinedText.includes("налог") ||
    combinedText.includes("усн") ||
    combinedText.includes("енп") ||
    combinedText.includes("единый налоговый") ||
    combinedText.includes("страховые взносы") ||
    combinedText.includes("ндфл")
  ) {
    type = "Налоговый платёж"
    amountKind = "expense"
    typeSuggestion = buildSuggestion(type, 96, "Обнаружен налоговый платёж или взнос", "rule")
    const taxMatch = combinedText.includes("усн")
      ? ["УСН 6%", "УСН 15%", "Налоги"]
      : combinedText.includes("взнос")
        ? ["Страховые взносы", "Налоги"]
        : combinedText.includes("ндфл")
          ? ["НДФЛ", "Налоги"]
          : ["Налоги", "УСН 6%"]
    category = pickCategoryName(taxMatch, [...categoryPool.taxes, ...categoryPool.expenses], "Налоги")
    categorySuggestion = buildSuggestion(category, 94, "Определено по реквизитам налогового платежа", "rule")
    ownership = "Бизнес"
    ownershipSuggestion = buildSuggestion(ownership, 95, "Обязательный платёж бизнеса", "rule")
  } else if (combinedText.includes("погашение кредита") || combinedText.includes("оплата кредита")) {
    type = "Погашение кредита"
    amountKind = "expense"
    typeSuggestion = buildSuggestion(type, 91, "Платёж по кредитному обязательству", "rule")
    category = pickCategoryName(["Прочие расходы", "Прочие"], categoryPool.expenses, "Прочие расходы")
    categorySuggestion = buildSuggestion(category, 76, "Требует отдельного учёта основного долга и процентов", "rule")
    ownership = "Бизнес"
    ownershipSuggestion = buildSuggestion(ownership, 85, "Плановый платёж по счёту", "rule")
  } else if (combinedText.includes("получение кредита") || combinedText.includes("кредитные средства")) {
    type = "Получение кредита"
    amountKind = "income"
    typeSuggestion = buildSuggestion(type, 92, "Зачисление заёмных средств не является выручкой", "rule")
    category = pickCategoryName(["Прочие поступления"], categoryPool.income, "Прочие поступления")
    categorySuggestion = buildSuggestion(category, 78, "Заёмные средства исключаются из выручки P&L", "rule")
    ownership = "Бизнес"
    ownershipSuggestion = buildSuggestion(ownership, 86, "Кредитная линия бизнеса", "rule")
  } else if (combinedText.includes("возврат") && row.direction === "credit") {
    type = "Возврат от поставщика"
    amountKind = "income"
    typeSuggestion = buildSuggestion(type, 90, "Поступление с пометкой возврата от поставщика", "rule")
    category = pickCategoryName(["Упаковка", "Закупка товаров", "Расходники", "Прочие поступления"], categoryPool.all, "Упаковка")
    categorySuggestion = buildSuggestion(category, 82, "Рекомендуется связать с исходной категорией расхода", "llm")
    ownership = "Бизнес"
    ownershipSuggestion = buildSuggestion(ownership, 90, "Возврат по закупке", "rule")
  } else if (combinedText.includes("возврат") && row.direction === "debit") {
    type = "Возврат покупателю"
    amountKind = "expense"
    typeSuggestion = buildSuggestion(type, 90, "Списание с пометкой возврата клиенту", "rule")
    category = pickCategoryName(["Продажи", "Выручка от продаж", "Прочие расходы"], categoryPool.all, "Выручка от продаж")
    categorySuggestion = buildSuggestion(category, 82, "Учитывается как возврат покупателю", "llm")
    ownership = "Бизнес"
    ownershipSuggestion = buildSuggestion(ownership, 91, "Возврат по заказу клиента", "rule")
  } else if (
    combinedText.includes("пятерочк") ||
    combinedText.includes("магнит") ||
    combinedText.includes("вкусвилл") ||
    combinedText.includes("перекресток") ||
    combinedText.includes("аптека") ||
    combinedText.includes("кофейн") ||
    combinedText.includes("продукты") ||
    combinedText.includes("кино")
  ) {
    type = "Личный расход"
    amountKind = "expense"
    typeSuggestion = buildSuggestion(type, 93, "Повседневная покупка по словарю торговых точек", "dictionary")
    category = pickCategoryName(["Прочие расходы", "Прочие"], categoryPool.expenses, "Прочие расходы")
    categorySuggestion = buildSuggestion(category, 84, "Личные покупки не включаются в бизнес-расходы", "rule")
    ownership = "Личное"
    ownershipSuggestion = buildSuggestion(ownership, 94, "Определено как личный расход", "dictionary")
    reviewReasons.push("Личная покупка — не попадёт в отчётность бизнеса")
  } else if (row.direction === "credit") {
    type = "Доход"
    amountKind = "income"
    typeSuggestion = buildSuggestion(type, 94, "Входящий платёж от контрагента или маркетплейса", "rule")
    if (historyMatch) {
      category = historyMatch.category
      categorySuggestion = buildSuggestion(
        category,
        94,
        "На основе ваших прошлых операций с этим контрагентом",
        "history",
      )
    } else if (
      combinedText.includes("аренд") ||
      combinedText.includes("найм") ||
      combinedText.includes("жильц")
    ) {
      category = pickCategoryName(["Продажи", "Услуги", "Аренда", "Прочие поступления"], categoryPool.income, "Продажи")
      categorySuggestion = buildSuggestion(category, 87, "Распознано по назначению арендного платежа", "llm")
    } else if (combinedText.includes("аванс") || combinedText.includes("предоплат")) {
      category = pickCategoryName(["Авансы", "Продажи"], categoryPool.income, "Авансы")
      categorySuggestion = buildSuggestion(category, 89, "Обнаружена предоплата / аванс в назначении", "rule")
    } else if (
      combinedText.includes("вб") ||
      combinedText.includes("wildberries") ||
      combinedText.includes("вайлдберриз") ||
      combinedText.includes("ozon") ||
      combinedText.includes("озон") ||
      combinedText.includes("заказ") ||
      combinedText.includes("выручка") ||
      combinedText.includes("реализован")
    ) {
      category = pickCategoryName(
        ["Доход от ВБ", "Продажи", "Выручка от продаж"],
        categoryPool.income,
        "Продажи",
      )
      categorySuggestion = buildSuggestion(category, 93, "Распознано по назначению платежа", "llm")
    } else {
      category = "Неопределённое"
      categorySuggestion = buildSuggestion(
        category,
        52,
        "Назначение поступления недостаточно конкретное — выберите категорию",
        "llm",
      )
      reviewReasons.push("Не удалось уверенно определить статью дохода")
    }

    if (category === "Неопределённое") {
      ownership = "Неопределённое"
      ownershipSuggestion = buildSuggestion(
        ownership,
        55,
        "Проверьте, относится ли поступление к бизнесу",
        "llm",
      )
    } else {
      ownership = "Бизнес"
      ownershipSuggestion = buildSuggestion(ownership, 93, "Деловое поступление на счёт", "rule")
    }
  } else {
    const keywordRules: Array<{
      tokens: string[]
      desired: string[]
      fallback: string
      confidence: number
      reason: string
    }> = [
      {
        tokens: ["аренд", "складск", "помещен"],
        desired: ["Аренда"],
        fallback: "Аренда",
        confidence: 95,
        reason: "Ключевое слово аренды в назначении платежа",
      },
      {
        tokens: ["коммунал", "электроэнерг", "водоснаб", "жкх", "отоплен"],
        desired: ["Коммуналка", "Коммунальные услуги"],
        fallback: "Коммуналка",
        confidence: 94,
        reason: "Распознаны коммунальные услуги (отдельно от интернета)",
      },
      {
        tokens: ["интернет", "связ", "тариф", "телефон"],
        desired: ["Интернет", "Интернет и связь"],
        fallback: "Интернет",
        confidence: 94,
        reason: "Распознаны расходы на интернет и связь",
      },
      {
        tokens: ["упаков", "короб", "пакет", "скотч", "гофро"],
        desired: ["Упаковка", "Расходники"],
        fallback: "Упаковка",
        confidence: 92,
        reason: "Распознаны упаковочные и расходные материалы",
      },
      {
        tokens: ["достав", "курьер", "логист", "транспорт", "сдэк", "деловые линии"],
        desired: ["Логистика и доставка", "Расходники"],
        fallback: "Логистика и доставка",
        confidence: 91,
        reason: "Распознаны услуги доставки и логистики",
      },
      {
        tokens: ["реклам", "яндекс директ", "директ", "продвижен", "маркет", "таргет"],
        desired: ["Реклама"],
        fallback: "Реклама",
        confidence: 92,
        reason: "Распознаны расходы на рекламу и продвижение",
      },
      {
        tokens: ["товар", "парти", "закуп", "поставк", "аксессуар", "накладн"],
        desired: ["Закупка товаров", "Расходники"],
        fallback: "Закупка товаров",
        confidence: 89,
        reason: "Распознана закупка товаров по накладной или счёту",
      },
      {
        tokens: ["зарплат", "аванс сотруд", "выплата зп"],
        desired: ["Зарплата"],
        fallback: "Зарплата",
        confidence: 93,
        reason: "Распознана выплата заработной платы",
      },
    ]

    const matchedRule = keywordRules.find((rule) =>
      rule.tokens.some((token) => combinedText.includes(token)),
    )

    if (historyMatch) {
      type = "Расход"
      typeSuggestion = buildSuggestion(type, 93, "Сопоставлено с прошлыми расходами контрагента", "history")
      category = historyMatch.category
      categorySuggestion = buildSuggestion(
        category,
        95,
        "На основе ваших прошлых операций с этим контрагентом",
        "history",
      )
    } else if (matchedRule) {
      type = "Расход"
      typeSuggestion = buildSuggestion(type, 93, "Списание по хозяйственной операции", "rule")
      category = pickCategoryName(matchedRule.desired, categoryPool.expenses, matchedRule.fallback)
      categorySuggestion = buildSuggestion(category, matchedRule.confidence, matchedRule.reason, "rule")
    } else if (combinedText.includes("оборудован") || combinedText.includes("договор")) {
      type = "Неопределённая операция"
      typeSuggestion = buildSuggestion(
        type,
        54,
        "Неясен характер операции (разовый расход, аванс или капитальная покупка)",
        "llm",
      )
      category = pickCategoryName(["Прочие расходы", "Прочие"], categoryPool.expenses, "Прочие расходы")
      categorySuggestion = buildSuggestion(
        category,
        58,
        "Предложено по назначению платежа, но формулировка слишком общая",
        "llm",
      )
      reviewReasons.push("Неоднозначное назначение — подтвердите тип и категорию")
    } else {
      type = "Расход"
      typeSuggestion = buildSuggestion(type, 76, "Определено по списанию средств", "rule")
      category = "Неопределённое"
      categorySuggestion = buildSuggestion(
        category,
        46,
        "Не удалось автоматически подобрать категорию расхода",
        "llm",
      )
      reviewReasons.push("Выберите категорию расхода вручную")
    }

    if (context.account.accountType === "personal") {
      if (matchedRule || historyMatch) {
        ownership = "Бизнес"
        paidByPersonalFunds = true
        ownershipSuggestion = buildSuggestion(
          ownership,
          74,
          "Похоже на бизнес-расход с личной карты — требуется ваше подтверждение",
          "llm",
        )
        reviewReasons.push("Оплата с личной карты: подтвердите, что это бизнес-расход (для P&L)")
      } else {
        ownership = "Неопределённое"
        ownershipSuggestion = buildSuggestion(
          ownership,
          48,
          "Списание с личной карты: укажите, личная это покупка или бизнес-расход",
          "rule",
        )
        reviewReasons.push("Разделение личного и бизнеса: проверьте принадлежность")
      }
    } else {
      ownership = isUncertainValue(type) || isUncertainValue(category) ? "Неопределённое" : "Бизнес"
      ownershipSuggestion = buildSuggestion(
        ownership,
        ownership === "Бизнес" ? 92 : 58,
        ownership === "Бизнес"
          ? "Операция по расчётному счёту бизнеса"
          : "Проверьте принадлежность операции",
        "rule",
      )
    }
  }

  const projectSuggestion = suggestProject(combinedText, context.projects, historyMatch)
  const numericAmount = row.amount ?? 0

  return {
    id: `imp-op-${context.batchId}-${row.rowIndex}`,
    batchId: context.batchId,
    accountId: context.account.id,
    externalId: row.externalId,
    duplicateHash: buildDuplicateHash(
      context.account.id,
      row.dateFact,
      numericAmount,
      row.direction,
      row.counterparty,
      row.purpose,
    ),
    dateFact: row.dateFact,
    datePeriod: row.dateFact,
    counterparty: row.counterparty,
    purpose: row.purpose,
    amount: numericAmount,
    currency: row.currency,
    direction: row.direction,
    amountKind,
    type,
    category,
    project: projectSuggestion?.value ?? "Без проекта",
    ownership,
    paidByPersonalFunds,
    suggestions: {
      type: typeSuggestion,
      category: categorySuggestion,
      ...(projectSuggestion ? { project: projectSuggestion } : {}),
      ownership: ownershipSuggestion,
    },
    missingFields: row.missingFields,
    reviewReasons,
    status: "review",
    corrections: [],
  }
}

export function detectDuplicates(
  operations: ImportedOperation[],
  existingOperations: ExistingLedgerOperation[],
): ImportedOperation[] {
  const seenByExternalId = new Map<string, ImportedOperation>()
  const seenByHash = new Map<string, ImportedOperation>()
  const seenByLooseKey = new Map<string, ImportedOperation>()

  return operations.map((operation) => {
    const looseKey = [
      operation.dateFact,
      operation.amount.toFixed(2),
      operation.direction,
      normalizeToken(operation.counterparty),
    ].join("|")

    let duplicate: DuplicateInfo | undefined

    if (operation.externalId && seenByExternalId.has(operation.externalId)) {
      const matched = seenByExternalId.get(operation.externalId)!
      duplicate = {
        kind: "exact",
        source: "in_file",
        matchedOperationId: matched.id,
        matchedSnapshot: {
          date: matched.dateFact,
          counterparty: matched.counterparty,
          purpose: matched.purpose,
          amount: matched.amount,
        },
        reason: "Совпадает банковский идентификатор операции в загруженной выписке",
      }
    } else if (seenByHash.has(operation.duplicateHash)) {
      const matched = seenByHash.get(operation.duplicateHash)!
      duplicate = {
        kind: "exact",
        source: "in_file",
        matchedOperationId: matched.id,
        matchedSnapshot: {
          date: matched.dateFact,
          counterparty: matched.counterparty,
          purpose: matched.purpose,
          amount: matched.amount,
        },
        reason: "Точное совпадение даты, суммы, контрагента и назначения в выписке",
      }
    } else if (
      operation.counterparty !== "Контрагент не указан" &&
      seenByLooseKey.has(looseKey)
    ) {
      const matched = seenByLooseKey.get(looseKey)!
      duplicate = {
        kind: "possible",
        source: "in_file",
        matchedOperationId: matched.id,
        matchedSnapshot: {
          date: matched.dateFact,
          counterparty: matched.counterparty,
          purpose: matched.purpose,
          amount: matched.amount,
        },
        reason: "Совпадают дата, сумма и контрагент в выписке, проверьте назначение",
      }
    } else {
      const normCounterparty = normalizeToken(operation.counterparty)
      const normPurpose = normalizeToken(operation.purpose)

      const ledgerExact = existingOperations.find((existing) => {
        const sameDirection =
          (existing.type === "income" && operation.direction === "credit") ||
          (existing.type !== "income" && operation.direction === "debit")
        if (!sameDirection) return false
        if (existing.date !== operation.dateFact) return false
        if (Math.abs(Math.abs(existing.amount) - operation.amount) > 0.01) return false
        const normComment = normalizeToken(existing.comment)
        return (
          normCounterparty.length >= 3 &&
          normComment.includes(normCounterparty) &&
          (normPurpose.length < 4 || normComment.includes(normPurpose.slice(0, 24)))
        )
      })

      if (ledgerExact) {
        duplicate = {
          kind: "exact",
          source: "in_ledger",
          matchedOperationId: ledgerExact.id,
          matchedSnapshot: {
            date: ledgerExact.date,
            counterparty: ledgerExact.comment.split(" — ")[0] || ledgerExact.category,
            purpose: ledgerExact.comment,
            amount: Math.abs(ledgerExact.amount),
            category: ledgerExact.category,
            project: ledgerExact.project,
          },
          reason: "Операция с такими реквизитами уже есть в финансовом учёте",
        }
      } else {
        const ledgerPossible = existingOperations.find((existing) => {
          const sameDirection =
            (existing.type === "income" && operation.direction === "credit") ||
            (existing.type !== "income" && operation.direction === "debit")
          return (
            sameDirection &&
            existing.date === operation.dateFact &&
            Math.abs(Math.abs(existing.amount) - operation.amount) <= 0.01
          )
        })

        if (ledgerPossible) {
          duplicate = {
            kind: "possible",
            source: "in_ledger",
            matchedOperationId: ledgerPossible.id,
            matchedSnapshot: {
              date: ledgerPossible.date,
              counterparty: ledgerPossible.comment.split(" — ")[0] || ledgerPossible.category,
              purpose: ledgerPossible.comment,
              amount: Math.abs(ledgerPossible.amount),
              category: ledgerPossible.category,
              project: ledgerPossible.project,
            },
            reason: "В учёте уже есть операция на ту же дату и сумму",
          }
        }
      }
    }

    if (operation.externalId && !seenByExternalId.has(operation.externalId)) {
      seenByExternalId.set(operation.externalId, operation)
    }
    if (!seenByHash.has(operation.duplicateHash)) {
      seenByHash.set(operation.duplicateHash, operation)
    }
    if (!seenByLooseKey.has(looseKey)) {
      seenByLooseKey.set(looseKey, operation)
    }

    if (!duplicate) return operation
    return {
      ...operation,
      duplicate,
      reviewReasons: [...operation.reviewReasons, duplicate.reason],
    }
  })
}

export function computeBatchSummary(operations: ImportedOperation[]): ImportBatchSummary {
  const isoDates = operations
    .map((operation) => uiDateToIso(operation.dateFact))
    .filter((iso) => iso !== "")
    .sort()

  return {
    totalFound: operations.length,
    recognizedCount: operations.filter(
      (operation) =>
        operation.missingFields.length === 0 && !isUncertainValue(operation.type),
    ).length,
    exactDuplicatesCount: operations.filter(
      (operation) =>
        operation.status !== "excluded" && operation.duplicate?.kind === "exact",
    ).length,
    possibleDuplicatesCount: operations.filter(
      (operation) =>
        operation.status !== "excluded" && operation.duplicate?.kind === "possible",
    ).length,
    missingDataCount: operations.filter(
      (operation) => operation.missingFields.length > 0,
    ).length,
    unclassifiedCount: operations.filter(
      (operation) =>
        operation.status !== "excluded" &&
        (isUncertainValue(operation.type) ||
          isUncertainValue(operation.category) ||
          isUncertainValue(operation.ownership)),
    ).length,
    detectedPeriodStart: isoDates[0],
    detectedPeriodEnd: isoDates[isoDates.length - 1],
  }
}

export async function parseLocalCsvBatch(params: {
  file: File
  account?: BankAccount
  periodStart?: string
  periodEnd?: string
  projects: ImportProjectOption[]
  categories: ImportCategoryBuckets
  existingOperations: ExistingLedgerOperation[]
}): Promise<ImportBatch> {
  const account = params.account ?? DEFAULT_BANK_ACCOUNTS[0]
  const batchId = `batch-${Date.now()}`
  const csvText = await readCsvFile(params.file)
  const rawRows = parseCsvText(csvText)

  if (rawRows.length === 0) {
    throw new Error("В CSV-файле не найдено строк с операциями.")
  }

  const classified = rawRows.map((row) =>
    classifyRawRow(row, {
      batchId,
      account,
      projects: params.projects,
      categories: params.categories,
      existingOperations: params.existingOperations,
    }),
  )
  const withDuplicates = detectDuplicates(classified, params.existingOperations)
  const summary = computeBatchSummary(withDuplicates)

  return {
    id: batchId,
    fileName: params.file.name,
    fileSize: params.file.size,
    fileFormat: "csv",
    accountId: account.id,
    accountName: account.name,
    accountType: account.accountType,
    periodStart: params.periodStart || summary.detectedPeriodStart || "",
    periodEnd: params.periodEnd || summary.detectedPeriodEnd || "",
    uploadedAt: new Date().toISOString(),
    sourceMode: "local_csv",
    summary,
    operations: withDuplicates,
  }
}

export function buildSampleBatchForOfflineXlsx(params: {
  file: File
  account?: BankAccount
  periodStart?: string
  periodEnd?: string
  projects: ImportProjectOption[]
  categories: ImportCategoryBuckets
  existingOperations: ExistingLedgerOperation[]
}): ImportBatch {
  const account = params.account ?? DEFAULT_BANK_ACCOUNTS[0]
  const batchId = `batch-${Date.now()}`
  const isPersonalAccount = account.accountType === "personal"

  const rawRows: RawStatementRow[] = [
    {
      rowIndex: 1,
      dateFact: "18.11.2026",
      amount: 124800,
      direction: "debit",
      counterparty: "ООО «Вектор Трейд»",
      purpose: "Оплата по счёту № ВТ-1847 за закупку товаров и аксессуаров",
      externalId: "DOC-8471",
      currency: "RUB",
      missingFields: [],
    },
    {
      rowIndex: 2,
      dateFact: "17.11.2026",
      amount: 1490,
      direction: "debit",
      counterparty: "АО «Т-Банк»",
      purpose: "Комиссия за обслуживание расчётного счёта",
      externalId: "DOC-8460",
      currency: "RUB",
      missingFields: [],
    },
    {
      rowIndex: 3,
      dateFact: "17.11.2026",
      amount: 386400,
      direction: "credit",
      counterparty: "ООО «Вайлдберриз»",
      purpose: "Выплата за реализованные товары ПВЗ Wildberries, отчёт № 48391",
      externalId: "DOC-8455",
      currency: "RUB",
      missingFields: [],
    },
    {
      rowIndex: 4,
      dateFact: "16.11.2026",
      amount: 68000,
      direction: "debit",
      counterparty: "ООО «Складские решения»",
      purpose: "Аренда помещения за ноябрь 2026 года",
      externalId: "DOC-8442",
      currency: "RUB",
      missingFields: [],
    },
    {
      rowIndex: 5,
      dateFact: "15.11.2026",
      amount: 32750,
      direction: "debit",
      counterparty: "ООО «Курьерская служба 24»",
      purpose: "Доставка заказов покупателям Ozon, реестр № 11-15/204",
      externalId: "DOC-8431",
      currency: "RUB",
      missingFields: [],
    },
    {
      rowIndex: 6,
      dateFact: "15.11.2026",
      amount: 32750,
      direction: "debit",
      counterparty: "ООО «Курьерская служба 24»",
      purpose: "Оплата доставки заказов по реестру № 11-15/204",
      externalId: "DOC-8432",
      currency: "RUB",
      missingFields: [],
    },
    {
      rowIndex: 7,
      dateFact: "14.11.2026",
      amount: 24800,
      direction: "debit",
      counterparty: "ФНС России",
      purpose: "Единый налоговый платёж УСН 6% за III квартал 2026 года",
      externalId: "DOC-8419",
      currency: "RUB",
      missingFields: [],
    },
    {
      rowIndex: 8,
      dateFact: "13.11.2026",
      amount: 100000,
      direction: "debit",
      counterparty: "Перевод между счетами",
      purpose: "Перевод между собственными счетами на накопительный счёт •• 2841",
      externalId: "DOC-8408",
      currency: "RUB",
      missingFields: [],
    },
    {
      rowIndex: 9,
      dateFact: "12.11.2026",
      amount: 8350,
      direction: "credit",
      counterparty: "ООО «ПакСнаб Поволжье»",
      purpose: "Возврат оплаты за недопоставленную упаковку по накладной 9082",
      externalId: "DOC-8394",
      currency: "RUB",
      missingFields: [],
    },
    {
      rowIndex: 10,
      dateFact: "11.11.2026",
      amount: 4290,
      direction: "debit",
      counterparty: "ООО «Связь для бизнеса»",
      purpose: "Интернет для офиса и ПВЗ за ноябрь",
      externalId: "DOC-8380",
      currency: "RUB",
      missingFields: [],
    },
    {
      rowIndex: 11,
      dateFact: "10.11.2026",
      amount: 8000,
      direction: "debit",
      counterparty: "Магазин упаковки «ПакетМаркет»",
      purpose: "Закупка коробок и скотча для заказов интернет-магазина",
      externalId: "DOC-8372",
      currency: "RUB",
      missingFields: [],
    },
    {
      rowIndex: 12,
      dateFact: "09.11.2026",
      amount: 3420,
      direction: "debit",
      counterparty: "Пятёрочка",
      purpose: "Покупка продуктов картой",
      externalId: "DOC-8361",
      currency: "RUB",
      missingFields: [],
    },
    {
      rowIndex: 13,
      dateFact: "08.11.2026",
      amount: 10000,
      direction: "debit",
      counterparty: "Банкомат № 4092",
      purpose: "Снятие наличных через банкомат",
      externalId: "DOC-8348",
      currency: "RUB",
      missingFields: [],
    },
    {
      rowIndex: 14,
      dateFact: "08.11.2026",
      amount: 45000,
      direction: "debit",
      counterparty: "ООО «ТехноПром Групп»",
      purpose: "Аванс по договору № ТП-809 за оборудование",
      externalId: "DOC-8340",
      currency: "RUB",
      missingFields: [],
    },
    {
      rowIndex: 15,
      dateFact: "17.11.2026",
      amount: 1490,
      direction: "debit",
      counterparty: "АО «Т-Банк»",
      purpose: "Комиссия за обслуживание расчётного счёта",
      externalId: "DOC-8460",
      currency: "RUB",
      missingFields: [],
    },
    {
      rowIndex: 16,
      dateFact: "07.11.2026",
      amount: 5200,
      direction: "debit",
      counterparty: "Контрагент не указан",
      purpose: "Перевод по счёту без детализации",
      externalId: "DOC-8315",
      currency: "RUB",
      missingFields: ["counterparty"],
    },
  ]

  const classified = rawRows.map((row) => {
    const operation = classifyRawRow(row, {
      batchId,
      account,
      projects: params.projects,
      categories: params.categories,
      existingOperations: params.existingOperations,
    })

    if (row.rowIndex === 11 && !isPersonalAccount) {
      return {
        ...operation,
        paidByPersonalFunds: true,
        suggestions: {
          ...operation.suggestions,
          ownership: buildSuggestion(
            "Бизнес",
            76,
            "Покупка похожа на бизнес-расход, проверьте источник оплаты (личная карта или счёт)",
            "llm",
          ),
        },
        reviewReasons: [
          ...operation.reviewReasons,
          "Уточните, оплачена ли покупка личными средствами",
        ],
      }
    }

    return operation
  })

  const withDuplicates = detectDuplicates(classified, params.existingOperations)
  const summary = computeBatchSummary(withDuplicates)

  return {
    id: batchId,
    fileName: params.file.name,
    fileSize: params.file.size,
    fileFormat: "xlsx",
    accountId: account.id,
    accountName: account.name,
    accountType: account.accountType,
    periodStart: params.periodStart || summary.detectedPeriodStart || "",
    periodEnd: params.periodEnd || summary.detectedPeriodEnd || "",
    uploadedAt: new Date().toISOString(),
    sourceMode: "demo_preview",
    summary,
    operations: withDuplicates,
  }
}
