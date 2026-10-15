"use client";

const TOKEN_KEY = "aif_token";

export class ApiError extends Error {
  status: number;
  detail: any;
  constructor(status: number, message: string, detail: any) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

function messageFrom(detail: any, status: number): string {
  if (!detail) return status >= 500 ? "Something went wrong on our side. Please try again." : "Request failed.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors
    const first = detail[0];
    const field = first?.loc?.slice(-1)[0];
    return field ? `Please check “${field}”: ${first.msg}` : "Some fields aren't valid.";
  }
  if (detail.message) return detail.message;
  return "Request failed.";
}

export async function api<T = any>(path: string, opts: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let body = opts.body;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  let res: Response;
  try {
    res = await fetch(path, { ...opts, headers, body });
  } catch {
    throw new ApiError(0, "Can't reach the AI Factory server. Is the backend running?", null);
  }
  if (res.status === 204) return undefined as T;
  let data: any = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = data?.detail ?? data;
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
      setToken(null);
      if (!location.pathname.startsWith("/login")) location.href = "/login?expired=1";
    }
    throw new ApiError(res.status, messageFrom(detail, res.status), detail);
  }
  return data as T;
}
