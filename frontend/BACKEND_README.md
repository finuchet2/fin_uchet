# Finzentra — документация для бэкенд-разработчика

> Версия документа: 29.10.2026. Составлена по исходному коду фронтенда.
> Номера строк в `src/App.tsx` примерные: после правок ищите по названиям функций.
> Фрагменты кода в разделе 4 — эскизы, они не запускались и не тестировались.

## 0. Коротко

- Фронтенд — **рабочий прототип без сервера**. В коде нет ни одного сетевого запроса: все данные живут в `localStorage` браузера или в памяти React.
- Стек: React 18, TypeScript, Vite 7, обычный CSS (BEM) в `src/index.css`. Tailwind 3 подключён только ради сброса стилей (`@tailwind base`), утилитарные классы не используются. Иконки — `lucide-react`.
- Маршрутизатора и менеджера состояния нет. Экраны переключаются состоянием React (`screen`, `section`).
- Приложение — PWA (service worker + манифест).
- Требуется Node.js **20.19 или новее** (требование Vite 7).

```bash
npm install
npm run dev        # разработка (http://localhost:5173)
npm run build      # сборка в dist/
npm run preview    # просмотр сборки (http://localhost:4173)
npm run typecheck  # проверка типов
```

## 1. Архитектура

### 1.1 Структура `src/`

| Путь | Назначение | Используется интерфейсом |
|---|---|---|
| `App.tsx` | Монолит (~2200 строк): экраны входа/регистрации, кабинет, «Операции», «Проекты», «Настройки», форма операции | да |
| `FinancialDashboard.tsx` | Дашборд: фильтры, итоговые карточки, финансовый отчёт, сравнение периодов | да |
| `CustomSelect.tsx`, `TruncatedValue.tsx`, `currency.ts` | Вспомогательные компоненты и форматирование сумм | да |
| `hooks/usePersistentState.ts` | Хранение состояния в `localStorage` с проверкой формата | да |
| `index.css` | Все стили (≈1100 строк), включая адаптив | да |
| `api/` | Заготовка клиента к бэкенду | **нет** |
| `types/` | Контрактные модели для API (`Project`, `Category`, `Transaction`) и тестовые данные | **нет** |
| `services/reportService.ts` | Эталонный алгоритм построения отчёта (`buildReport`) | **нет** |
| `utils/` | Периоды и форматирование для `services/` | **нет** |

`api/`, `types/`, `services/`, `utils/` лежат как **документация и заготовка**: интерфейс на них пока не ссылается.

### 1.2 Где живут данные сейчас и где они должны быть

| Данные | Сейчас | Должно быть |
|---|---|---|
| Операции | `localStorage`, ключ `finzentra_bolt_operations` | БД, API |
| Проекты | `localStorage`, ключ `finzentra_bolt_projects` | БД, API |
| Справочник категорий | `localStorage`, ключ `finzentra_bolt_categories` (объект `{expenses, income, taxes}`) | БД, API |
| Пользователь | только память React: `{ name }`, по умолчанию «Гость» (`App.tsx`, `useState<AppUser>`), теряется при перезагрузке | БД + сессия |
| Уникальность email/телефона при регистрации | `useRef` в памяти (`registeredContacts`), теряется при перезагрузке | проверка на сервере |
| Вход | **заглушка**: принимается любой логин и жёстко зашитый пароль (см. раздел 5) | сервер, хеш пароля, сессия/токен |
| Восстановление пароля | **заглушка**: показывает «письмо отправлено» через 0,9 с, ничего не отправляет | сервер, письмо |
| Выбранные период, проекты, метод учёта, вид отчёта, вкладка, фильтры таблицы | состояние React, не сохраняется | можно оставить на клиенте |
| Итоги и отчёт | считаются на клиенте в `FinancialDashboard.tsx` из полного массива операций | на старте можно оставить на клиенте; при росте данных — серверная агрегация |
| Уведомления | статика: «Новых уведомлений нет» | позже |

### 1.3 Как сейчас устроено хранение

Хук `usePersistentState(key, fallback, isValid)`:

