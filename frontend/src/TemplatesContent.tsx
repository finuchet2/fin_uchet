import { useEffect, useState } from "react";
import { AlertCircle, ArrowDownToLine, ExternalLink, FileSpreadsheet, FileText, Heart, Search, X } from "lucide-react";
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
  sourceUrl?: string;
  action: TemplateAction;
  available: boolean;
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
    available: true,
  },
  {
    id: "cash-flow",
    title: "Отчёт о движении денежных средств (ОДДС)",
    description: "Сводите денежные потоки по операционной, инвестиционной и финансовой деятельности.",
    category: "Управленческая отчётность",
    format: "Google Sheets",
    source: "Adesk",
    action: "open",
    available: true,
  },
  {
    id: "profit-loss",
    title: "Отчёт о прибылях и убытках (ОПиУ)",
    description: "Анализируйте выручку, расходы и прибыль компании за выбранный период.",
    category: "Управленческая отчётность",
    format: "XLSX",
    source: "Controlum",
    action: "download",
    available: true,
  },
  {
    id: "budget-income-expense",
    title: "Бюджет доходов и расходов (БДР)",
    description: "Планируйте финансовый результат и сравнивайте плановые показатели с фактическими.",
    category: "Финансовое планирование",
    format: "Google Sheets",
    source: "Bifintra",
    action: "open",
    available: true,
  },
  {
    id: "budget-cash-flow",
    title: "Бюджет движения денежных средств (БДДС)",
    description: "Составляйте прогноз поступлений и выплат, чтобы заранее видеть возможные кассовые разрывы.",
    category: "Финансовое планирование",
    format: "XLSX",
    source: "Adesk",
    action: "download",
    available: true,
  },
  {
    id: "payment-calendar",
    title: "Платёжный календарь",
    description: "Распределяйте ожидаемые платежи по датам и контролируйте плановый остаток на счетах.",
    category: "Контроль обязательств",
    format: "Google Sheets",
    source: "Bifintra",
    action: "open",
    available: false,
  },
  {
    id: "receivables-payables",
    title: "Дебиторская и кредиторская задолженность",
    description: "Учитывайте взаиморасчёты с клиентами и поставщиками, сроки оплаты и статус обязательств.",
    category: "Контроль обязательств",
    format: "XLSX",
    source: "Controlum",
    action: "download",
    available: true,
  },
  {
    id: "project-profitability",
    title: "Анализ прибыльности проектов",
    description: "Сопоставляйте доходы, прямые затраты и маржинальность отдельных проектов.",
    category: "Анализ эффективности бизнеса",
    format: "Google Sheets",
    source: "Bifintra",
    action: "open",
    available: true,
  },
  {
    id: "financial-model",
    title: "Финансовая модель бизнеса",
    description: "Оцените ключевые показатели компании и проследите, как сценарии влияют на прибыль и денежный поток.",
    category: "Финансовое планирование",
    format: "XLSX",
    source: "Adesk",
    action: "download",
    available: true,
  },
  {
    id: "pnl",
    title: "P&L для малого бизнеса",
    description: "Соберите управленческий отчёт о доходах, расходах и рентабельности в одном документе.",
    category: "Управленческая отчётность",
    format: "PDF",
    source: "Controlum",
    action: "source",
    available: true,
  },
  {
    id: "cash-flow-forecast",
    title: "Прогноз Cash Flow",
    description: "Планируйте движение денег на несколько месяцев с учётом регулярных поступлений и выплат.",
    category: "Финансовое планирование",
    format: "Google Sheets",
    source: "Adesk",
    action: "open",
    available: true,
  },
  {
    id: "expense-tracker",
    title: "Журнал доходов и расходов",
    description: "Ведите простой реестр операций с датой, категорией, суммой и комментарием.",
    category: "Учёт доходов и расходов",
    format: "XLSX",
    source: "Bifintra",
    action: "download",
    available: true,
  },
  {
    id: "payment-obligations",
    title: "Реестр обязательств и платежей",
    description: "Соберите предстоящие платежи, сроки и ответственных в едином списке.",
    category: "Контроль обязательств",
    format: "PDF",
    source: "Controlum",
    action: "source",
    available: true,
  },
  {
    id: "break-even",
    title: "Точка безубыточности",
    description: "Рассчитайте объём продаж, необходимый для покрытия постоянных и переменных расходов.",
    category: "Анализ эффективности бизнеса",
    format: "XLSX",
    source: "Bifintra",
    action: "download",
    available: true,
  },
  {
    id: "unit-economics",
    title: "Юнит-экономика",
    description: "Оцените доходность продукта или клиента по ключевым метрикам привлечения и удержания.",
    category: "Анализ эффективности бизнеса",
    format: "Google Sheets",
    source: "Adesk",
    action: "open",
    available: true,
  },
];

