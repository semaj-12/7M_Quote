// backend/services/procore-service.ts
import fetch from "node-fetch"; // if needed; or global fetch on Node 18+
const PROCORE_BASE = process.env.PROCORE_BASE ?? "https://api.procore.com/rest/v1.0";

async function procoreFetch<T>(path: string, accessToken: string, query: Record<string, any> = {}): Promise<T> {
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const url = `${PROCORE_BASE}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`Procore ${path} ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function listProjects(accessToken: string, companyId: number, search?: string) {
  const data = await procoreFetch<any[]>("/projects", accessToken, { company_id: companyId, filters: search });
  return (data ?? []).map(p => ({ id: p.id, name: p.name, number: p.project_number ?? null }));
}

export async function listRFIs(accessToken: string, projectId: number) {
  const data = await procoreFetch<any[]>("/rfis", accessToken, { project_id: projectId });
  return (data ?? []).map(r => ({
    id: r.id, rfi_number: r.rfi_number ?? r.number ?? null, subject: r.subject ?? r.title ?? null,
    status: r.status ?? null, created_at: r.created_at ?? null, due_date: r.due_date ?? null
  }));
}
