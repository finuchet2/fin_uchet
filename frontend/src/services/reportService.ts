import { Category, Transaction } from "../types"
import { Period, periodContains } from "../utils"

export type AccountingMethod = "PNL" | "CASH_FLOW"

export interface ReportRow {
  id: string
  name: string
  amount: number
}

export interface Report {
  income: number
  expense: number
  tax: number
  net: number
  incomeRows: ReportRow[]
  expenseRows: ReportRow[]
  taxRows: ReportRow[]
  count: number
}

export function buildReport(
  transactions: Transaction[],
  categories: Category[],
  projectIds: string[],
  period: Period,
  method: AccountingMethod,
): Report {
  const selectedProjects = new Set(projectIds)
  const activeCategories = categories.filter((category) => category.is_active)
  const activeCategoryIds = new Set(activeCategories.map((category) => category.id))

  const filteredTransactions = transactions.filter((transaction) => {
    const date = method === "PNL" ? transaction.date_period : transaction.date_fact

    return (
      selectedProjects.has(transaction.project_id) &&
      activeCategoryIds.has(transaction.category_id) &&
      periodContains(period, date)
    )
  })

  const totals = new Map<string, number>()
  const categoryTotals = new Map<string, number>()

  for (const transaction of filteredTransactions) {
    const amountInKopecks = Math.round(transaction.amount * 100)
    totals.set(transaction.type, (totals.get(transaction.type) ?? 0) + amountInKopecks)
    categoryTotals.set(
      transaction.category_id,
      (categoryTotals.get(transaction.category_id) ?? 0) + amountInKopecks,
    )
  }

  const rowsFor = (type: Category["type"]): ReportRow[] =>
    activeCategories
      .filter((category) => category.type === type)
      .map((category) => ({
        id: category.id,
        name: category.name,
        amount: (categoryTotals.get(category.id) ?? 0) / 100,
      }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount)

  const income = totals.get("INCOME") ?? 0
  const expense = totals.get("EXPENSE") ?? 0
  const tax = totals.get("TAX") ?? 0

  return {
    income: income / 100,
    expense: expense / 100,
    tax: tax / 100,
    net: (income - expense - tax) / 100,
    incomeRows: rowsFor("INCOME"),
    expenseRows: rowsFor("EXPENSE"),
    taxRows: rowsFor("TAX"),
    count: filteredTransactions.length,
  }
}
