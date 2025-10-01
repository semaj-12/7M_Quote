import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Minimal Procore REST client helper.
 * Procore uses OAuth2 Bearer tokens in the Authorization header.
 * The Projects endpoint expects ?company_id=...; RFIs accept ?project_id=...
 * Docs: OAuth & headers; Projects; RFIs. 
 * NOTE: Handle token storage/refresh securely in production. 
 */
const PROCORE_BASE = process.env.PROCORE_BASE ?? "https://api.procore.com/rest/v1.0";

async function procoreFetch<T>(
  path: string,
  accessToken: string,
  query: Record<string, string | number | undefined> = {}
): Promise<T> {
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const url = `${PROCORE_BASE}${path}${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`, // Procore OAuth bearer
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Procore ${path} ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Tool: List Projects
 * Inputs: companyId + accessToken
 * Output: array of projects (id, name)
 */
export const listProjectsTool = createTool({
  id: "procore.listProjects",
  description:
    "List Procore projects for a company. Use to locate the target project before fetching RFIs or documents.",
  inputSchema: z.object({
    accessToken: z.string().min(10),
    companyId: z.number().int().positive(),
    search: z.string().optional(),
  }),
  outputSchema: z.object({
    projects: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        number: z.string().nullable().optional(),
      })
    ),
  }),
  execute: async ({ input }) => {
    // GET /projects?company_id=...
    // Ref: Procore REST overview + Quick Start. 
    const data = await procoreFetch<any[]>(
      "/projects",
      input.accessToken,
      { company_id: input.companyId, filters: input.search }
    );
    const projects = (data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      number: p.project_number ?? null,
    }));
    return { projects };
  },
});

/**
 * Tool: List RFIs for a project
 * Inputs: projectId + companyId + accessToken
 * Output: array of RFIs (id, number, subject, status)
 */
export const listRFIsTool = createTool({
  id: "procore.listRFIs",
  description:
    "Fetch RFIs for a given Procore project. Use status to filter open/closed if desired.",
  inputSchema: z.object({
    accessToken: z.string().min(10),
    companyId: z.number().int().positive(),
    projectId: z.number().int().positive(),
    status: z.enum(["open", "closed", "draft"]).optional(),
  }),
  outputSchema: z.object({
    rfis: z.array(
      z.object({
        id: z.number(),
        rfi_number: z.string().nullable().optional(),
        subject: z.string().nullable().optional(),
        status: z.string().nullable().optional(),
        created_at: z.string().nullable().optional(),
        due_date: z.string().nullable().optional(),
      })
    ),
  }),
  execute: async ({ input }) => {
    // GET /rfis?project_id=...
    // Procore RFIs endpoint returns RFIs for a specific project ID.
    const data = await procoreFetch<any[]>(
      "/rfis",
      input.accessToken,
      { project_id: input.projectId }
    );
    const rfis = (data ?? [])
      .filter((r) => (input.status ? String(r.status).toLowerCase() === input.status : true))
      .map((r) => ({
        id: r.id,
        rfi_number: r.rfi_number ?? r.number ?? null,
        subject: r.subject ?? r.title ?? null,
        status: r.status ?? null,
        created_at: r.created_at ?? null,
        due_date: r.due_date ?? null,
      }));
    return { rfis };
  },
});
