export function formatRub(value: number): string {
  const rounded = Math.round(value * 100) / 100

  return (
    new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(rounded) + " ₽"
  )
}

export function formatPercent(value: number, base: number): string {
  if (base === 0) return "—"

  const percentage = Math.round((value / base) * 1000) / 10

  return `${Number.isInteger(percentage) ? percentage : percentage.toFixed(1)}%`
}

export function formatDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)

  return match ? `${match[3]}.${match[2]}.${match[1]}` : date
}