1. При старте читает `localStorage` и проверяет формат функцией-валидатором (`isOperationList`, `isProjectList`, `isLiveCategories` в `App.tsx`).
2. Если данных нет — берёт значение по умолчанию.
3. Если данные повреждены — берёт значение по умолчанию и **не перезаписывает** хранилище, пока пользователь что-то не изменит.
4. Любое изменение сразу пишется в `localStorage`.

Все три хранилища создаются в одном месте: `AppDestination` в `App.tsx` (около строк 1934–1936). Дочерние компоненты меняют их через `setOperations`, `setProjects`, `setLiveCategories` в функциональной форме. Это единая точка подмены на API.

### 1.4 Как считается отчёт

В `FinancialDashboard.tsx` два метода учёта:

- **«Метод начисления» (`pnl`)** — операция попадает в период по `periodDate`;
- **«Кассовый метод» (`cashflow`)** — по дате факта `date`.

Дополнительно: фильтр по проектам (пустой выбор = «все проекты»), переключатель «Суммы ₽ / Проценты %», сравнение с предыдущим периодом. Периоды: месяц, квартал, год.

### 1.5 Service worker и API

`public/sw.js` перехватывает только **same-origin GET-запросы** и кэширует:
- навигацию (сначала сеть, при ошибке — кэшированный `index.html`);
- статику: `script`, `style`, `image`, `font`, `.webmanifest`, `.svg` (сначала кэш).

Запросы к API (`fetch`/XHR, другие методы, другой origin) service worker **не трогает**. Если API живёт на другом домене, настройте CORS. Если на том же домене под `/api` — кэширования не будет, так как такие запросы не относятся к статике. Шрифт Inter подгружается с Google Fonts первой строкой `index.css`; офлайн он не кэшируется (сработает запасной шрифт).

## 2. Модели данных

### 2.1 Модели, которые реально использует интерфейс (`App.tsx`)

```ts
type OperationType = "income" | "expense" | "tax";

type Operation = {
  id: string;
  type: OperationType;
  category: string;     // НАЗВАНИЕ категории, не id
  project: string;      // НАЗВАНИЕ проекта, не id; может быть пустой строкой
  date: string;         // дата факта, формат ДД.ММ.ГГГГ
  periodDate: string;   // дата периода, формат ДД.ММ.ГГГГ
  comment: string;      // до 255 символов
  amount: number;       // доходы > 0, расходы и налоги < 0
};

type DirectoryProject = {
  id: string;
  name: string;         // 2–60 символов
  description: string;  // до 120 символов
  archived: boolean;
  operations: number;   // счётчик операций, ведётся на клиенте
  color?: string;       // цвет аватара, только UI
};

type CategoryTab = "expenses" | "income" | "taxes";
type LiveCategory = {
  id: string;
  name: string;         // 2–48 символов
  system: boolean;      // системные нельзя удалить
  active: boolean;      // «скрыта» = false
};
// Хранится как Record<CategoryTab, LiveCategory[]>

type AppUser = { name: string };
type ReportingPeriodType = "month" | "quarter" | "year";
```

Категории по умолчанию (`initialLiveCategories`):
- расходы: Аренда, Коммуналка, Интернет;
- доходы: Продажи, Авансы, Прочие поступления;
- налоги: УСН 6%, УСН 15%, Страховые взносы, НДФЛ, Транспортный налог.

### 2.2 Контрактные модели `src/types/finance.ts` (для API, пока не подключены)

```ts
type TransactionType = "INCOME" | "EXPENSE" | "TAX";

interface Project {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
}

interface Category {
  id: string;
  name: string;
  type: TransactionType;
  is_system: boolean;
  is_active: boolean;
}

interface Transaction {
  id: string;
  project_id: string;
  category_id: string;
  type: TransactionType;
  amount: number;        // всегда положительная
  date_fact: string;     // ГГГГ-ММ-ДД
  date_period: string;   // ГГГГ-ММ-ДД
  comment?: string;
  created_at: string;    // ISO 8601
}
```

