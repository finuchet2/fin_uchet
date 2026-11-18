import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  Check,
  CheckCheck,
  CircleCheck,
  FileSpreadsheet,
  Info,
  Minus,
  ShieldCheck,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import CustomSelect from "./CustomSelect";
import TruncatedValue from "./TruncatedValue";

const operationTypes = [
  "Доход",
  "Расход",
  "Перевод между собственными счетами",
  "Возврат от поставщика",
  "Возврат покупателю",
  "Банковская комиссия",
  "Налоговый платёж",
  "Получение кредита",
  "Погашение кредита",
  "Снятие наличных",
  "Неопределённая операция",
];

const categories = [
  "Аренда",
  "Закупка товаров",
  "Упаковка",
  "Логистика и доставка",
  "Реклама",
  "Интернет и связь",
  "Коммунальные услуги",
  "Банковские комиссии",
  "Налоги",
  "Подписки и сервисы",
  "Прочие расходы",
  "Выручка от продаж",
  "Неопределённое",
];

const projects = ["Основное направление", "Интернет-магазин", "Розница", "Без проекта"];
const ownershipOptions = ["Бизнес", "Личное", "Неопределённое"];
const operationTypeOptions = operationTypes.map((value) => ({ value, label: value }));
const categoryOptions = categories.map((value) => ({ value, label: value }));
const projectOptions = projects.map((value) => ({ value, label: value }));
const ownershipSelectOptions = ownershipOptions.map((value) => ({ value, label: value }));

type OperationStatus = "review" | "confirmed" | "excluded";
type QuickFilter = "all" | "review" | "duplicates" | "excluded";
type AmountKind = "income" | "expense" | "transfer";
type DuplicateKind = "exact" | "possible";
type SuggestedField = "type" | "category" | "ownership";

type RecognitionSuggestion = {
  confidence: number;
  reason: string;
};

type ImportedOperation = {
  id: string;
  date: string;
  counterparty: string;
  purpose: string;
  amount: number;
  amountKind: AmountKind;
  type: string;
  category: string;
  project: string;
  ownership: string;
  suggestions?: Partial<Record<SuggestedField, RecognitionSuggestion>>;
  duplicateKind?: DuplicateKind;
  duplicateOf?: string;
  status: OperationStatus;
};

