export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type Listener = () => void
const unauthorizedListeners = new Set<Listener>()
/** Called when any request comes back 401 (session expired). */
export const onUnauthorized = (fn: Listener) => {
  unauthorizedListeners.add(fn)
  return () => unauthorizedListeners.delete(fn)
}

async function request<T>(method: string, url: string, body?: unknown, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {}
  let payload: BodyInit | undefined
  if (body instanceof Blob || body instanceof ArrayBuffer) {
    payload = body
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json"
    payload = JSON.stringify(body)
  }
  const res = await fetch(url, { method, headers, body: payload, credentials: "same-origin", ...init })
  if (!res.ok) {
    let code = "error"
    let message = res.statusText
    try {
      const j = await res.json()
      code = j.code ?? code
      message = j.error ?? message
    } catch {
      /* not JSON */
    }
    if (res.status === 401 && !url.startsWith("/api/auth/")) unauthorizedListeners.forEach((f) => f())
    throw new ApiError(res.status, code, message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(url: string, init?: RequestInit) => request<T>("GET", url, undefined, init),
  post: <T = void>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T = void>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  patch: <T = void>(url: string, body?: unknown) => request<T>("PATCH", url, body ?? {}),
  del: <T = void>(url: string) => request<T>("DELETE", url),
}

export function qs(params: Record<string, string | number | boolean | undefined>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.set(k, String(v))
  const s = u.toString()
  return s ? `?${s}` : ""
}
