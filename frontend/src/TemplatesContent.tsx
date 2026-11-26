import { useState } from "react";
import { ArrowDownToLine, ExternalLink, FileSpreadsheet, FileText, Heart, Search, X } from "lucide-react";
import CustomSelect from "./CustomSelect";

const categories = [
  "Учёт доходов и расходов",
  "Управленческая отчётность",
  "Финансовое планирование",
  "Контроль обязательств",
  "Анализ эффективности бизнеса",
] as const;

type TemplateCategory = (typeof categories)[number];
type TemplateAction = "download" | "open" | "source";

type FinancialTemplate = {
  id: string;
  title: string;
  description: string;
  category: TemplateCategory;
  format: "XLSX" | "Google Sheets" | "PDF";
  source: string;
  action: TemplateAction;
};

const templates: FinancialTemplate[] = [
  {
    id: "income-expense",
    title: "Таблица учёта доходов и расходов",
    description: "Фиксируйте поступления и траты, распределяйте операции по статьям и следите за остатком денежных средств.",
    category: "Учёт доходов и расходов",
    format: "XLSX",
    source: "Bifintra",
    action: "download",
  },
  {
    id: "cash-flow",
    title: "Отчёт о движении денежных средств (ОДДС)",
    description: "Сводите денежные потоки по операционной, инвестиционной и финансовой деятельности.",
    category: "Управленческая отчётность",
    format: "Google Sheets",
    source: "Adesk",
    action: "open",
  },
  {
    id: "profit-loss",
    title: "Отчёт о прибылях и убытках (ОПиУ)",
    description: "Анализируйте выручку, расходы и прибыль компании за выбранный период.",
    category: "Управленческая отчётность",
    format: "XLSX",
    source: "Controlum",
    action: "download",
  },
  {
    id: "budget-income-expense",
    title: "Бюджет доходов и расходов (БДР)",
    description: "Планируйте финансовый результат и сравнивайте плановые показатели с фактическими.",
    category: "Финансовое планирование",
    format: "Google Sheets",
    source: "Bifintra",
    action: "open",
  },
  {
    id: "budget-cash-flow",
    title: "Бюджет движения денежных средств (БДДС)",
    description: "Составляйте прогноз поступлений и выплат, чтобы заранее видеть возможные кассовые разрывы.",
    category: "Финансовое планирование",
    format: "XLSX",
    source: "Adesk",
    action: "download",
  },
  {
    id: "payment-calendar",
    title: "Платёжный календарь",
    description: "Распределяйте ожидаемые платежи по датам и контролируйте плановый остаток на счетах.",
    category: "Контроль обязательств",
    format: "Google Sheets",
    source: "Bifintra",
    action: "open",
  },
  {
    id: "receivables-payables",
    title: "Дебиторская и кредиторская задолженность",
    description: "Учитывайте взаиморасчёты с клиентами и поставщиками, сроки оплаты и статус обязательств.",
    category: "Контроль обязательств",
    format: "XLSX",
    source: "Controlum",
    action: "download",
  },
  {
    id: "project-profitability",
    title: "Анализ прибыльности проектов",
    description: "Сопоставляйте доходы, прямые затраты и маржинальность отдельных проектов.",
    category: "Анализ эффективности бизнеса",
    format: "Google Sheets",
    source: "Bifintra",
    action: "open",
  },
  {
    id: "financial-model",
    title: "Финансовая модель бизнеса",
    description: "Оцените ключевые показатели компании и проследите, как сценарии влияют на прибыль и денежный поток.",
    category: "Финансовое планирование",
    format: "XLSX",
    source: "Adesk",
    action: "download",
  },
  {
    id: "pnl",
    title: "P&L для малого бизнеса",
    description: "Соберите управленческий отчёт о доходах, расходах и рентабельности в одном документе.",
    category: "Управленческая отчётность",
    format: "PDF",
    source: "Controlum",
    action: "source",
  },
  {
    id: "cash-flow-forecast",
    title: "Прогноз Cash Flow",
    description: "Планируйте движение денег на несколько месяцев с учётом регулярных поступлений и выплат.",
    category: "Финансовое планирование",
    format: "Google Sheets",
    source: "Adesk",
    action: "open",
  },
  {
    id: "expense-tracker",
    title: "Журнал доходов и расходов",
    description: "Ведите простой реестр операций с датой, категорией, суммой и комментарием.",
    category: "Учёт доходов и расходов",
    format: "XLSX",
    source: "Bifintra",
    action: "download",
  },
  {
    id: "payment-obligations",
    title: "Реестр обязательств и платежей",
    description: "Соберите предстоящие платежи, сроки и ответственных в едином списке.",
    category: "Контроль обязательств",
    format: "PDF",
    source: "Controlum",
    action: "source",
  },
  {
    id: "break-even",
    title: "Точка безубыточности",
    description: "Рассчитайте объём продаж, необходимый для покрытия постоянных и переменных расходов.",
    category: "Анализ эффективности бизнеса",
    format: "XLSX",
    source: "Bifintra",
    action: "download",
  },
  {
    id: "unit-economics",
    title: "Юнит-экономика",
    description: "Оцените доходность продукта или клиента по ключевым метрикам привлечения и удержания.",
    category: "Анализ эффективности бизнеса",
    format: "Google Sheets",
    source: "Adesk",
    action: "open",
  },
];

