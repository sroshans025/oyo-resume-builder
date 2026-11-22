/**
 * Thin fetch wrapper for the Infyro API.
 * - Same-origin session cookies (credentials: "include").
 * - Sends Django's CSRF token on unsafe methods.
 * - Normalises the API error envelope into ApiError.
 */

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, unknown>;
  retryAfter?: number;

  constructor(status: number, code: string, message: string, fields?: Record<string, unknown>, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfter = retryAfter;
  }

  /** First message for a given field (supports nested "personal.email" style keys). */
  field(name: string): string | undefined {
    const parts = name.split(".");
    let cur: unknown = this.fields;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[p];
      else return undefined;
    }
    if (Array.isArray(cur)) return typeof cur[0] === "string" ? cur[0] : JSON.stringify(cur[0]);
    if (typeof cur === "string") return cur;
    return cur ? JSON.stringify(cur) : undefined;
  }

  get friendly(): string {
    if (this.fields) {
      const first = Object.entries(this.fields)[0];
      if (first) {
        const v = first[1];
        const msg = Array.isArray(v) ? v[0] : typeof v === "string" ? v : null;
        if (typeof msg === "string" && first[0] !== "non_field_errors") return `${humanize(first[0])}: ${msg}`;
        if (typeof msg === "string") return msg;
      }
    }
    return this.message;
  }
}

function humanize(key: string) {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function getCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((row) => row.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

let csrfPromise: Promise<void> | null = null;
async function ensureCsrf() {
  if (getCookie("csrftoken")) return;
  csrfPromise ??= fetch("/api/csrf/", { credentials: "include" }).then(() => undefined);
  await csrfPromise;
  csrfPromise = null;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function request<T = unknown>(method: Method, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    await ensureCsrf();
    const token = getCookie("csrftoken");
    if (token) headers["X-CSRFToken"] = token;
  }
  let res: Response;
  try {
    res = await fetch(path.startsWith("/api") ? path : `/api${path}`, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      ...init,
    });
  } catch {
    throw new ApiError(0, "network_error", "Can't reach the server. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = data?.error;
    const fallback =
      res.status === 401 || res.status === 403
        ? "You don't have access to this. Try signing in again."
        : res.status === 404
          ? "We couldn't find that."
          : res.status >= 500
            ? "Something went wrong on our side. Please try again."
            : "Request failed.";
    throw new ApiError(res.status, err?.code ?? `http_${res.status}`, err?.message ?? fallback, err?.fields, err?.retry_after);
  }
  return data as T;
}

export const api = {
  get: <T = unknown>(path: string) => request<T>("GET", path),
  post: <T = unknown>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T = unknown>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T = unknown>(path: string) => request<T>("DELETE", path),
  upload: <T = unknown>(path: string, form: FormData) => request<T>("POST", path, form),
};

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Open a signed download link (owner session + short-lived token). */
export async function openSignedLink(kind: "upload" | "generated", id: number, inline = false) {
  const link = await api.post<{ url: string }>(`/vault/${kind}/${id}/link/`);
  const url = link.url + (inline ? "&inline=1" : "");
  if (inline) window.open(url, "_blank", "noopener");
  else {
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

export function downloadUrl(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
