export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

export type ApiError = {
  message: string
  status: number
  details?: unknown
}

const DEFAULT_BASE_URL = "http://localhost:8000"

export const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || DEFAULT_BASE_URL

export async function apiRequest<T>(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, headers, signal } = options
  const token = typeof window !== "undefined" ? window.localStorage.getItem("token") : null
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    signal,
    headers: {
      Accept: "application/json",
      ...(token && !headers?.Authorization ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
      ...(body !== undefined && !isFormData ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "")
    let parsedDetails: unknown = errorBody || undefined
    let parsedMessage = errorBody || "Request failed"
    if (errorBody) {
      try {
        const parsed = JSON.parse(errorBody) as { error?: unknown; detail?: unknown; message?: unknown }
        parsedDetails = parsed.error ?? parsed.detail ?? parsed
        if (typeof parsed.error === "string") parsedMessage = parsed.error
        else if (typeof parsed.detail === "string") parsedMessage = parsed.detail
        else if (typeof parsed.message === "string") parsedMessage = parsed.message
      } catch {
        // Response was not JSON (e.g. proxy HTML); keep raw text fallback.
      }
    }
    const error: ApiError = {
      message: parsedMessage,
      status: response.status,
      details: parsedDetails,
    }

    throw error
  }

  const text = await response.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

export async function apiGet<T>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: "GET" })
}
