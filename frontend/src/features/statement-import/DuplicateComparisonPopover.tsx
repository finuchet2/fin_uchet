import { useLayoutEffect, useState, type RefObject } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { formatRuCurrency, type ImportedOperation } from "../../types/import"

export interface PopoverAnchorRect {
  top: number
  bottom: number
  left: number
  right: number
}

interface DuplicateComparisonPopoverProps {
  operation: ImportedOperation
  matchingInFile?: ImportedOperation
  anchorRect: PopoverAnchorRect
  popoverRef: RefObject<HTMLDivElement>
  onClose: () => void
  onSkipDuplicate: (operation: ImportedOperation) => void
  onKeepOperation: (operation: ImportedOperation) => void
}

export default function DuplicateComparisonPopover({
  operation,
  matchingInFile,
  anchorRect,
  popoverRef,
  onClose,
  onSkipDuplicate,
  onKeepOperation,
}: DuplicateComparisonPopoverProps) {
  const [coords, setCoords] = useState(() => ({
    top: anchorRect.bottom + 8,
    left: anchorRect.left,
  }))

  useLayoutEffect(() => {
    const el = popoverRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const edge = 8
    const gap = 8
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = document.documentElement.clientHeight

    const left = Math.max(edge, Math.min(anchorRect.left, viewportWidth - width - edge))
    let top: number
    if (anchorRect.bottom + gap + height <= viewportHeight - edge) {
      top = anchorRect.bottom + gap
    } else if (anchorRect.top - gap - height >= edge) {
      top = anchorRect.top - gap - height
    } else {
      top = Math.max(edge, viewportHeight - height - edge)
    }
    setCoords({ top, left })
  }, [anchorRect, popoverRef, operation.id])

  const duplicate = operation.duplicate
  if (!duplicate) return null

  const snapshot = matchingInFile
    ? {
        date: matchingInFile.dateFact,
        counterparty: matchingInFile.counterparty,
        purpose: matchingInFile.purpose,
        amount: matchingInFile.amount,
      }
    : duplicate.matchedSnapshot

  const title = duplicate.kind === "exact" ? "Точный дубликат" : "Похожая операция"
  const comparedHeader = duplicate.source === "in_ledger" ? "Уже в учёте" : "В выписке"

  return createPortal(
    <div
      ref={popoverRef}
      className="operation-review__duplicate-popover"
      role="dialog"
      aria-label="Сравнение дубликатов"
      style={{ top: coords.top, left: coords.left }}
    >
      <div className="operation-review__duplicate-popover-heading">
        <strong>{title}</strong>
        <button type="button" aria-label="Закрыть сравнение" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <p className="operation-review__duplicate-reason">{duplicate.reason}</p>
      {snapshot ? (
        <div className="operation-review__duplicate-comparison">
          <span />
          <strong>Эта операция</strong>
          <strong>{comparedHeader}</strong>
          <span>Дата</span>
          <span>{operation.dateFact}</span>
          <span>{snapshot.date}</span>
          <span>Контрагент</span>
          <span>{operation.counterparty}</span>
          <span>{snapshot.counterparty}</span>
          <span>Сумма</span>
          <span>{formatRuCurrency(operation.amount)}</span>
          <span>{formatRuCurrency(snapshot.amount)}</span>
          <span>Назначение</span>
          <span>{operation.purpose}</span>
          <span>{snapshot.purpose}</span>
        </div>
      ) : (
        <p className="operation-review__duplicate-missing">
          Сравнение с исходной операцией недоступно.
        </p>
      )}
      <div className="operation-review__duplicate-actions">
        <button
          type="button"
          className="operation-review__duplicate-skip"
          onClick={() => onSkipDuplicate(operation)}
        >
          Исключить дубликат
        </button>
        <button
          type="button"
          className="operation-review__duplicate-keep"
          onClick={() => onKeepOperation(operation)}
        >
          Оставить как новую
        </button>
      </div>
    </div>,
    document.body,
  )
}
