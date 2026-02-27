const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(await buildApiErrorMessage(response));
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

async function buildApiErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";
  let raw = "";

  try {
    if (contentType.includes("application/json")) {
      const data = await response.json();
      raw = data?.detail || data?.message || JSON.stringify(data);
    } else {
      raw = await response.text();
    }
  } catch {
    raw = "";
  }

  const normalized = normalizeApiError(raw);
  return normalized || `Erro HTTP ${response.status}`;
}

function normalizeApiError(raw: string): string {
  const text = (raw || "").trim();
  if (!text) return "";

  try {
    const parsed = JSON.parse(text);
    if (parsed?.errorMessages?.length) {
      const msg = String(parsed.errorMessages[0]);
      return humanizeJiraError(msg);
    }
    if (parsed?.detail) {
      return String(parsed.detail);
    }
  } catch {
    // no-op
  }

  return humanizeJiraError(text);
}

function humanizeJiraError(message: string): string {
  if (
    message.includes("/rest/api/3/search/jql") &&
    message.toLowerCase().includes("api solicitada foi removida")
  ) {
    return (
      "Seu backend ainda esta usando uma API antiga do Jira. Refaça o build do container backend e suba novamente " +
      "(docker compose build --no-cache backend && docker compose up -d)."
    );
  }
  return message;
}
