import type { IndustryProjectTemplate } from "../types/templates"

export const INDUSTRY_PROJECT_TEMPLATES: IndustryProjectTemplate[] = [
  {
    id: "pvz",
    name: "Пункт выдачи заказов (ПВЗ)",
    shortDescription:
      "Готовый набор статей для пунктов выдачи Wildberries, Ozon, Яндекс Маркет и СДЭК.",
    applicationArea: "Пункты выдачи заказов и офлайн-точки обслуживания клиентов",
    defaultProjectPlaceholder: "Например, ПВЗ Wildberries на Ленина",
    defaultDescriptionPlaceholder: "Например, пункт выдачи заказов",
    accentColor: "#2563EB",
    categories: {
      income: [
        { name: "Вознаграждение от маркетплейса", type: "INCOME" },
        { name: "Дополнительные услуги", type: "INCOME" },
        { name: "Прочие доходы", type: "INCOME" },
      ],
      expenses: [
        { name: "Аренда помещения", type: "EXPENSE" },
        { name: "Коммунальные услуги", type: "EXPENSE" },
        { name: "Интернет и связь", type: "EXPENSE" },
        { name: "Заработная плата", type: "EXPENSE" },
        { name: "Хозяйственные товары", type: "EXPENSE" },
        { name: "Расходные материалы", type: "EXPENSE" },
        { name: "Ремонт и обслуживание", type: "EXPENSE" },
        { name: "Прочие расходы", type: "EXPENSE" },
      ],
      taxes: [
        { name: "Налоговые платежи", type: "TAX" },
        { name: "Страховые взносы", type: "TAX" },
        { name: "Прочие налоговые платежи", type: "TAX" },
      ],
    },
  },
  {
    id: "marketplace_seller",
    name: "Продажа товаров на маркетплейсах",
    shortDescription:
      "Учёт закупок, комиссий площадок, логистики, хранения, упаковки и рекламного продвижения.",
    applicationArea: "Селлеры и онлайн-магазины на Wildberries, Ozon, Яндекс Маркет",
    defaultProjectPlaceholder: "Например, Магазин товаров на Ozon",
    defaultDescriptionPlaceholder: "Например, продажи на маркетплейсе",
    accentColor: "#10B981",
    categories: {
      income: [
        { name: "Продажа товаров", type: "INCOME" },
        { name: "Возвраты и корректировки", type: "INCOME" },
        { name: "Прочие доходы", type: "INCOME" },
      ],
      expenses: [
        { name: "Закупка товаров", type: "EXPENSE" },
        { name: "Комиссия маркетплейса", type: "EXPENSE" },
        { name: "Логистика и доставка", type: "EXPENSE" },
        { name: "Хранение товаров", type: "EXPENSE" },
        { name: "Упаковка и расходные материалы", type: "EXPENSE" },
        { name: "Реклама и продвижение", type: "EXPENSE" },
        { name: "Возвраты и потери", type: "EXPENSE" },
        { name: "Прочие расходы", type: "EXPENSE" },
      ],
      taxes: [
        { name: "Налоговые платежи", type: "TAX" },
        { name: "Страховые взносы", type: "TAX" },
        { name: "Прочие налоговые платежи", type: "TAX" },
      ],
    },
  },
  {
    id: "universal_business",
    name: "Универсальный бизнес",
    shortDescription:
      "Базовый сбалансированный набор статей доходов, расходов и налогов для большинства видов деятельности.",
    applicationArea: "Розничная торговля, услуги, агентства и смешанный малый бизнес",
    defaultProjectPlaceholder: "Например, Основной бизнес",
    defaultDescriptionPlaceholder: "Например, продажи и услуги",
    accentColor: "#6366F1",
    categories: {
      income: [
        { name: "Продажа товаров", type: "INCOME" },
        { name: "Оказание услуг", type: "INCOME" },
        { name: "Прочие доходы", type: "INCOME" },
      ],
      expenses: [
        { name: "Аренда", type: "EXPENSE" },
        { name: "Коммунальные услуги", type: "EXPENSE" },
        { name: "Интернет и связь", type: "EXPENSE" },
        { name: "Закупки", type: "EXPENSE" },
        { name: "Заработная плата", type: "EXPENSE" },
        { name: "Реклама", type: "EXPENSE" },
        { name: "Транспортные расходы", type: "EXPENSE" },
        { name: "Прочие расходы", type: "EXPENSE" },
      ],
      taxes: [
        { name: "Налоговые платежи", type: "TAX" },
        { name: "Страховые взносы", type: "TAX" },
        { name: "Прочие налоговые платежи", type: "TAX" },
      ],
    },
  },
]