const initialOperations: ImportedOperation[] = [
  {
    id: "op-1",
    date: "18.11.2026",
    counterparty: "ООО «Вектор Трейд»",
    purpose: "Оплата по счёту № ВТ-1847 за партию аксессуаров",
    amount: 124800,
    amountKind: "expense",
    type: "Расход",
    category: "Закупка товаров",
    project: "Интернет-магазин",
    ownership: "Бизнес",
    suggestions: {
      category: { confidence: 94, reason: "Распознано по назначению платежа" },
    },
    status: "review",
  },
  {
    id: "op-2",
    date: "17.11.2026",
    counterparty: "АО «Т-Банк»",
    purpose: "Комиссия за обслуживание расчётного счёта",
    amount: 1490,
    amountKind: "expense",
    type: "Банковская комиссия",
    category: "Банковские комиссии",
    project: "Основное направление",
    ownership: "Бизнес",
    suggestions: {
      category: { confidence: 98, reason: "На основе ваших прошлых операций с этим контрагентом" },
    },
    status: "review",
  },
  {
    id: "op-3",
    date: "17.11.2026",
    counterparty: "ИП Смирнова Анна Олеговна",
    purpose: "Поступление оплаты по заказу № 48391, интернет-магазин",
    amount: 386400,
    amountKind: "income",
    type: "Доход",
    category: "Выручка от продаж",
    project: "Интернет-магазин",
    ownership: "Бизнес",
    suggestions: {
      type: { confidence: 96, reason: "Распознано по назначению платежа" },
      category: { confidence: 96, reason: "Распознано по назначению платежа" },
    },
    status: "review",
  },
  {
    id: "op-4",
    date: "16.11.2026",
    counterparty: "ООО «Складские решения»",
    purpose: "Аренда складского помещения за ноябрь 2026 года",
    amount: 68000,
    amountKind: "expense",
    type: "Расход",
    category: "Аренда",
    project: "Основное направление",
    ownership: "Бизнес",
    status: "review",
  },
  {
    id: "op-5",
    date: "15.11.2026",
    counterparty: "ООО «Курьерская служба 24»",
    purpose: "Доставка заказов покупателям, реестр № 11-15/204",
    amount: 32750,
    amountKind: "expense",
    type: "Расход",
    category: "Логистика и доставка",
    project: "Интернет-магазин",
    ownership: "Бизнес",
    status: "review",
  },
  {
    id: "op-6",
    date: "15.11.2026",
    counterparty: "ООО «Курьерская служба 24»",
    purpose: "Оплата доставки заказов по реестру № 11-15/204",
    amount: 32750,
    amountKind: "expense",
    type: "Расход",
    category: "Логистика и доставка",
    project: "Интернет-магазин",
    ownership: "Бизнес",
    duplicateKind: "possible",
    duplicateOf: "op-5",
    status: "review",
  },
  {
    id: "op-7",
    date: "14.11.2026",
    counterparty: "ФНС России",
    purpose: "Единый налоговый платёж за октябрь 2026 года",
    amount: 24800,
    amountKind: "expense",
    type: "Налоговый платёж",
    category: "Налоги",
    project: "Основное направление",
    ownership: "Бизнес",
    status: "review",
  },
  {
    id: "op-8",
    date: "13.11.2026",
    counterparty: "Перевод между счетами",
    purpose: "Перевод на накопительный счёт •• 2841",
    amount: 100000,
    amountKind: "transfer",
    type: "Перевод между собственными счетами",
    category: "Прочие расходы",
    project: "Без проекта",
    ownership: "Бизнес",
    status: "review",
  },
  {
    id: "op-9",
    date: "12.11.2026",
    counterparty: "ООО «ПакСнаб Поволжье»",
    purpose: "Возврат за недопоставленные коробки по накладной 9082-11/26",
    amount: 8350,
    amountKind: "income",
    type: "Возврат от поставщика",
    category: "Упаковка",
    project: "Интернет-магазин",
    ownership: "Бизнес",
    status: "review",
  },
  {
    id: "op-10",
    date: "11.11.2026",
    counterparty: "ООО «Связь для бизнеса»",
    purpose: "Интернет и корпоративная связь за ноябрь",
    amount: 4290,
    amountKind: "expense",
    type: "Расход",
    category: "Интернет и связь",
    project: "Основное направление",
    ownership: "Бизнес",
    status: "review",
  },
  {
    id: "op-11",
    date: "10.11.2026",
    counterparty: "ООО «Маркетплейс Волга»",
    purpose: "Выплата за реализованные товары по отчёту № 144981",
    amount: 217650,
    amountKind: "income",
    type: "Доход",
    category: "Выручка от продаж",
    project: "Интернет-магазин",
    ownership: "Бизнес",
    status: "review",
  },
  {
    id: "op-12",
    date: "09.11.2026",
    counterparty: "ООО «Северный региональный маркет»",
    purpose: "Оплата оптовой поставки по контракту № СРМ-2026/118",
    amount: 128450900.5,
    amountKind: "income",
    type: "Доход",
    category: "Неопределённое",
    project: "Основное направление",
    ownership: "Неопределённое",
    status: "review",
  },
  {
    id: "op-13",
    date: "08.11.2026",
    counterparty: "ООО «ТехноПром Групп»",
    purpose: "Авансовый платёж за промышленное оборудование по договору № ТП-809",
    amount: 1540000000,
    amountKind: "expense",
    type: "Неопределённая операция",
    category: "Прочие расходы",
    project: "Основное направление",
    ownership: "Бизнес",
    suggestions: {
      category: { confidence: 61, reason: "Предложено по назначению платежа, но назначение недостаточно конкретное" },
    },
    status: "review",
  },
  {
    id: "op-14",
    date: "17.11.2026",
    counterparty: "АО «Т-Банк»",
    purpose: "Комиссия за обслуживание расчётного счёта",
    amount: 1490,
    amountKind: "expense",
    type: "Банковская комиссия",
    category: "Банковские комиссии",
    project: "Основное направление",
    ownership: "Бизнес",
    duplicateKind: "exact",
    duplicateOf: "op-2",
    status: "review",
  },
];

const currencyFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(amount: number) {
  return `${currencyFormatter.format(amount)} ₽`;
}

const filterLabels: { id: QuickFilter; label: string }[] = [
  { id: "all", label: "Все операции" },
  { id: "review", label: "Требуют проверки" },
  { id: "duplicates", label: "Дубликаты" },
  { id: "excluded", label: "Исключённые" },
];

function isUncertainValue(value: string) {
  return value === "Неопределённое" || value === "Неопределённая операция";
}

