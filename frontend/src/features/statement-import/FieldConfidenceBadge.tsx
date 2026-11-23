import { ShieldCheck } from "lucide-react"
import TruncatedValue from "../../TruncatedValue"
import type { FieldSuggestion } from "../../types/import"

const SOURCE_LABELS: Record<FieldSuggestion["source"], string> = {
  rule: "Правило",
  dictionary: "Словарь контрагентов",
  history: "История операций",
  llm: "ИИ-анализ",
}

export default function FieldConfidenceBadge({
  suggestion,
}: {
  suggestion?: FieldSuggestion
}) {
  if (!suggestion) return null

  const confidenceLabel =
    suggestion.level === "high"
      ? "Высокая уверенность"
      : suggestion.level === "medium"
        ? "Средняя уверенность"
        : "Низкая уверенность"
  const sourceLabel = SOURCE_LABELS[suggestion.source]
  const tooltipValue = `${confidenceLabel} (${sourceLabel}): ${suggestion.reason}`

  return (
    <TruncatedValue
      value={tooltipValue}
      tooltipValue={tooltipValue}
      className={`operation-review__confidence operation-review__confidence--${suggestion.level}`}
      tooltipOnHover
      ariaLabel={tooltipValue}
    >
      <ShieldCheck size={11} aria-hidden="true" />
      <span>{suggestion.confidence}%</span>
    </TruncatedValue>
  )
}