const actionLabels: Record<TemplateAction, string> = {
  download: "Скачать",
  open: "Открыть",
  source: "Перейти к источнику",
};

function actionDetails(template: FinancialTemplate) {
  if (template.action === "download") {
    return `Файл ${template.format}. Ссылка на скачивание появится здесь после подключения файлового каталога.`;
  }
  if (template.action === "open") {
    return `Онлайн-шаблон ${template.format}. Ссылка для открытия появится здесь после подключения каталога материалов.`;
  }
  return `Источник: ${template.source}. Ссылка на страницу материала появится здесь после подключения каталога.`;
}

export default function TemplatesContent() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<FinancialTemplate | null>(null);

  const filteredTemplates = templates.filter((template) => {
    const matchesCategory = !category || template.category === category;
    const searchText = `${template.title} ${template.description} ${template.category}`.toLocaleLowerCase("ru-RU");
    return matchesCategory && searchText.includes(query.trim().toLocaleLowerCase("ru-RU"));
  });

  const toggleFavorite = (id: string) => {
    setFavorites((current) => current.includes(id)
      ? current.filter((favorite) => favorite !== id)
      : [...current, id]);
  };

  return (
    <section className="templates-page" aria-label="Каталог финансовых шаблонов">
      <div className="templates-toolbar">
        <label className="templates-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию и назначению"
            aria-label="Поиск по названию и назначению шаблона"
          />
          {query && (
            <button type="button" aria-label="Очистить поиск" onClick={() => setQuery("")}>
              <X aria-hidden="true" />
            </button>
          )}
        </label>
        <div className="templates-category-filter">
          <CustomSelect
            value={category}
            options={[
              { value: "", label: "Все категории" },
              ...categories.map((item) => ({ value: item, label: item })),
            ]}
            onChange={setCategory}
            ariaLabel="Фильтр по категориям шаблонов"
            menuPortal
          />
        </div>
      </div>

      <div className="templates-results">
        <p>{filteredTemplates.length} {filteredTemplates.length === 1 ? "шаблон" : filteredTemplates.length >= 2 && filteredTemplates.length <= 4 ? "шаблона" : "шаблонов"}</p>
        {favorites.length > 0 && <span>{favorites.length} в избранном</span>}
      </div>

      {filteredTemplates.length > 0 ? (
        <div className="templates-grid">
          {filteredTemplates.map((template) => {
            const isFavorite = favorites.includes(template.id);
            return (
              <article className="template-card" key={template.id}>
                <div className="template-card__top">
                  <span className="template-card__file-icon" aria-hidden="true">
                    {template.format === "PDF" ? <FileText /> : <FileSpreadsheet />}
                  </span>
                  <button
                    type="button"
                    className={`template-card__favorite${isFavorite ? " is-active" : ""}`}
                    aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                    aria-pressed={isFavorite}
                    onClick={() => toggleFavorite(template.id)}
                  >
                    <Heart aria-hidden="true" />
                  </button>
                </div>
                <span className="template-card__category">{template.category}</span>
                <h2>{template.title}</h2>
                <p className="template-card__description">{template.description}</p>
                <div className="template-card__meta">
                  <span>{template.format}</span>
                  <span>Источник: {template.source}</span>
                </div>
                <div className="template-card__footer">
                  <span className="template-card__free">Бесплатно</span>
                  <button type="button" className="template-card__action" onClick={() => setActiveTemplate(template)}>
                    {template.action === "download" && <ArrowDownToLine aria-hidden="true" />}
                    {template.action === "open" && <ExternalLink aria-hidden="true" />}
                    {template.action === "source" && <ExternalLink aria-hidden="true" />}
                    {actionLabels[template.action]}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="templates-empty">
          <span className="templates-empty__icon"><Search aria-hidden="true" /></span>
          <h2>Шаблоны не найдены</h2>
          <p>Измените поисковый запрос или выберите другую категорию.</p>
          <button type="button" onClick={() => { setQuery(""); setCategory(""); }}>Сбросить фильтры</button>
        </div>
      )}

      {activeTemplate && (
        <div className="templates-modal" role="presentation" onClick={() => setActiveTemplate(null)}>
          <div
            className="templates-modal__card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-action-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="templates-modal__heading">
              <span className="template-card__file-icon" aria-hidden="true">
                {activeTemplate.format === "PDF" ? <FileText /> : <FileSpreadsheet />}
              </span>
              <button type="button" className="template-card__favorite" aria-label="Закрыть" onClick={() => setActiveTemplate(null)}>
                <X aria-hidden="true" />
              </button>
            </div>
            <span className="template-card__category">{activeTemplate.category}</span>
            <h2 id="template-action-title">{activeTemplate.title}</h2>
            <p>{activeTemplate.description}</p>
            <div className="templates-modal__details">
              <span>Формат <strong>{activeTemplate.format}</strong></span>
              <span>Источник <strong>{activeTemplate.source}</strong></span>
            </div>
            <p className="templates-modal__note">{actionDetails(activeTemplate)}</p>
            <button type="button" className="template-card__action" onClick={() => setActiveTemplate(null)}>Понятно</button>
          </div>
        </div>
      )}
    </section>
  );
}
