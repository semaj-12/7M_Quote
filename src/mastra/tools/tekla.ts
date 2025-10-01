import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Tekla connector stub.
 * In production, this would call a local REST/gRPC service you ship
 * that wraps the Tekla Open API (.NET).
 */
export const listTeklaJobsTool = createTool({
  id: "tekla.listJobs",
  description: "List fabrication jobs from Tekla PowerFab/Structures via connector service.",
  inputSchema: z.object({
    connectorUrl: z.string().url(),
    apiKey: z.string().optional(), // or Windows auth
  }),
  outputSchema: z.object({
    jobs: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        status: z.string().optional(),
      })
    ),
  }),
  execute: async ({ input }) => {
    const res = await fetch(`${input.connectorUrl}/jobs`, {
      headers: { "Authorization": input.apiKey ? `Bearer ${input.apiKey}` : "" },
    });
    if (!res.ok) throw new Error(`Tekla connector error: ${res.statusText}`);
    return res.json();
  },
});
