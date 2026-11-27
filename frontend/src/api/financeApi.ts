import { apiRequest } from "./client"
import { API_ENDPOINTS } from "./endpoints"

export type ApiTransactionType = "INCOME" | "EXPENSE" | "TAX"

export interface ApiProject {
  id: number
  name: string
  description: string | null
  is_active: boolean
}

export interface ApiCategorySeed {
  name: string
  type: ApiTransactionType
}

export interface ApiCategory {
  id: number
  name: string
  type: ApiTransactionType
  is_system: boolean
  is_active: boolean
  project_id?: number | null
}

export interface ApiTransaction {
  id: number
  user_id: number
  project_id: number
  category_id: number
  type: ApiTransactionType
  amount: number
  date_fact: string
  date_period: string
  comment: string | null
  attachment_url: string | null
  created_at: string | null
}

export interface ApiTransactionInput {
  project_id: number
  category_id: number
  type: ApiTransactionType
  amount: number
  date_fact: string
  date_period: string
  comment?: string | null
  attachment_url?: string | null
}

export interface ApiReportRequest {
  project_ids?: number[] | null
  period_start: string
  period_end: string
  method: "PNL" | "CASH_FLOW"
}

export interface ApiReportRow {
  id: number
  name: string
  amount: number
  percentage: number
}

export interface ApiComparisonRequest {
  current_period_start: string
  current_period_end: string
  previous_period_start: string
  previous_period_end: string
  project_ids?: number[] | null
  method: "PNL" | "CASH_FLOW"
}

export interface ApiComparisonMetric {
  current: number
  previous: number
  difference: number
  percent_change: number | null
  trend: "UP" | "DOWN" | "UNCHANGED"
}

export interface ApiReportComparison {
  income: ApiComparisonMetric
  expense: ApiComparisonMetric
  tax: ApiComparisonMetric
  net: ApiComparisonMetric
}

export interface ApiReport {
  income: number
  expense: number
  tax: number
  net: number
  income_percentage: number
  expense_percentage: number
  tax_percentage: number
  net_percentage: number
  income_rows: ApiReportRow[]
  expense_rows: ApiReportRow[]
  tax_rows: ApiReportRow[]
  count: number
}

export const financeApi = {
  getProjects: () => apiRequest<ApiProject[]>(API_ENDPOINTS.projects),
  createProject: (payload: Pick<ApiProject, "name" | "description" | "is_active"> & { categories?: ApiCategorySeed[] }) =>
    apiRequest<ApiProject>(API_ENDPOINTS.projects, { method: "POST", body: payload }),
  updateProject: (id: number, payload: Pick<ApiProject, "name" | "description" | "is_active">) =>
    apiRequest<ApiProject>(`${API_ENDPOINTS.projects}/${id}`, { method: "PATCH", body: payload }),
  deleteProject: (id: number) =>
    apiRequest<void>(`${API_ENDPOINTS.projects}/${id}`, { method: "DELETE" }),
  getCategories: (projectId?: number, includeInactive = false) => {
    const params = new URLSearchParams()
    if (projectId !== undefined) params.set("project_id", String(projectId))
    if (includeInactive) params.set("include_inactive", "true")
    const query = params.toString()
    return apiRequest<ApiCategory[]>(`${API_ENDPOINTS.categories}${query ? `?${query}` : ""}`)
  },
  createProjectCategory: (projectId: number, payload: Pick<ApiCategory, "name" | "type" | "is_active">) =>
    apiRequest<ApiCategory>(`${API_ENDPOINTS.projects}/${projectId}/categories`, { method: "POST", body: payload }),
  updateProjectCategory: (projectId: number, categoryId: number, payload: { name?: string; is_active?: boolean }) =>
    apiRequest<ApiCategory>(`${API_ENDPOINTS.projects}/${projectId}/categories/${categoryId}`, { method: "PATCH", body: payload }),
  deleteProjectCategory: (projectId: number, categoryId: number) =>
    apiRequest<void>(`${API_ENDPOINTS.projects}/${projectId}/categories/${categoryId}`, { method: "DELETE" }),
  createCategory: (payload: Pick<ApiCategory, "name" | "type" | "is_active">) =>
    apiRequest<ApiCategory>(API_ENDPOINTS.categories, { method: "POST", body: payload }),
  updateCategory: (id: number, payload: { name?: string; is_active?: boolean }) =>
    apiRequest<ApiCategory>(`${API_ENDPOINTS.categories}/${id}`, { method: "PATCH", body: payload }),
  deleteCategory: (id: number) =>
    apiRequest<void>(`${API_ENDPOINTS.categories}/${id}`, { method: "DELETE" }),
  getTransactions: () => apiRequest<ApiTransaction[]>(API_ENDPOINTS.transactions),
  createTransaction: (payload: ApiTransactionInput) =>
    apiRequest<ApiTransaction>(API_ENDPOINTS.transactions, { method: "POST", body: payload }),
  updateTransaction: (id: number, payload: ApiTransactionInput) =>
    apiRequest<ApiTransaction>(`${API_ENDPOINTS.transactions}/${id}`, { method: "PATCH", body: payload }),
  deleteTransaction: (id: number) =>
    apiRequest<void>(`${API_ENDPOINTS.transactions}/${id}`, { method: "DELETE" }),
  getReport: (payload: ApiReportRequest) =>
    apiRequest<ApiReport>(API_ENDPOINTS.reports, { method: "POST", body: payload }),
  compareReports: (payload: ApiComparisonRequest) =>
    apiRequest<ApiReportComparison>(API_ENDPOINTS.reportComparison, { method: "POST", body: payload }),
}