function FieldConfidence({ suggestion }: { suggestion?: RecognitionSuggestion }) {
  if (!suggestion) return null;
  const confidenceLabel = suggestion.confidence >= 90
    ? "Высокая уверенность"
    : suggestion.confidence > 70
      ? "Средняя уверенность"
      : "Требует проверки";
  const tooltipValue = `${confidenceLabel}: ${suggestion.reason}`;
  return (
    <TruncatedValue
      value={tooltipValue}
      tooltipValue={tooltipValue}
      className="operation-review__confidence"
      tooltipOnHover
      ariaLabel={tooltipValue}
    >
      <ShieldCheck size={11} aria-hidden="true" />
      <span>{suggestion.confidence}%</span>
    </TruncatedValue>
  );
}

export default function BankStatementReview({
  fileName,
  onBack,
}: {
  fileName: string;
  onBack: () => void;
}) {
  const [operations, setOperations] = useState(initialOperations);
  const [filter, setFilter] = useState<QuickFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [openDuplicateId, setOpenDuplicateId] = useState<string | null>(null);
  const [duplicatePopoverPosition, setDuplicatePopoverPosition] = useState({ top: 8, left: 8 });
  const selectAllRef = useRef<HTMLInputElement>(null);
  const duplicateBadgeRef = useRef<HTMLButtonElement>(null);
  const duplicatePopoverRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => ({
    all: operations.filter((operation) => operation.status !== "excluded").length,
    review: operations.filter((operation) => operation.status === "review").length,
    duplicates: operations.filter((operation) => operation.status !== "excluded" && operation.duplicateKind).length,
    excluded: operations.filter((operation) => operation.status === "excluded").length,
  }), [operations]);
  const summaryTotals = useMemo(() => operations.reduce((totals, operation) => {
    if (operation.status !== "excluded" && operation.amountKind !== "transfer") {
      totals[operation.amountKind] += operation.amount;
    }
    return totals;
  }, { income: 0, expense: 0 }), [operations]);

  const visibleOperations = operations.filter((operation) => {
    if (filter === "excluded") return operation.status === "excluded";
    if (filter === "review") return operation.status === "review";
    if (filter === "duplicates") return operation.status !== "excluded" && Boolean(operation.duplicateKind);
    return operation.status !== "excluded";
  });
  const selectableIds = visibleOperations
    .filter((operation) => operation.status === "review" && operation.duplicateKind !== "exact")
    .map((operation) => operation.id);
  const selectedVisibleCount = selectableIds.filter((id) => selectedIds.includes(id)).length;
  const allVisibleSelected = selectableIds.length > 0 && selectedVisibleCount === selectableIds.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected;
    }
  }, [selectedVisibleCount, allVisibleSelected]);

  useEffect(() => {
    if (!openDuplicateId) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!duplicatePopoverRef.current?.contains(target) && !duplicateBadgeRef.current?.contains(target)) {
        setOpenDuplicateId(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenDuplicateId(null);
    };
    const closeOnViewportChange = () => setOpenDuplicateId(null);

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("scroll", closeOnViewportChange, true);
    window.addEventListener("resize", closeOnViewportChange);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("resize", closeOnViewportChange);
    };
  }, [openDuplicateId]);

  const updateOperation = (id: string, updates: Partial<ImportedOperation>) => {
    setOperations((current) => current.map((operation) => (
      operation.id === id ? { ...operation, ...updates } : operation
    )));
  };

  const confirmOperations = (ids: string[]) => {
    if (!ids.length) return;
    setOperations((current) => current.map((operation) => (
      ids.includes(operation.id) ? { ...operation, status: "confirmed" } : operation
    )));
    setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    setNotice(ids.length === 1 ? "Операция подтверждена" : `Подтверждено операций: ${ids.length}`);
    window.setTimeout(() => setNotice(""), 3000);
  };

  const excludeOperation = (id: string) => {
    setOperations((current) => current.map((operation) => (
      operation.id === id ? { ...operation, status: "excluded" } : operation
    )));
    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id));
  };

  const openDuplicatePopover = (operation: ImportedOperation, badge: HTMLButtonElement) => {
    const bounds = badge.getBoundingClientRect();
    const popoverWidth = Math.min(310, window.innerWidth - 16);
    const left = Math.max(8, Math.min(bounds.left, window.innerWidth - popoverWidth - 8));
    const top = bounds.bottom + 8 + 220 <= window.innerHeight
      ? bounds.bottom + 8
      : Math.max(8, bounds.top - 220);
    setDuplicatePopoverPosition({ top, left });
    setOpenDuplicateId((current) => current === operation.id ? null : operation.id);
  };

  const skipPossibleDuplicate = (operation: ImportedOperation) => {
    excludeOperation(operation.id);
    setOpenDuplicateId(null);
    setNotice("Похожий дубликат пропущен");
    window.setTimeout(() => setNotice(""), 3000);
  };

  const keepPossibleDuplicate = (operation: ImportedOperation) => {
    updateOperation(operation.id, { duplicateKind: undefined, duplicateOf: undefined });
    setOpenDuplicateId(null);
    setNotice("Операция оставлена в выписке");
    window.setTimeout(() => setNotice(""), 3000);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : [...current, id]);
  };

  return (
    <section className="operation-review" aria-labelledby="operation-review-title">
      <button type="button" className="operation-review__back" onClick={onBack}>
        <ArrowLeft size={17} />
        <span>Назад к загрузке файла</span>
      </button>

      <header className="operation-review__heading">
        <div>
          <div className="operation-review__title-line">
            <h2 id="operation-review-title">Проверка операций</h2>
            <span className="operation-review__count">{counts.review} требуют проверки</span>
          </div>
          <div className="operation-review__file">
            <FileSpreadsheet size={16} />
            <TruncatedValue value={fileName} strictOverflow className="operation-review__file-name" />
          </div>
        </div>
        <div className="operation-review__summary" aria-label="Сводка импорта">
          <span><strong>{counts.all}</strong> операций в выписке</span>
          <i />
          <span><strong>{counts.duplicates}</strong> дубликата</span>
          <i />
          <span className="operation-review__summary-total">
            <small>Поступления</small>
            <TruncatedValue value={formatCurrency(summaryTotals.income)} strictOverflow className="operation-review__summary-total-value" />
          </span>
          <i />
          <span className="operation-review__summary-total">
            <small>Расходы</small>
            <TruncatedValue value={formatCurrency(summaryTotals.expense)} strictOverflow className="operation-review__summary-total-value" />
          </span>
        </div>
      </header>

      <div className="operation-review__notice">
        <Info size={18} />
        <span>Неподтверждённые операции не попадают в отчётность P&amp;L и Cash Flow до сохранения</span>
      </div>

      <nav className="operation-review__filters" aria-label="Фильтр операций" role="tablist">
        {filterLabels.map(({ id, label }) => (
          <button
            key={id}
            id={`operation-filter-${id}`}
            type="button"
            role="tab"
            aria-selected={filter === id}
            aria-controls="operation-review-table"
            className={filter === id ? "is-active" : ""}
            onClick={() => setFilter(id)}
          >
            <span>{label}</span>
            <i>{counts[id]}</i>
          </button>
        ))}
      </nav>

      {selectedIds.length > 0 && (
        <div className="operation-review__bulkbar" role="status">
          <span>Выбрано: <strong>{selectedIds.length}</strong></span>
          <button type="button" onClick={() => confirmOperations(selectedIds)}>
            <Check size={15} /> Подтвердить выбранные
          </button>
          <button type="button" className="operation-review__bulk-clear" onClick={() => setSelectedIds([])}>
            Снять выделение
          </button>
        </div>
      )}

      <div className="operation-review__table-wrap" id="operation-review-table" role="tabpanel" aria-labelledby={`operation-filter-${filter}`}>
        <table className="operation-review__table">
          <colgroup>
            <col className="operation-review__col-check" />
            <col className="operation-review__col-date" />
            <col className="operation-review__col-details" />
            <col className="operation-review__col-amount" />
            <col className="operation-review__col-type" />
            <col className="operation-review__col-category" />
            <col className="operation-review__col-project" />
            <col className="operation-review__col-owner" />
            <col className="operation-review__col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th className="operation-review__select-cell">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label="Выбрать все операции, требующие проверки"
                  checked={allVisibleSelected}
                  disabled={selectableIds.length === 0}
                  onChange={() => setSelectedIds((current) => (
                    allVisibleSelected
                      ? current.filter((id) => !selectableIds.includes(id))
                      : [...new Set([...current, ...selectableIds])]
                  ))}
                />
                <span className="operation-review__select-all-label">Выбрать все</span>
              </th>
              <th>Дата</th>
              <th>Контрагент и назначение</th>
              <th>Сумма</th>
              <th>Тип операции</th>
              <th>Категория</th>
              <th>Проект</th>
              <th>Принадлежность</th>
              <th aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            {visibleOperations.map((operation) => {
              const isExcluded = operation.status === "excluded";
              const isConfirmed = operation.status === "confirmed";
              const isUncertain = [operation.type, operation.category, operation.ownership].some(isUncertainValue);
              const amountLabel = `${operation.amountKind === "income" ? "+" : operation.amountKind === "expense" ? "−" : ""}${formatCurrency(operation.amount)}`;
              return (
                <tr key={operation.id} className={[
                  isExcluded ? "is-excluded" : "",
                  isConfirmed ? "is-confirmed" : "",
                  operation.duplicateKind && !isExcluded ? `has-${operation.duplicateKind}-duplicate` : "",
                  isUncertain && !isExcluded ? "has-uncertain" : "",
                  selectedIds.includes(operation.id) ? "is-selected" : "",
                ].filter(Boolean).join(" ")}>
                  <td className="operation-review__select-cell">
                    <input
                      type="checkbox"
                      aria-label={`Выбрать операцию: ${operation.counterparty}`}
                      checked={selectedIds.includes(operation.id)}
                      disabled={operation.status !== "review"}
                      onChange={() => toggleSelection(operation.id)}
                    />
                  </td>
                  <td className="operation-review__date">{operation.date}</td>
                  <td className="operation-review__details-cell">
                    <div className="operation-review__details">
                      <div className="operation-review__counterparty-line">
                        <TruncatedValue value={operation.counterparty} strictOverflow className="operation-review__counterparty" />
                        {operation.duplicateKind === "exact" && !isExcluded && (
                          <TruncatedValue
                            value="Точное совпадение с другой операцией в выписке"
                            tooltipValue="Точное совпадение с другой операцией в выписке"
                            className="operation-review__duplicate operation-review__duplicate--exact"
                            tooltipOnHover
                            ariaLabel="Точное совпадение с другой операцией в выписке"
                          >
                            <span aria-hidden="true">!</span> Дубликат
                          </TruncatedValue>
                        )}
                        {operation.duplicateKind === "possible" && !isExcluded && (
                          <button
                            ref={openDuplicateId === operation.id ? duplicateBadgeRef : undefined}
                            type="button"
                            className="operation-review__duplicate operation-review__duplicate--possible"
                            aria-expanded={openDuplicateId === operation.id}
                            aria-label={`Сравнить возможный дубликат: ${operation.counterparty}`}
                            onClick={(event) => openDuplicatePopover(operation, event.currentTarget)}
                          >
                            <span aria-hidden="true">!</span> Возможный дубликат
                          </button>
                        )}
                      </div>
                      <TruncatedValue value={operation.purpose} strictOverflow className="operation-review__purpose" />
                    </div>
                  </td>
                  <td className={`operation-review__amount operation-review__amount--${operation.amountKind}`}>
                    {operation.amountKind === "transfer" ? (
                      <span className="operation-review__transfer">
                        <ArrowLeftRight size={14} />
                        <TruncatedValue value={amountLabel} strictOverflow className="operation-review__amount-value" />
                      </span>
                    ) : (
                      <TruncatedValue value={amountLabel} strictOverflow className="operation-review__amount-value" />
                    )}
                  </td>
                  <td>
                    <div className="operation-review__field-content">
                      <div className="operation-review__field">
                        <CustomSelect
                          ariaLabel={`Тип операции: ${operation.counterparty}`}
                          value={operation.type}
                          options={operationTypeOptions}
                          disabled={isExcluded}
                          menuPortal
                          strictTooltip
                          className={`operation-review__select operation-review__select--type${isUncertainValue(operation.type) ? " operation-review__select--uncertain" : ""}`}
                          onChange={(value) => updateOperation(operation.id, { type: value })}
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
                      <FieldConfidence suggestion={operation.suggestions?.type} />
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
                          onChange={(value) => updateOperation(operation.id, { category: value })}
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
                      <FieldConfidence suggestion={operation.suggestions?.category} />
                    </div>
                  </td>
                  <td>
                    <CustomSelect
                      ariaLabel={`Проект: ${operation.counterparty}`}
                      value={operation.project}
                      options={projectOptions}
                      disabled={isExcluded}
                      menuPortal
                      strictTooltip
                      className="operation-review__select operation-review__select--project"
                      onChange={(value) => updateOperation(operation.id, { project: value })}
                    />
                  </td>
                  <td>
                    <div className="operation-review__field-content">
                      <div className="operation-review__field">
                        <CustomSelect
                          ariaLabel={`Принадлежность: ${operation.counterparty}`}
                          options={ownershipSelectOptions}
                          className={`operation-review__owner operation-review__owner--${operation.ownership === "Бизнес" ? "business" : operation.ownership === "Личное" ? "personal" : "unknown"}${isUncertainValue(operation.ownership) ? " operation-review__select--uncertain" : ""}`}
                          value={operation.ownership}
                          disabled={isExcluded}
                          menuPortal
                          strictTooltip
                          onChange={(value) => updateOperation(operation.id, { ownership: value })}
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
                      <FieldConfidence suggestion={operation.suggestions?.ownership} />
                    </div>
                  </td>
                  <td className="operation-review__actions">
                    {!isExcluded && !isConfirmed ? (
                      <>
                        <button
                          type="button"
                          className="operation-review__confirm"
                          aria-label={`Подтвердить операцию: ${operation.counterparty}`}
                          title="Подтвердить операцию"
                          onClick={() => confirmOperations([operation.id])}
                        >
                          <Check size={16} />
                        </button>
                        <button
                          type="button"
                          className="operation-review__exclude"
                          aria-label={`Исключить из импорта: ${operation.counterparty}`}
                          title="Исключить из импорта"
                          onClick={() => excludeOperation(operation.id)}
                        >
                          <X size={15} />
                        </button>
                      </>
                    ) : (
                      <span className={`operation-review__row-state${isExcluded ? " is-excluded" : ""}`}>
                        {isExcluded ? <><Minus size={14} /> Исключена</> : <><CircleCheck size={14} /> Подтверждена</>}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {openDuplicateId && createPortal((() => {
          const operation = operations.find((candidate) => candidate.id === openDuplicateId);
          if (!operation || operation.duplicateKind !== "possible") return null;
          const matchingOperation = operations.find((candidate) => candidate.id === operation.duplicateOf);
          return (
            <div
              ref={duplicatePopoverRef}
              className="operation-review__duplicate-popover"
              role="dialog"
              aria-label="Сравнение похожих операций"
              style={{ top: duplicatePopoverPosition.top, left: duplicatePopoverPosition.left }}
            >
              <div className="operation-review__duplicate-popover-heading">
                <strong>Похожая операция</strong>
                <button type="button" aria-label="Закрыть сравнение" onClick={() => setOpenDuplicateId(null)}><X size={15} /></button>
              </div>
              {matchingOperation ? (
                <div className="operation-review__duplicate-comparison">
                  <span />
                  <strong>Эта операция</strong>
                  <strong>В выписке</strong>
                  <span>Дата</span><span>{operation.date}</span><span>{matchingOperation.date}</span>
                  <span>Контрагент</span><span>{operation.counterparty}</span><span>{matchingOperation.counterparty}</span>
                  <span>Сумма</span><span>{formatCurrency(operation.amount)}</span><span>{formatCurrency(matchingOperation.amount)}</span>
                  <span>Назначение</span><span>{operation.purpose}</span><span>{matchingOperation.purpose}</span>
                </div>
              ) : (
                <p className="operation-review__duplicate-missing">Сравнение операции недоступно.</p>
              )}
              <div className="operation-review__duplicate-actions">
                <button type="button" className="operation-review__duplicate-skip" onClick={() => skipPossibleDuplicate(operation)}>Пропустить дубликат</button>
                <button type="button" className="operation-review__duplicate-keep" onClick={() => keepPossibleDuplicate(operation)}>Оставить операцию</button>
              </div>
            </div>
          );
        })(), document.body)}
        {visibleOperations.length === 0 && (
          <div className="operation-review__empty">
            <div>{filter === "excluded" ? <X size={19} /> : <CheckCheck size={19} />}</div>
            <strong>{filter === "excluded" ? "Исключённых операций пока нет" : "Операций в этой выборке нет"}</strong>
            <span>{filter === "excluded" ? "Исключённые операции появятся здесь" : "Измените фильтр, чтобы посмотреть другие операции"}</span>
          </div>
        )}
      </div>

      <footer className="operation-review__footer">
        <span>
          <CircleCheck size={15} />
          {counts.review === 0 ? "Все операции проверены" : `${counts.review} операций ожидают подтверждения`}
        </span>
        {notice && <span className="operation-review__toast" role="status"><Check size={14} />{notice}</span>}
        <span>Проверьте назначение и категорию перед подтверждением</span>
      </footer>
    </section>
  );
}
