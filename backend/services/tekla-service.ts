// backend/services/tekla-service.ts
// Server-side wrapper around your Tekla connector (REST/gRPC gateway).
// - Reads base URL from TEKLA_CONNECTOR_URL (falls back to http://localhost:7000)
// - Optional API key via TEKLA_CONNECTOR_API_KEY or call-time param
// - Adds timeout + retry for resilience

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type TeklaJob = {
  id: string;
  name: string;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TeklaPart = {
  id: string;
  job_id: string;
  mark?: string | null;
  material?: string | null;
  quantity?: number | null;
  dims?: Record<string, string | number | null>;
};

const DEFAULT_BASE = process.env.TEKLA_CONNECTOR_URL ?? "http://localhost:7000";
const DEFAULT_API_KEY = process.env.TEKLA_CONNECTOR_API_KEY || "";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 2;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function teklaFetch<T>(
  path: string,
  {
    method = "GET",
    base = DEFAULT_BASE,
    apiKey = DEFAULT_API_KEY,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
  }: {
    method?: HttpMethod;
    base?: string;
    apiKey?: string;
    body?: any;
    timeoutMs?: number;
    retries?: number;
  } = {}
): Promise<T> {
  const url = `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(t);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Tekla ${method} ${url} ${res.status}: ${text}`);
      }

      // Some endpoints might return 204
      if (res.status === 204) return undefined as unknown as T;

      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(t);
      lastErr = err;

      // Only retry on network/timeout or 5xx; simple check:
      const msg = String(err?.toString?.() ?? err);
      const retryable =
        msg.includes("AbortError") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ENOTFOUND") ||
        msg.includes("fetch failed") ||
        /5\d\d:/.test(msg);

      if (attempt < retries && retryable) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

/** List Tekla jobs */
export async function teklaListJobs(params?: {
  base?: string;
  apiKey?: string;
}): Promise<TeklaJob[]> {
  const out = await teklaFetch<{ jobs: TeklaJob[] }>(`/jobs`, params);
  return Array.isArray(out?.jobs) ? out.jobs : [];
}

/** Get a single job by id */
export async function teklaGetJob(id: string, params?: {
  base?: string;
  apiKey?: string;
}): Promise<TeklaJob> {
  if (!id) throw new Error("teklaGetJob: id is required");
  return teklaFetch<TeklaJob>(`/jobs/${encodeURIComponent(id)}`, params);
}

/** List parts for a job */
export async function teklaListJobParts(id: string, params?: {
  base?: string;
  apiKey?: string;
}): Promise<TeklaPart[]> {
  if (!id) throw new Error("teklaListJobParts: id is required");
  const out = await teklaFetch<{ parts: TeklaPart[] }>(`/jobs/${encodeURIComponent(id)}/parts`, params);
  return Array.isArray(out?.parts) ? out.parts : [];
}

/** (Optional) Create a job in Tekla via connector */
export async function teklaCreateJob(
  job: { name: string; status?: string },
  params?: { base?: string; apiKey?: string }
): Promise<TeklaJob> {
  if (!job?.name) throw new Error("teklaCreateJob: name is required");
  return teklaFetch<TeklaJob>(`/jobs`, { ...params, method: "POST", body: job });
}
