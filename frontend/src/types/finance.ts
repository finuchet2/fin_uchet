export type TransactionType = "INCOME" | "EXPENSE" | "TAX"

export interface Project {
  id: string
  name: string
  description?: string
  is_active: boolean
}

export interface Category {
  id: string
  name: string
  type: TransactionType
  is_system: boolean
  is_active: boolean
}

export interface Transaction {
  id: string
  project_id: string
  category_id: string
  type: TransactionType
  amount: number
  date_fact: string
  date_period: string
  comment?: string
  created_at: string
}

export const INITIAL_CATEGORIES: Category[] = [
  { id: "cat-inc-1", name: "Доход от ВБ", type: "INCOME", is_system: true, is_active: true },
  { id: "cat-inc-2", name: "Продажа книг", type: "INCOME", is_system: true, is_active: true },
  { id: "cat-inc-3", name: "Услуги", type: "INCOME", is_system: true, is_active: true },
  { id: "cat-exp-1", name: "Аренда", type: "EXPENSE", is_system: true, is_active: true },
  { id: "cat-exp-2", name: "Зарплата", type: "EXPENSE", is_system: true, is_active: true },
  { id: "cat-exp-3", name: "Коммуналка", type: "EXPENSE", is_system: true, is_active: true },
  { id: "cat-exp-4", name: "Интернет", type: "EXPENSE", is_system: true, is_active: true },
  { id: "cat-exp-5", name: "Расходники", type: "EXPENSE", is_system: true, is_active: true },
  { id: "cat-exp-6", name: "Прочие", type: "EXPENSE", is_system: true, is_active: true },
  { id: "cat-tax-1", name: "УСН 6%", type: "TAX", is_system: true, is_active: true },
  { id: "cat-tax-2", name: "УСН 15%", type: "TAX", is_system: true, is_active: true },
  { id: "cat-tax-3", name: "Страховые взносы", type: "TAX", is_system: true, is_active: true },
  { id: "cat-tax-4", name: "НДФЛ", type: "TAX", is_system: true, is_active: true },
  { id: "cat-tax-5", name: "Транспортный налог", type: "TAX", is_system: true, is_active: true },
]

export const INITIAL_PROJECTS: Project[] = [
  { id: "proj-1", name: "ПВЗ Wildberries", description: "Пункт выдачи заказов", is_active: true },
  { id: "proj-2", name: "Книги на Ozon", description: "Торговля книгами", is_active: true },
  { id: "proj-3", name: "Сдача квартиры", description: "Арендный бизнес", is_active: true },
]

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: "tx-1",
    project_id: "proj-1",
    category_id: "cat-inc-1",
    type: "INCOME",
    amount: 87561,
    date_fact: "2026-10-15",
    date_period: "2026-10-15",
    comment: "Выплата ВБ за первую половину октября",
    created_at: "2026-10-15T10:00:00Z",
  },
  {
    id: "tx-2",
    project_id: "proj-1",
    category_id: "cat-inc-1",
    type: "INCOME",
    amount: 123953,
    date_fact: "2026-11-05",
    date_period: "2026-10-31",
    comment: "Задержка выплаты ВБ за октябрь",
    created_at: "2026-11-05T10:00:00Z",
  },
  {
    id: "tx-3",
    project_id: "proj-1",
    category_id: "cat-inc-2",
    type: "INCOME",
    amount: 15000,
    date_fact: "2026-10-20",
    date_period: "2026-10-20",
    comment: "Продажа сопутствующих товаров",
    created_at: "2026-10-20T12:00:00Z",
  },
  {
    id: "tx-4",
    project_id: "proj-1",
    category_id: "cat-exp-1",
    type: "EXPENSE",
    amount: 55000,
    date_fact: "2026-10-01",
    date_period: "2026-10-01",
    comment: "Аренда помещения за октябрь",
    created_at: "2026-10-01T09:00:00Z",
  },
  {
    id: "tx-5",
    project_id: "proj-1",
    category_id: "cat-exp-1",
    type: "EXPENSE",
    amount: 55000,
    date_fact: "2026-10-25",
    date_period: "2026-11-01",
    comment: "Авансовый платеж: аренда за ноябрь",
    created_at: "2026-10-25T14:00:00Z",
  },
  {
    id: "tx-6",
    project_id: "proj-1",
    category_id: "cat-exp-2",
    type: "EXPENSE",
    amount: 111906,
    date_fact: "2026-10-28",
    date_period: "2026-10-28",
    comment: "Зарплата сотрудников ПВЗ",
    created_at: "2026-10-28T16:00:00Z",
  },
  {
    id: "tx-7",
    project_id: "proj-1",
    category_id: "cat-exp-3",
    type: "EXPENSE",
    amount: 8750,
    date_fact: "2026-10-18",
    date_period: "2026-10-18",
    comment: "Счет за электроэнергию и воду",
    created_at: "2026-10-18T11:00:00Z",
  },
  {
    id: "tx-8",
    project_id: "proj-1",
    category_id: "cat-exp-4",
    type: "EXPENSE",
    amount: 14000,
    date_fact: "2026-10-10",
    date_period: "2026-10-10",
    comment: "Корпоративный тариф интернета",
    created_at: "2026-10-10T11:00:00Z",
  },
  {
    id: "tx-9",
    project_id: "proj-1",
    category_id: "cat-exp-5",
    type: "EXPENSE",
    amount: 5595,
    date_fact: "2026-10-12",
    date_period: "2026-10-12",
    comment: "Пакеты, скотч, бумага для принтера",
    created_at: "2026-10-12T15:00:00Z",
  },
]
