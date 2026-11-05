export type PeriodKind = "ALL" | "MONTH" | "QUARTER" | "YEAR"

export interface Period {
  kind: PeriodKind
  year: number
  month: number
  quarter: number
}

export const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
]

export function currentPeriod(kind: PeriodKind = "MONTH", now: Date = new Date()): Period {
  return {
    kind,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    quarter: Math.floor(now.getMonth() / 3) + 1,
  }
}

export function periodContains(period: Period, date: string): boolean {
  if (period.kind === "ALL") return true

  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date)

  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])

  if (year !== period.year || month < 1 || month > 12) return false
  if (period.kind === "YEAR") return true
  if (period.kind === "MONTH") return month === period.month

  return period.quarter >= 1 && period.quarter <= 4 && Math.ceil(month / 3) === period.quarter
}

export function yearOptions(
  transactions: {
    date_fact: string
    date_period: string
  }[],
  now: Date = new Date(),
): number[] {
  const currentYear = now.getFullYear()
  const years = new Set([currentYear - 1, currentYear, currentYear + 1])

  for (const transaction of transactions) {
    for (const date of [transaction.date_fact, transaction.date_period]) {
      const match = /^(\d{4})-\d{2}-\d{2}$/.exec(date)
      if (match) years.add(Number(match[1]))
    }
  }

  return [...years].sort((a, b) => b - a)
}