В файле также лежат `INITIAL_CATEGORIES`, `INITIAL_PROJECTS`, `INITIAL_TRANSACTIONS` — тестовые данные (ПВЗ Wildberries, Книги на Ozon, Сдача квартиры). Интерфейс их не использует.

### 2.3 Расхождения между моделью интерфейса и контрактной моделью

Это главное, что нужно учесть при подключении. Две модели не совпадают:

| Что | Интерфейс (`App.tsx`) | Контракт (`types/finance.ts`) |
|---|---|---|
| Связь с проектом и категорией | по **названию** (`project`, `category`) | по **id** (`project_id`, `category_id`) |
| Тип операции | `"income"`, `"expense"`, `"tax"` | `"INCOME"`, `"EXPENSE"`, `"TAX"` |
| Знак суммы | доходы `+`, расходы и налоги `−` | всегда `+`, знак определяет `type` |
| Формат дат | `ДД.ММ.ГГГГ` | `ГГГГ-ММ-ДД` |
| Названия полей дат | `date`, `periodDate` | `date_fact`, `date_period` |
| Проект «активен» | `archived: false` | `is_active: true` (инверсия) |
| Категория | `system`, `active`, сгруппированы по вкладкам | `is_system`, `is_active`, плоский список с `type` |
| Счётчик операций проекта | поле `operations` в объекте проекта | нет (считать на сервере) |
| Цвет проекта | `color` | нет |
| Проект у операции | **необязателен** (форма проверяет сумму, категорию и обе даты, но не проект) | `project_id` обязателен |
| `created_at` | нет | есть |

**Рекомендация:** реализовывать API по контрактным моделям (`snake_case`, `id`, ISO-даты, положительная сумма), а различия закрывать адаптером на фронтенде (раздел 4, шаг 4). Решите заранее, нужен ли `project_id` как nullable: в интерфейсе операцию можно сохранить без проекта.

Деньги: интерфейс хранит суммы как `number` с двумя знаками. На сервере храните в копейках (целое) или `DECIMAL(14,2)`. Эталонный `buildReport` считает в копейках (`Math.round(amount * 100)`).

### 2.4 Валидация, зашитая в интерфейсе (повторите на сервере)

| Поле | Правило |
|---|---|
| Сумма операции | не более 12 цифр до запятой и 2 после (`^\d{1,12}([.,]\d{1,2})?$`) |
| Комментарий | до 255 символов |
| Категория операции | обязательна |
| Даты факта и периода | обязательны, валидные |
| Название проекта | 2–60 символов |
| Описание проекта | до 120 символов |
| Название категории | 2–48 символов, без дублей («Такая категория уже есть») |
| Email | `^[^\s@]+@[^\s@]+\.[^\s@]+$` |
| Телефон | маска `+7 (XXX) XXX-XX-XX` |
| Пароль | не короче 8 символов, есть буква и цифра |
| Контакт | уникален («Пользователь с таким email/телефоном уже существует») |

### 2.5 Бизнес-правила из интерфейса

- Проект с операциями **нельзя удалить**, его можно переименовать или отправить в архив (`ProjectsContent`).
- Архивный проект можно восстановить.
- Системные категории (`system: true`) удалять нельзя; пользовательские удаляются после подтверждения. Категории можно скрывать и показывать.
- При переименовании проекта интерфейс сам обновляет название во всех операциях (`onProjectRenamed`). При переходе на id это потеряет смысл.
- Удаление операции требует подтверждения; при ошибке показывается «Не удалось удалить операцию».
- Сортировка таблицы операций — по дате, поиск по тексту, фильтры: проект (мультивыбор), тип (вкладки «Все / Доходы / Расходы / Налоги»), период (`all`, `global`, `month`, `quarter`, `year`, `custom`).

## 3. Папка `src/api`

### 3.1 Что там лежит

- `client.ts`
  - `API_BASE_URL` — из переменной `VITE_API_URL`, по умолчанию `http://localhost:3000/api`;
  - `apiRequest<T>(endpoint, { method, body, headers })` — обёртка над `fetch`, умеет `GET/POST/PUT/PATCH/DELETE`, сам ставит `Content-Type: application/json`, при ошибке бросает объект `ApiError { message, status, details }`;
  - `apiGet<T>(endpoint)` — единственный помощник. Для остальных методов используйте `apiRequest`.