const actionLabels: Record<TemplateAction, string> = {
  download: "Скачать",
  open: "Открыть",
  source: "Перейти к источнику",
};

const sourceUrls: Record<string, string> = {
  Adesk: "https://adesk.ru",
};

const templatesWithSources = templates.map((template) => ({
  ...template,
  sourceUrl: sourceUrls[template.source],
}));

const categoryDetails: Record<TemplateCategory, { tasks: string; audience: string }> = {
  "Учёт доходов и расходов": {
    tasks: "Фиксировать операции, распределять их по статьям и отслеживать остаток денежных средств.",
    audience: "Предпринимателям и небольшим компаниям, которым нужен простой регулярный учёт.",
  },
  "Управленческая отчётность": {
    tasks: "Сводить финансовые показатели за период и анализировать доходы, расходы и денежные потоки.",
    audience: "Руководителям и владельцам бизнеса, которые принимают решения на основе финансовых результатов.",
  },
  "Финансовое планирование": {
    tasks: "Планировать будущие доходы и расходы, прогнозировать денежный поток и сравнивать план с фактом.",
    audience: "Предпринимателям и финансовым специалистам, которые планируют бюджет или оценивают сценарии.",
  },
  "Контроль обязательств": {
    tasks: "Учитывать задолженности, планировать платежи и контролировать сроки исполнения обязательств.",
    audience: "Владельцам бизнеса и сотрудникам, отвечающим за платежи и взаиморасчёты.",
  },
  "Анализ эффективности бизнеса": {
    tasks: "Оценивать прибыльность проектов, продуктов и ключевые показатели эффективности.",
    audience: "Предпринимателям и руководителям, которым важно понимать рентабельность бизнеса.",
  },
};

