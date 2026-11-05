export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  headers?: Record<string, string>
}

export type ApiError = {
  message: string
  status: number
  details?: unknown
}

const DEFAULT_BASE_URL = "http://localhost:3000/api"

export const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || DEFAULT_BASE_URL

export async function apiRequest<T>(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, headers } = options

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: {
      Accept: "application/json",
      ...headers,
      ...(body !== undefined && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "")
    const error: ApiError = {
      message: errorBody || "Request failed",
      status: response.status,
      details: errorBody ? JSON.parse(errorBody).error ?? errorBody : undefined,
    }

    throw error
  }

  const text = await response.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

export async function apiGet<T>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: "GET" })
}