- `endpoints.ts` — константы путей: `/health`, `/dashboard`, `/transactions`, `/projects`, `/categories`.
- `index.ts` — реэкспорт.

### 3.2 Замечания к клиенту (исправить до использования)

1. **Ошибка разбора тела ответа.** При `!response.ok` код делает `JSON.parse(errorBody).error`. Если сервер вернёт не JSON (например, HTML от прокси или 502), будет исключение `SyntaxError` вместо `ApiError`. Оберните в `try/catch`.
2. **Нет авторизации.** Нет заголовка `Authorization`, нет `credentials: "include"`. Нужно добавить, как только появится вход.
3. Нет таймаута и отмены запросов (`AbortController`).
4. В `endpoints.ts` нет эндпоинтов авторизации.
5. Для `/dashboard` не описана форма ответа (в `types/` нет такого типа). Ориентир — `Report` из `services/reportService.ts`.

### 3.3 Предлагаемые эндпоинты

Базовый путь — значение `VITE_API_URL` (например, `https://api.example.com/api`). Формат — JSON. Формат ошибки, который понимает клиент: `{ "error": <текст или объект> }`.

**Служебные**

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/health` | проверка работоспособности, `{ "status": "ok" }` |

**Авторизация** (в `endpoints.ts` нужно добавить)

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| POST | `/auth/register` | `{ name, contact, password }` | 201 + пользователь; 409 — контакт занят; 422 — ошибки полей |
| POST | `/auth/login` | `{ contact, password }` | 200 + пользователь/токен; 401 — «Неверный логин или пароль» |
| POST | `/auth/logout` | — | 204 |
| GET | `/auth/me` | — | текущий пользователь `{ id, name }`; 401 без сессии |
| POST | `/auth/recover` | `{ email }` | 202 всегда (не раскрывать, есть ли такой email) |
| POST | `/auth/reset` | `{ token, password }` | 204 |

**Проекты** (`/projects`)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/projects` | список, включая архивные (`is_active=false`) |
| POST | `/projects` | `{ name, description? }` → 201 + `Project` |
| PATCH | `/projects/:id` | `{ name?, description?, is_active? }` |
| DELETE | `/projects/:id` | 204; **409**, если у проекта есть операции |

**Категории** (`/categories`)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/categories` | плоский список, у каждой `type`, `is_system`, `is_active` |
| POST | `/categories` | `{ name, type }` → 201; 409 при дубле названия |
| PATCH | `/categories/:id` | `{ is_active? }` (в интерфейсе меняется только активность) |
| DELETE | `/categories/:id` | 204; 403 для системных; правила для категорий, которые уже используются в операциях, нужно согласовать (интерфейс считает использование по названию, см. `SettingsContent`) |

**Операции** (`/transactions`)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/transactions` | список. Параметры: `project_id` (несколько), `type`, `category_id`, `date_from`, `date_to`, `date_field=fact\|period`, `q` (поиск по комментарию/категории/проекту), `sort=date_fact:desc`, `limit`, `cursor` |
| POST | `/transactions` | 201 + `Transaction` |
| PATCH | `/transactions/:id` | частичное обновление |
| DELETE | `/transactions/:id` | 204 |

Пример тела `POST /transactions`:

```json
{
  "project_id": "proj-1",
  "category_id": "cat-inc-1",
  "type": "INCOME",
  "amount": 87561.00,
  "date_fact": "2026-10-15",
  "date_period": "2026-10-15",
  "comment": "Выплата за первую половину октября"
}
```

**Отчёт** (опционально, для серверной агрегации)

| Метод | Путь | Параметры |
|---|---|---|
| GET | `/dashboard` | `period_kind=MONTH\|QUARTER\|YEAR`, `period=2026-10`, `method=PNL\|CASH_FLOW`, `project_ids=a,b`, `compare=previous` |

Ответ — `Report` из `services/reportService.ts` (`income`, `expense`, `tax`, `net`, строки по категориям, `count`). Алгоритм-эталон: `buildReport`. В нём `PNL` берёт `date_period`, `CASH_FLOW` — `date_fact`, учитываются только активные категории.

