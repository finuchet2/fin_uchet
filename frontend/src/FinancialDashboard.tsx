import { useEffect, useRef, useState, type SetStateAction } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, Percent } from "lucide-react";
import CustomSelect from "./CustomSelect";
import TruncatedValue from "./TruncatedValue";
import { currencyTruncationThreshold, formatThresholdCurrency } from "./currency";

type OperationType = "income" | "expense" | "tax";

type Operation = {
  id: string;
  type: OperationType;
  category: string;
  project: string;
  date: string;
  periodDate: string;
  comment: string;
  amount: number;
};

type Project = {
  id: string;
  name: string;
  archived: boolean;
};

type PeriodType = "month" | "quarter" | "year";
type ReportView = "absolute" | "percent";
type GroupType = OperationType;

const groupLabels: Record<GroupType, string> = {
  income: "Доходы",
  expense: "Расходы",
  tax: "Налоги",
};

const quarterLabels = ["I квартал", "II квартал", "III квартал", "IV квартал"];

function validDateParts(value: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) return null;
  return { year: Number(year), month: Number(month), date };
}

function periodKey(date: Date, type: PeriodType) {
  const year = date.getFullYear();
  if (type === "year") return String(year);
  if (type === "quarter") return `${year}-Q${Math.floor(date.getMonth() / 3) + 1}`;
  return `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function currentPeriod(type: PeriodType) {
  return periodKey(new Date(), type);
}

function previousPeriod(key: string, type: PeriodType) {
  if (type === "year") return String(Number(key) - 1);
  if (type === "quarter") {
    const [year, quarter] = key.split("-Q").map(Number);
    return quarter === 1 ? `${year - 1}-Q4` : `${year}-Q${quarter - 1}`;
  }
  const [year, month] = key.split("-").map(Number);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
}

function periodLabel(key: string, type: PeriodType) {
  if (type === "year") return key;
  if (type === "quarter") {
    const [year, quarter] = key.split("-Q");
    return `${quarterLabels[Number(quarter) - 1]} ${year}`;
  }
  const [year, month] = key.split("-").map(Number);
  const label = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
  return label.charAt(0).toLocaleUpperCase("ru-RU") + label.slice(1);
}

function periodYear(key: string, type: PeriodType) {
  return Number(type === "quarter" ? key.split("-Q")[0] : key.split("-")[0]);
}

function periodOrder(key: string, type: PeriodType) {
  const year = periodYear(key, type);
  if (type === "year") return year;
  if (type === "quarter") return year * 4 + Number(key.slice(-1));
  return year * 12 + Number(key.slice(-2));
}

function periodsForYear(year: number, type: PeriodType) {
  if (type === "year") return [String(year)];
  if (type === "quarter") {
    return Array.from({ length: 4 }, (_, index) => `${year}-Q${index + 1}`);
  }
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function PeriodPicker({ value, type, onChange, ariaLabel }: {
  value: string;
  type: PeriodType;
  onChange: (period: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => periodYear(value, type));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setViewYear(periodYear(value, type));
  }, [value, type]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="period-picker" ref={containerRef}>
      <button
        type="button"
        className="period-picker__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{periodLabel(value, type)}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      {open && (
        <div className="period-picker__menu">
          <div className="period-picker__year">
            <button
              type="button"
              aria-label="Предыдущий год"
              disabled={viewYear <= 1000}
              onClick={() => setViewYear((year) => Math.max(1000, year - 1))}
            >
              ‹
            </button>
            <strong>{viewYear}</strong>
            <button
              type="button"
              aria-label="Следующий год"
              disabled={viewYear >= 9999}
              onClick={() => setViewYear((year) => Math.min(9999, year + 1))}
            >
              ›
            </button>
          </div>
          <div className="period-picker__options" role="listbox" aria-label={ariaLabel}>
            {periodsForYear(viewYear, type).map((period) => (
              <button
                key={period}
                type="button"
                role="option"
                aria-selected={period === value}
                className={period === value ? "is-selected" : ""}
                onClick={() => { onChange(period); setOpen(false); }}
              >
                {periodLabel(period, type)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function isPeriodKey(value: string, type: PeriodType) {
  if (type === "year") return /^\d{4}$/.test(value);
  if (type === "quarter") return /^\d{4}-Q[1-4]$/.test(value);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function matchesPeriod(operation: Operation, key: string, type: PeriodType, method: "pnl" | "cashflow") {
  const date = validDateParts(method === "pnl" ? operation.periodDate : operation.date);
  return date !== null && periodKey(date.date, type) === key;
}

function currency(value: number, signed = false) {
  return formatThresholdCurrency(value, signed).display;
}

function exactCurrency(value: number, signed = false) {
  return formatThresholdCurrency(value, signed).exact;
}

function operationWord(count: number) {
  const lastTwoDigits = count % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return "операций";
  const lastDigit = count % 10;
  if (lastDigit === 1) return "операция";
  if (lastDigit >= 2 && lastDigit <= 4) return "операции";
  return "операций";
}

function percent(value: number, income: number) {
  if (income === 0) return "0%";
  return `${((value / income) * 100).toLocaleString("ru-RU", {
    maximumFractionDigits: 2,
  })}%`;
}

function amountFor(operation: Operation) {
  return Math.abs(operation.amount);
}

function ProjectOptions({
  projects,
  selection,
  onToggle,
  onSelectAll,
}: {
  projects: Project[];
  selection: string[];
  onToggle: (name: string) => void;
  onSelectAll: () => void;
}) {
  const allSelected = selection.length === 0;
  return (
    <div className="project-multi__options" role="group" aria-label="Выбор проектов">
      <button
        type="button"
        className="project-multi__option"
        aria-pressed={allSelected}
        onClick={onSelectAll}
      >
        <span className={`project-multi__checkbox${allSelected ? " is-checked" : ""}`} aria-hidden="true" />
        <span className="project-multi__label">Все проекты</span>
      </button>
      {projects.length > 0 && <div className="project-multi__divider" aria-hidden="true" />}
      {projects.map((project) => (
        <button
          type="button"
          className="project-multi__option"
          key={project.id}
          aria-pressed={allSelected || selection.includes(project.name)}
          onClick={() => onToggle(project.name)}
        >
          <span
            className={`project-multi__checkbox${allSelected || selection.includes(project.name) ? " is-checked" : ""}`}
            aria-hidden="true"
          />
          <span className="project-multi__label">{project.name}{project.archived ? " (архив)" : ""}</span>
        </button>
      ))}
      {projects.length === 0 && <p className="project-multi__empty">Проектов пока нет</p>}
    </div>
  );
}

export default function FinancialDashboard({
  projects,
  operations,
  periodType,
  selectedPeriod,
  onPeriodChange,
  selectedProjects: controlledSelectedProjects,
  onSelectedProjectsChange,
}: {
  projects: Project[];
  operations: Operation[];
  periodType: PeriodType;
  selectedPeriod: string;
  onPeriodChange: (type: PeriodType, period: string) => void;
  selectedProjects?: string[];
  onSelectedProjectsChange?: (names: string[]) => void;
}) {
  const [accountingMethod, setAccountingMethod] = useState<"pnl" | "cashflow">("pnl");
  const [reportView, setReportView] = useState<ReportView>("absolute");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [comparisonPeriod, setComparisonPeriod] = useState("");
  const [localSelectedProjects, setLocalSelectedProjects] = useState<string[]>([]);
  const selectedProjects = controlledSelectedProjects ?? localSelectedProjects;
  const setSelectedProjects = (next: SetStateAction<string[]>) => {
    const value = typeof next === "function" ? next(selectedProjects) : next;
    if (onSelectedProjectsChange) onSelectedProjectsChange(value);
    else setLocalSelectedProjects(value);
  };
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [draftProjects, setDraftProjects] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<GroupType, boolean>>({
    income: true,
    expense: true,
    tax: true,
  });
  const projectPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!projectPickerOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!isMobile && event.target instanceof Node && !projectPickerRef.current?.contains(event.target)) {
        setProjectPickerOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProjectPickerOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [projectPickerOpen, isMobile]);

  const effectivePeriod = selectedPeriod;
  const effectiveComparison = isPeriodKey(comparisonPeriod, periodType)
    ? comparisonPeriod
    : previousPeriod(effectivePeriod, periodType);
  const filteredOperations = operations.filter((operation) =>
    selectedProjects.length === 0 || selectedProjects.includes(operation.project),
  );
  const operationTimestamp = (operation: Operation) =>
    validDateParts(accountingMethod === "pnl" ? operation.periodDate : operation.date)?.date.getTime() ?? 0;
  const periodOperations = filteredOperations.filter((operation) =>
    matchesPeriod(operation, effectivePeriod, periodType, accountingMethod),
  ).sort((a, b) => operationTimestamp(b) - operationTimestamp(a));
  const comparisonOperations = compareEnabled
    ? filteredOperations.filter((operation) =>
        matchesPeriod(operation, effectiveComparison, periodType, accountingMethod),
      )
    : [];

  const summarize = (items: Operation[]) => {
    const totals: Record<GroupType, number> = { income: 0, expense: 0, tax: 0 };
    const categories: Record<GroupType, Map<string, number>> = {
      income: new Map(),
      expense: new Map(),
      tax: new Map(),
    };
    for (const operation of items) {
      const amount = amountFor(operation);
      totals[operation.type] += amount;
      categories[operation.type].set(
        operation.category,
        (categories[operation.type].get(operation.category) ?? 0) + amount,
      );
    }
    return {
      totals,
      categories,
      profit: totals.income - totals.expense - totals.tax,
    };
  };

  const first = summarize(periodOperations);
  const second = summarize(comparisonOperations);
  const comparisonIsEarlier = compareEnabled
    && periodOrder(effectiveComparison, periodType) < periodOrder(effectivePeriod, periodType);
  const tableFirst = comparisonIsEarlier ? second : first;
  const tableSecond = comparisonIsEarlier ? first : second;
  const tableFirstPeriod = comparisonIsEarlier ? effectiveComparison : effectivePeriod;
  const tableSecondPeriod = comparisonIsEarlier ? effectivePeriod : effectiveComparison;
  const formatReportValue = (value: number, income: number, signed = false) =>
    reportView === "absolute" ? currency(value, signed) : percent(value, income);
  const formatExactReportValue = (value: number, income: number, signed = false) =>
    reportView === "absolute" ? exactCurrency(value, signed) : percent(value, income);
  const projectLabel = selectedProjects.length === 0
    ? "Все проекты"
    : selectedProjects.length === 1
      ? selectedProjects[0]
      : `Выбрано: ${selectedProjects.length}`;

  const updateSelection = (current: string[], name: string, allNames: string[]) => {
    const base = current.length === 0 ? allNames : current;
    const next = base.includes(name) ? base.filter((item) => item !== name) : [...base, name];
    return next.length === allNames.length ? [] : next;
  };

  const openProjectPicker = () => {
    setDraftProjects(selectedProjects);
    setProjectPickerOpen(true);
  };

  const selectAllDraft = () => setDraftProjects([]);
  const categoryRows = (group: GroupType) => {
    const names = new Set(first.categories[group].keys());
    if (compareEnabled) second.categories[group].forEach((_, name) => names.add(name));
    return [...names].sort((a, b) => a.localeCompare(b, "ru"));
  };

  const groupValue = (summary: ReturnType<typeof summarize>, group: GroupType) =>
    summary.totals[group];
  const groupIncome = (summary: ReturnType<typeof summarize>) => summary.totals.income;
  const deltaPercent = (base: number, next: number) => {
    if (base === 0) return next === 0 ? "0%" : "—";
    const change = ((next - base) / Math.abs(base)) * 100;
    return `${change > 0 ? "+" : ""}${change.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
  };
  const varianceClass = (type: GroupType | "profit", delta: number) => {
    if (delta === 0) return "variance--neutral";
    const favorable = type === "expense" || type === "tax" ? delta < 0 : delta > 0;
    return favorable ? "variance--good" : "variance--bad";
  };

  return (
    <>
      <section className="dashboard-filters dashboard-filters--report" aria-label="Фильтры отчёта">
        <div className="dashboard-filter">
          <label className="dashboard-filter__label" htmlFor="dashboard-period-type">Период</label>
          <CustomSelect
            id="dashboard-period-type"
            className="dashboard-native-select"
            ariaLabel="Период"
            value={periodType}
            onChange={(value) => {
              const nextType = value as PeriodType;
              const nextPeriod = currentPeriod(nextType);
              onPeriodChange(nextType, nextPeriod);
              setComparisonPeriod(previousPeriod(nextPeriod, nextType));
            }}
            options={[
              { value: "month", label: "Месяц" },
              { value: "quarter", label: "Квартал" },
              { value: "year", label: "Год" },
            ]}
          />
          <PeriodPicker
            ariaLabel={`Выберите ${periodType === "month" ? "месяц" : periodType === "quarter" ? "квартал" : "год"}`}
            value={effectivePeriod}
            type={periodType}
            onChange={(nextPeriod) => {
              if (!comparisonPeriod || comparisonPeriod === previousPeriod(effectivePeriod, periodType)) {
                setComparisonPeriod(previousPeriod(nextPeriod, periodType));
              }
              onPeriodChange(periodType, nextPeriod);
            }}
          />
        </div>

        <div className="dashboard-filter dashboard-filter--project">
          <span className="dashboard-filter__label">Проекты</span>
          <div className="project-multi" ref={projectPickerRef}>
            <button
              type="button"
              className="project-multi__trigger"
              aria-haspopup={isMobile ? "dialog" : "listbox"}
              aria-expanded={projectPickerOpen}
              onClick={() => {
                if (projectPickerOpen) setProjectPickerOpen(false);
                else openProjectPicker();
              }}
            >
              <span>{projectLabel}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
            </button>
            <div className={`project-multi__desktop ${projectPickerOpen && !isMobile ? "is-open" : ""}`}>
              <ProjectOptions
                projects={projects}
                selection={selectedProjects}
                onToggle={(name) => setSelectedProjects((current) => updateSelection(current, name, projects.map((project) => project.name)))}
                onSelectAll={() => setSelectedProjects([])}
              />
            </div>
          </div>
        </div>

        <div className="dashboard-filter dashboard-filter--method">
          <span className="dashboard-filter__label">Метод учёта</span>
          <div className="dashboard-segmented">
            <button type="button" className={accountingMethod === "pnl" ? "is-active" : ""} onClick={() => setAccountingMethod("pnl")}>Метод начисления</button>
            <button type="button" className={accountingMethod === "cashflow" ? "is-active" : ""} onClick={() => setAccountingMethod("cashflow")}>Кассовый метод</button>
          </div>
        </div>

        <div className="dashboard-filter dashboard-filter--view">
          <span className="dashboard-filter__label">Вид отчёта</span>
          <div className="dashboard-segmented">
            <button type="button" className={reportView === "absolute" ? "is-active" : ""} onClick={() => setReportView("absolute")}>Суммы ₽</button>
            <button type="button" className={reportView === "percent" ? "is-active" : ""} onClick={() => setReportView("percent")}>Проценты %</button>
          </div>
        </div>

        <div className="dashboard-filter dashboard-filter--compare">
          <span className="dashboard-filter__label">Сравнение</span>
          <label className="dashboard-compare-toggle">
            <input
              type="checkbox"
              checked={compareEnabled}
              onChange={(event) => {
                setCompareEnabled(event.target.checked);
                if (event.target.checked) {
                  setComparisonPeriod(previousPeriod(effectivePeriod, periodType));
                }
              }}
            />
            <span className="dashboard-compare-toggle__indicator" aria-hidden="true" />
            <span className="dashboard-compare-toggle__text">Сравнить с периодом</span>
          </label>
          {compareEnabled && (
            <PeriodPicker
              ariaLabel="Выберите период для сравнения"
              value={effectiveComparison}
              type={periodType}
              onChange={setComparisonPeriod}
            />
          )}
        </div>
      </section>

      {projectPickerOpen && isMobile && (
        <div className="project-sheet-backdrop" role="presentation" onClick={() => setProjectPickerOpen(false)}>
          <section
            className="project-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-sheet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="project-sheet__heading">
              <h2 id="project-sheet-title">Проекты</h2>
              <button type="button" aria-label="Закрыть" onClick={() => setProjectPickerOpen(false)}>×</button>
            </div>
            <div className="project-sheet__actions">
              <button type="button" onClick={selectAllDraft}>Выбрать все</button>
              <button type="button" onClick={() => setDraftProjects([])}>Сбросить</button>
            </div>
            <ProjectOptions
              projects={projects}
              selection={draftProjects}
              onToggle={(name) => setDraftProjects((current) => updateSelection(current, name, projects.map((project) => project.name)))}
              onSelectAll={selectAllDraft}
            />
            <div className="project-sheet__footer">
              <button type="button" className="project-sheet__apply" onClick={() => { setSelectedProjects(draftProjects); setProjectPickerOpen(false); }}>Применить</button>
            </div>
          </section>
        </div>
      )}

      <section className="report-summary" aria-label="Ключевые показатели периода">
        {[
          { title: "Доходы", value: first.totals.income, className: "report-summary-card--income", group: "income" as const },
          { title: "Расходы", value: first.totals.expense, className: "report-summary-card--expense", group: "expense" as const },
          { title: "Налоги", value: first.totals.tax, className: "report-summary-card--tax", group: "tax" as const },
          { title: "Чистая прибыль / Итог периода", value: first.profit, className: "report-summary-card--profit", signed: true },
        ].map((item) => (
          <article className={`report-summary-card ${item.className}`} key={item.title}>
            <div className="report-summary-card__head">
              <p>{item.title}</p>
              {item.className !== "report-summary-card--profit" && (
                <span className="report-summary-card__icon" aria-hidden="true">
                  {item.className === "report-summary-card--income" && <ArrowUpRight />}
                  {item.className === "report-summary-card--expense" && <ArrowDownRight />}
                  {item.className === "report-summary-card--tax" && <Percent />}
                </span>
              )}
            </div>
            <strong>
              <TruncatedValue
                className={`report-summary-card__value${Math.abs(item.value) >= 10_000_000 ? " report-summary-card__value--large" : Math.abs(item.value) >= 1_000_000 ? " report-summary-card__value--medium" : ""}`}
                value={formatReportValue(item.value, first.totals.income, "signed" in item && item.signed)}
                tooltipValue={formatExactReportValue(item.value, first.totals.income, "signed" in item && item.signed)}
                showTooltip={reportView === "percent" || Math.abs(item.value) >= currencyTruncationThreshold}
              />
            </strong>
            <small>
              {periodLabel(effectivePeriod, periodType)} · {accountingMethod === "pnl" ? "Метод начисления" : "Кассовый метод"}
            </small>
          </article>
        ))}
      </section>

      <section className="financial-report" aria-label="Финансовый отчёт по категориям">
        <div className="financial-report__heading">
          <div><p>ОТЧЁТ ЗА ПЕРИОД</p><h2>Финансовый отчёт по категориям</h2></div>
          <div className="financial-report__context">
            <span>{periodLabel(effectivePeriod, periodType)}</span>
            <span>{periodOperations.length} {operationWord(periodOperations.length)}</span>
          </div>
        </div>
        <div className={`financial-table financial-table--report ${compareEnabled ? "is-comparing" : ""}`}>
          <div className="financial-table__header">
            <span>Статья</span>
            <span>{compareEnabled ? periodLabel(tableFirstPeriod, periodType).toLocaleUpperCase("ru-RU") : periodLabel(effectivePeriod, periodType)}</span>
            {compareEnabled && <span>{periodLabel(tableSecondPeriod, periodType).toLocaleUpperCase("ru-RU")}</span>}
            {compareEnabled && <span>Отклонение (Δ ₽ / %)</span>}
          </div>
          {(["income", "expense", "tax"] as const).map((group) => {
            const firstTotal = groupValue(tableFirst, group);
            const secondTotal = groupValue(tableSecond, group);
            const delta = secondTotal - firstTotal;
            return (
              <section className="financial-group" key={group}>
                <button
                  type="button"
                  className={`financial-group__total financial-group__total--${group}`}
                  aria-expanded={expandedGroups[group]}
                  onClick={() => setExpandedGroups((current) => ({ ...current, [group]: !current[group] }))}
                >
                  <span>
                    <i className="financial-group__chevron" aria-hidden="true">
                      {expandedGroups[group] ? <ChevronDown /> : <ChevronRight />}
                    </i>
                    <strong>{groupLabels[group]}</strong>
                  </span>
                  <strong><TruncatedValue className={`financial-report-value${Math.abs(firstTotal) >= 1_000_000 ? " financial-report-value--large" : ""}`} value={formatReportValue(firstTotal, groupIncome(tableFirst))} tooltipValue={formatExactReportValue(firstTotal, groupIncome(tableFirst))} showTooltip={reportView === "percent" || Math.abs(firstTotal) >= currencyTruncationThreshold} /></strong>
                  {compareEnabled && <strong><TruncatedValue className={`financial-report-value${Math.abs(secondTotal) >= 1_000_000 ? " financial-report-value--large" : ""}`} value={formatReportValue(secondTotal, groupIncome(tableSecond))} tooltipValue={formatExactReportValue(secondTotal, groupIncome(tableSecond))} showTooltip={reportView === "percent" || Math.abs(secondTotal) >= currencyTruncationThreshold} /></strong>}
                  {compareEnabled && (
                    <strong className={varianceClass(group, delta)}>
                      <TruncatedValue
                        className={`financial-report-value${Math.abs(delta) >= 1_000_000 ? " financial-report-value--large" : ""}`}
                        value={`${currency(delta, true)} ${deltaPercent(firstTotal, secondTotal)}`}
                        tooltipValue={`${exactCurrency(delta, true)} ${deltaPercent(firstTotal, secondTotal)}`}
                        showTooltip={reportView === "percent" || Math.abs(delta) >= currencyTruncationThreshold}
                      >
                        <>{currency(delta, true)}<small>{deltaPercent(firstTotal, secondTotal)}</small></>
                      </TruncatedValue>
                    </strong>
                  )}
                </button>
                {expandedGroups[group] && categoryRows(group).map((category) => {
                  const value1 = tableFirst.categories[group].get(category) ?? 0;
                  const value2 = tableSecond.categories[group].get(category) ?? 0;
                  const categoryDelta = value2 - value1;
                  return (
                    <div className="financial-table__row" key={`${group}-${category}`}>
                      <span>{category}</span>
                      <strong><TruncatedValue className={`financial-report-value${Math.abs(value1) >= 1_000_000 ? " financial-report-value--large" : ""}`} value={formatReportValue(value1, groupIncome(tableFirst))} tooltipValue={formatExactReportValue(value1, groupIncome(tableFirst))} showTooltip={reportView === "percent" || Math.abs(value1) >= currencyTruncationThreshold} /></strong>
                      {compareEnabled && <strong><TruncatedValue className={`financial-report-value${Math.abs(value2) >= 1_000_000 ? " financial-report-value--large" : ""}`} value={formatReportValue(value2, groupIncome(tableSecond))} tooltipValue={formatExactReportValue(value2, groupIncome(tableSecond))} showTooltip={reportView === "percent" || Math.abs(value2) >= currencyTruncationThreshold} /></strong>}
                      {compareEnabled && (
                        <strong className={varianceClass(group, categoryDelta)}>
                          <TruncatedValue
                            className={`financial-report-value${Math.abs(categoryDelta) >= 1_000_000 ? " financial-report-value--large" : ""}`}
                            value={`${currency(categoryDelta, true)} ${deltaPercent(value1, value2)}`}
                            tooltipValue={`${exactCurrency(categoryDelta, true)} ${deltaPercent(value1, value2)}`}
                            showTooltip={reportView === "percent" || Math.abs(categoryDelta) >= currencyTruncationThreshold}
                          >
                            <>{currency(categoryDelta, true)}<small>{deltaPercent(value1, value2)}</small></>
                          </TruncatedValue>
                        </strong>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
          <div className="financial-table__profit">
            <span><i aria-hidden="true">=</i><strong>Чистая прибыль (Итог периода)</strong></span>
            <strong><TruncatedValue className={`financial-report-value${Math.abs(tableFirst.profit) >= 1_000_000 ? " financial-report-value--large" : ""}`} value={formatReportValue(tableFirst.profit, tableFirst.totals.income, true)} tooltipValue={formatExactReportValue(tableFirst.profit, tableFirst.totals.income, true)} showTooltip={reportView === "percent" || Math.abs(tableFirst.profit) >= currencyTruncationThreshold} /></strong>
            {compareEnabled && <strong><TruncatedValue className={`financial-report-value${Math.abs(tableSecond.profit) >= 1_000_000 ? " financial-report-value--large" : ""}`} value={formatReportValue(tableSecond.profit, tableSecond.totals.income, true)} tooltipValue={formatExactReportValue(tableSecond.profit, tableSecond.totals.income, true)} showTooltip={reportView === "percent" || Math.abs(tableSecond.profit) >= currencyTruncationThreshold} /></strong>}
            {compareEnabled && (
              <strong className={varianceClass("profit", tableSecond.profit - tableFirst.profit)}>
                <TruncatedValue
                  className={`financial-report-value${Math.abs(tableSecond.profit - tableFirst.profit) >= 1_000_000 ? " financial-report-value--large" : ""}`}
                  value={`${currency(tableSecond.profit - tableFirst.profit, true)} ${deltaPercent(tableFirst.profit, tableSecond.profit)}`}
                  tooltipValue={`${exactCurrency(tableSecond.profit - tableFirst.profit, true)} ${deltaPercent(tableFirst.profit, tableSecond.profit)}`}
                  showTooltip={reportView === "percent" || Math.abs(tableSecond.profit - tableFirst.profit) >= currencyTruncationThreshold}
                >
                  <>{currency(tableSecond.profit - tableFirst.profit, true)}<small>{deltaPercent(tableFirst.profit, tableSecond.profit)}</small></>
                </TruncatedValue>
              </strong>
            )}
          </div>
        </div>
        {periodOperations.length === 0 && (
          <p className="financial-report__empty">За выбранный период операций нет. Отчёт показывает нулевые значения.</p>
        )}
      </section>

    </>
  );
}