export default function TemplatesContent() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<FinancialTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 350);
    return () => window.clearTimeout(timer);
  }, [category, query]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!activeTemplate) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveTemplate(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTemplate]);

  const filteredTemplates = templatesWithSources.filter((template) => {
    const matchesCategory = !category || template.category === category;
    const searchText = `${template.title} ${template.description} ${template.category}`.toLocaleLowerCase("ru-RU");
    return matchesCategory && searchText.includes(query.trim().toLocaleLowerCase("ru-RU"));
  });

  const toggleFavorite = (id: string) => {
    setFavorites((current) => current.includes(id)
      ? current.filter((favorite) => favorite !== id)
      : [...current, id]);
  };

  const closeTemplateDetails = () => {
    setActiveTemplate(null);
  };

  const showActionError = (template: FinancialTemplate) => {
    setToast(template.action === "download"
      ? "Не удалось загрузить файл. Попробуйте скачать его позже."
      : "Не удалось открыть материал. Проверьте подключение и попробуйте ещё раз.");
  };

  return (
    <section className="templates-page" aria-label="Каталог финансовых шаблонов">
      <div className="templates-toolbar">
        <label className="templates-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setIsLoading(true);
              setQuery(event.target.value);
            }}
            placeholder="Поиск по названию и назначению"
            aria-label="Поиск по названию и назначению шаблона"
          />
          {query && (
            <button type="button" aria-label="Очистить поиск" onClick={() => { setIsLoading(true); setQuery(""); }}>
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
            onChange={(value) => {
              setIsLoading(true);
              setCategory(value);
            }}
            ariaLabel="Фильтр по категориям шаблонов"
            menuPortal
          />
        </div>
      </div>

      <div className="templates-results">
        <p>{isLoading ? "Загружаем шаблоны…" : `${filteredTemplates.length} ${filteredTemplates.length === 1 ? "шаблон" : filteredTemplates.length >= 2 && filteredTemplates.length <= 4 ? "шаблона" : "шаблонов"}`}</p>
        {favorites.length > 0 && <span>{favorites.length} в избранном</span>}
      </div>

      {isLoading ? (
        <div className="templates-grid templates-grid--loading" role="status" aria-label="Загружаем шаблоны">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="template-skeleton" key={index} aria-hidden="true">
              <div className="template-skeleton__top"><span /><i /></div>
              <span className="template-skeleton__category" />
              <span className="template-skeleton__title" />
              <span className="template-skeleton__description" />
              <span className="template-skeleton__description template-skeleton__description--short" />
              <div className="template-skeleton__footer"><span /><i /></div>
            </div>
          ))}
        </div>
      ) : filteredTemplates.length > 0 ? (
        <div className="templates-grid">
          {filteredTemplates.map((template) => {
            const isFavorite = favorites.includes(template.id);
            return (
              <article
                className="template-card"
                key={template.id}
                role="button"
                tabIndex={0}
                aria-label={`Подробнее о шаблоне «${template.title}»`}
                onClick={() => setActiveTemplate(template)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveTemplate(template);
                  }
                }}
              >
                <div className="template-card__top">
                  <span className="template-card__file-icon" aria-hidden="true">
                    {template.format === "PDF" ? <FileText /> : <FileSpreadsheet />}
                  </span>
                  <button
                    type="button"
                    className={`template-card__favorite${isFavorite ? " is-active" : ""}`}
                    aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                    aria-pressed={isFavorite}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleFavorite(template.id);
                    }}
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
                  {template.available ? (
                    <span className="template-card__free">Бесплатно</span>
                  ) : (
                    <span className="template-card__unavailable">Временно недоступен</span>
                  )}
                  <button
                    type="button"
                    className={`template-card__action${template.available ? "" : " is-disabled"}`}
                    disabled={!template.available}
                    title={template.available ? undefined : "Материал временно недоступен"}
                    onClick={(event) => {
                      event.stopPropagation();
                      showActionError(template);
                    }}
                  >
                    {template.available && template.action === "download" && <ArrowDownToLine aria-hidden="true" />}
                    {template.available && template.action !== "download" && <ExternalLink aria-hidden="true" />}
                    {template.available ? actionLabels[template.action] : "Недоступен"}
                  </button>
                </div>
                {!template.available && (
                  <p className="template-card__availability-note">Материал временно недоступен. Откройте карточку, чтобы узнать подробнее.</p>
                )}
              </article>
            );
          })}
        </div>
      ) : query.trim() ? (
        <div className="templates-empty">
          <span className="templates-empty__icon"><Search aria-hidden="true" /></span>
          <h2>Ничего не найдено</h2>
          <p>По вашему запросу ничего не найдено. Попробуйте изменить поисковый запрос</p>
          <button type="button" onClick={() => { setIsLoading(true); setQuery(""); }}>Сбросить поиск</button>
        </div>
      ) : category ? (
        <div className="templates-empty">
          <span className="templates-empty__icon"><Search aria-hidden="true" /></span>
          <h2>В этой категории пока нет шаблонов</h2>
          <p>Выберите другую категорию или сбросьте фильтр, чтобы посмотреть все шаблоны.</p>
          <button type="button" onClick={() => { setIsLoading(true); setCategory(""); }}>Сбросить фильтр</button>
        </div>
      ) : (
        <div className="templates-empty">
          <span className="templates-empty__icon"><Search aria-hidden="true" /></span>
          <h2>Шаблоны скоро появятся</h2>
          <p>Попробуйте заглянуть позже.</p>
        </div>
      )}

      {activeTemplate && (
        <div className="templates-modal" role="presentation" onClick={closeTemplateDetails}>
          <div
            className="templates-modal__card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="templates-modal__heading">
              <span className="template-card__file-icon" aria-hidden="true">
                {activeTemplate.format === "PDF" ? <FileText /> : <FileSpreadsheet />}
              </span>
              <button type="button" className="template-card__favorite" aria-label="Закрыть" onClick={closeTemplateDetails}>
                <X aria-hidden="true" />
              </button>
            </div>
            <span className="template-card__category">{activeTemplate.category}</span>
            <div className="templates-modal__title">
              <h2 id="template-detail-title">{activeTemplate.title}</h2>
              {activeTemplate.available ? (
                <span className="template-card__free">Бесплатно</span>
              ) : (
                <span className="template-card__unavailable">Временно недоступен</span>
              )}
            </div>
            {!activeTemplate.available && (
              <p className="templates-unavailable-note" role="status">
                Этот материал временно недоступен. Попробуйте вернуться к нему позже.
              </p>
            )}
            <p className="templates-modal__description">{activeTemplate.description}</p>
            <div className="templates-modal__details">
              <span>Формат файла <strong>{activeTemplate.format}</strong></span>
              <span>Добавлено <strong>26 ноября 2026</strong></span>
            </div>
            <div className="templates-modal__section">
              <h3>Для каких задач предназначен</h3>
              <p>{categoryDetails[activeTemplate.category].tasks}</p>
            </div>
            <div className="templates-modal__section">
              <h3>Для кого подходит</h3>
              <p>{categoryDetails[activeTemplate.category].audience}</p>
            </div>
            <div className="templates-modal__source">
              <span>Источник</span>
              {activeTemplate.sourceUrl ? (
                <a href={activeTemplate.sourceUrl} target="_blank" rel="noreferrer">
                  {activeTemplate.source}<ExternalLink aria-hidden="true" />
                </a>
              ) : (
                <span className="templates-modal__source-status">
                  <strong>{activeTemplate.source}</strong>
                  <small>Ссылка на оригинальный материал пока не добавлена</small>
                </span>
              )}
            </div>
            {activeTemplate.format === "Google Sheets" && (
              <div className="templates-modal__section">
                <h3>Как использовать</h3>
                <p>Откройте онлайн-шаблон и создайте свою копию, чтобы вносить данные и сохранять изменения.</p>
              </div>
            )}
            {activeTemplate.format === "XLSX" && (
              <div className="templates-modal__section">
                <h3>Как использовать</h3>
                <p>Скачайте файл и откройте его в Excel или совместимом табличном редакторе.</p>
              </div>
            )}
            <div className="templates-modal__footer">
              <button
                type="button"
                className={`template-card__favorite${favorites.includes(activeTemplate.id) ? " is-active" : ""}`}
                aria-label={favorites.includes(activeTemplate.id) ? "Убрать из избранного" : "Добавить в избранное"}
                aria-pressed={favorites.includes(activeTemplate.id)}
                onClick={() => toggleFavorite(activeTemplate.id)}
              >
                <Heart aria-hidden="true" />
                <span>{favorites.includes(activeTemplate.id) ? "В избранном" : "В избранное"}</span>
              </button>
              <button
                type="button"
                className={`template-card__action${activeTemplate.available ? "" : " is-disabled"}`}
                disabled={!activeTemplate.available}
                onClick={() => showActionError(activeTemplate)}
              >
                {activeTemplate.available && activeTemplate.action === "download" && <ArrowDownToLine aria-hidden="true" />}
                {activeTemplate.available && activeTemplate.action !== "download" && <ExternalLink aria-hidden="true" />}
                {activeTemplate.available ? actionLabels[activeTemplate.action] : "Временно недоступен"}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="templates-toast" role="alert">
          <AlertCircle aria-hidden="true" />
          <span>{toast}</span>
          <button type="button" aria-label="Закрыть уведомление" onClick={() => setToast("")}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