## 4. Как переключить фронтенд с `localStorage` на API

### Шаг 1. Окружение

Создайте `.env` (в проекте его пока нет):

```
VITE_API_URL=https://api.example.com/api
```

Настройте на сервере CORS для адреса фронтенда. Если используете cookie-сессию, разрешите `credentials` и добавьте `credentials: "include"` в `fetch` внутри `src/api/client.ts`.

### Шаг 2. Исправьте клиент

Закройте замечания из раздела 3.2 (разбор ошибок, авторизация), добавьте эндпоинты авторизации в `API_ENDPOINTS`.

### Шаг 3. Типизированные обёртки

Создайте, например, `src/api/projectsApi.ts`, `categoriesApi.ts`, `transactionsApi.ts`:

```ts
// эскиз
import { apiRequest } from "./client";
import { API_ENDPOINTS } from "./endpoints";
import type { Project } from "../types";

export const projectsApi = {
  list: () => apiRequest<Project[]>(API_ENDPOINTS.projects),
  create: (body: { name: string; description?: string }) =>
    apiRequest<Project>(API_ENDPOINTS.projects, { method: "POST", body }),
  update: (id: string, body: Partial<Pick<Project, "name" | "description" | "is_active">>) =>
    apiRequest<Project>(`${API_ENDPOINTS.projects}/${id}`, { method: "PATCH", body }),
  remove: (id: string) => apiRequest<void>(`${API_ENDPOINTS.projects}/${id}`, { method: "DELETE" }),
};
```

### Шаг 4. Адаптер между моделью интерфейса и API

Интерфейс работает с названиями, отрицательными суммами и датами `ДД.ММ.ГГГГ` (раздел 2.3). Проще не переписывать `App.tsx`, а добавить слой преобразования (`src/api/adapters.ts`):

```ts
// эскиз
import type { Transaction, TransactionType } from "../types";

type UiType = "income" | "expense" | "tax";
const toApiType = (t: UiType): TransactionType => t.toUpperCase() as TransactionType;
const toUiType = (t: TransactionType): UiType => t.toLowerCase() as UiType;

const uiDateToIso = (v: string) => { const [d, m, y] = v.split("."); return `${y}-${m}-${d}`; };
const isoToUiDate = (v: string) => { const [y, m, d] = v.slice(0, 10).split("-"); return `${d}.${m}.${y}`; };

export function toApiTransaction(op: Operation, projectIdByName: Map<string, string>, categoryIdByName: Map<string, string>) {
  return {
    project_id: projectIdByName.get(op.project) ?? null,   // проект необязателен в интерфейсе
    category_id: categoryIdByName.get(op.category)!,
    type: toApiType(op.type),
    amount: Math.abs(op.amount),
    date_fact: uiDateToIso(op.date),
    date_period: uiDateToIso(op.periodDate),
    comment: op.comment,
  };
}

export function toUiOperation(tx: Transaction, projectNameById: Map<string, string>, categoryNameById: Map<string, string>): Operation {
  return {
    id: tx.id,
    type: toUiType(tx.type),
    category: categoryNameById.get(tx.category_id) ?? "",
    project: projectNameById.get(tx.project_id) ?? "",
    date: isoToUiDate(tx.date_fact),
    periodDate: isoToUiDate(tx.date_period),
    comment: tx.comment ?? "",
    amount: tx.type === "INCOME" ? tx.amount : -tx.amount,
  };
}
```

Аналогично для проектов (`is_active` ↔ `archived`, счётчик `operations` считать по загруженным операциям) и категорий (плоский список ↔ `Record<CategoryTab, LiveCategory[]>`).

### Шаг 5. Подмените три хранилища

В `AppDestination` (`App.tsx`, ~1934–1936) замените вызовы `usePersistentState` на загрузку с сервера:

```ts
// эскиз: src/hooks/useRemoteCollection.ts
import { useEffect, useState } from "react";

export function useRemoteCollection<T>(load: () => Promise<T>, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let alive = true;
    load().then((v) => { if (alive) { setValue(v); setStatus("ready"); } })
          .catch(() => { if (alive) setStatus("error"); });
    return () => { alive = false; };
  }, []);
  return [value, setValue, status] as const;
}
```

Затем добавьте вызовы API в **обработчики изменений**, не меняя разметку:

| Действие | Где в `App.tsx` |
|---|---|
| Создать/изменить операцию | `OperationDrawer`, `onSaved` (~1356, 2118–2130) |
| Удалить операцию | ~2017–2022 |
| Создать проект | `ProjectsContent` (~1576) и «Новый проект» в форме операции (~1501) |
| Переименовать, архивировать, восстановить, удалить проект | ~1584–1592 |
| Добавить, скрыть, удалить категорию | `SettingsContent` (~1747–1790) |

Рекомендуемый порядок: сначала запрос к серверу, при успехе — обновление состояния; при ошибке — показать сообщение через уже существующие `setOpNotice` / `showMessage` / `flash`.

### Шаг 6. Авторизация

1. Замените заглушки в `App.tsx`: регистрация (~404–418), вход (~506–518), восстановление пароля (~554–562).
2. **Удалите зашитый пароль** `"Finzentra2025"` (~515).
3. Начальный экран сейчас `"app"`: `useState<Screen>("app")` (~2167). Сделайте стартовым `"home"` или проверяйте сессию через `GET /auth/me` и показывайте кабинет только авторизованным.
4. Имя пользователя для приветствия берите из `/auth/me`.

### Шаг 7. Уберите локальное хранилище

После подключения API удалите `usePersistentState`, `STORAGE_KEYS` и валидаторы в `App.tsx`. Если нужно перенести данные пользователей, которые уже вводили данные в браузере, предусмотрите разовый импорт из ключей `finzentra_bolt_*`.

### Шаг 8. Развёртывание

- Для публикации по HTTPS собирайте `npm run build` и отдавайте `dist/`.
- Если приложение лежит не в корне домена, задайте `base` в `vite.config.ts` (сейчас он не задан).
- Service worker работает только по HTTPS (или на `localhost`). После выкладки новой сборки файлы имеют хешированные имена, кэш обновится сам.

## 5. Известные ограничения и технический долг

1. **Зашитый пароль в клиентском коде** (`Finzentra2025`) — удалить до публикации.
2. Приложение открывается сразу в кабинете как «Гость»: экрана-«замка» нет.
3. Регистрация, вход и восстановление пароля — имитация с `setTimeout`.
4. Связь операций с проектами и категориями идёт по названиям. Переименование проекта обновляет операции на клиенте, на сервере это нужно заменить id.
5. Счётчик операций проекта ведётся на клиенте (`+1`/`−1`); на сервере считать запросом.
6. `App.tsx` — монолит ~2200 строк; при росте функциональности его стоит разбить на файлы.
7. `api/`, `types/`, `services/`, `utils/` не подключены к интерфейсу; `buildReport` и `FinancialDashboard` считают отчёт отдельно и могут расходиться в мелочах (знак суммы, округление).
8. Шрифт Inter загружается с Google Fonts (первая строка `index.css`).
9. Возможны мелкие различия в отображении в браузерах: макет проверялся в Chromium и на разных ширинах окна, на реальных устройствах — вручную.
10. В проекте остался служебный каталог `.bolt/` (метаданные генератора), на работу не влияет.

## 6. Чек-лист приёмки после подключения API

- [ ] Регистрация, вход, выход, восстановление пароля работают; зашитого пароля в коде нет.
- [ ] Данные не теряются при очистке хранилища браузера и доступны на другом устройстве.
- [ ] Создание, правка, удаление операций, проектов и категорий проходят через API.
- [ ] Проект с операциями не удаляется (409) и показывается сообщение.
- [ ] Итоги дашборда совпадают с серверным расчётом для методов «начисления» и «кассового».
- [ ] Ошибки сети и сервера показываются пользователю, приложение не «белеет».
- [ ] `npm run typecheck` и `npm run build` проходят без ошибок.
- [ ] Установка PWA работает по HTTPS.