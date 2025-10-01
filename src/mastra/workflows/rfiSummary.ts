import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { listRFIsTool, listProjectsTool } from "../tools/procore";
import { parseBlueprintTool } from "../tools/parseBlueprint";
import { ragSearchTool } from "../tools/rag";
import { estimatorAgent } from "../agents/estimatorAgent";

/**
 * Trigger: which company/project to analyze
 */
export const rfiSummaryWorkflow = createWorkflow({
  id: "sevenm.rfiSummary",
  triggerSchema: z.object({
    accessToken: z.string(),      // get from your token service in prod
    companyId: z.number().int(),
    projectId: z.number().int(),
    includeDocs: z.boolean().default(false),
  }),
});

/** Step 1: (optional) sanity check project */
const ensureProjectStep = createStep({
  id: "ensure-project",
  inputSchema: rfiSummaryWorkflow.triggerSchema,
  outputSchema: z.object({
    accessToken: z.string(),
    companyId: z.number(),
    projectId: z.number(),
  }),
  execute: async ({ inputData }) => {
    // (Optional) call listProjectsTool to verify access/project exists
    await listProjectsTool.execute({ input: {
      accessToken: inputData.accessToken,
      companyId: inputData.companyId,
    }});
    return {
      accessToken: inputData.accessToken,
      companyId: inputData.companyId,
      projectId: inputData.projectId,
    };
  },
});

/** Step 2: RFIs */
const fetchRFIsStep = createStep({
  id: "fetch-rfis",
  inputSchema: z.object({
    accessToken: z.string(),
    companyId: z.number(),
    projectId: z.number(),
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
  execute: async ({ inputData }) => {
    const { rfis } = await listRFIsTool.execute({ input: {
      accessToken: inputData.accessToken,
      companyId: inputData.companyId,
      projectId: inputData.projectId,
    }});
    return { rfis };
  },
});

/** Step 3: (optional) parse docs – here you’d map Procore doc URLs into parser */
const parseDocsStep = createStep({
  id: "parse-docs",
  inputSchema: z.object({
    rfis: z.array(z.any()),
    docUrls: z.array(z.string().url()).optional(), // wire from a future doc-listing step
  }),
  outputSchema: z.object({
    rfis: z.array(z.any()),
    parsed: z.object({
      parts: z.array(z.any()),
      titleBlock: z.record(z.string()).optional(),
      warnings: z.array(z.string()).optional(),
    }),
  }),
  execute: async ({ inputData }) => {
    if (!inputData.docUrls?.length) {
      return { rfis: inputData.rfis, parsed: { parts: [], titleBlock: {}, warnings: [] } };
    }
    const parsed = await parseBlueprintTool.execute({ input: { fileUrls: inputData.docUrls } });
    return { rfis: inputData.rfis, parsed };
  },
});

/** Step 4: RAG – fetch supporting SOPs, prior quotes, price lists */
const ragStep = createStep({
  id: "rag-context",
  inputSchema: z.object({
    rfis: z.array(z.any()),
    parsed: z.object({
      parts: z.array(z.any()),
      titleBlock: z.record(z.string()).optional(),
      warnings: z.array(z.string()).optional(),
    }),
  }),
  outputSchema: z.object({
    rfis: z.array(z.any()),
    parsed: z.any(),
    contextSnippets: z.array(z.object({ text: z.string(), source: z.string().optional() })),
  }),
  execute: async ({ inputData }) => {
    const { hits } = await ragSearchTool.execute({ input: { query: "RFI risks + submittals + schedule", topK: 6 }});
    return { rfis: inputData.rfis, parsed: inputData.parsed, contextSnippets: hits };
  },
});

/** Step 5: Summarize with the estimator agent */
const summarizeStep = createStep({
  id: "summarize",
  inputSchema: z.object({
    rfis: z.array(z.any()),
    parsed: z.any(),
    contextSnippets: z.array(z.object({ text: z.string(), source: z.string().optional() })),
  }),
  outputSchema: z.object({
    summary: z.string(),
  }),
  execute: async ({ inputData }) => {
    const context = `
RFIs:\n${JSON.stringify(inputData.rfis, null, 2)}
Parsed:\n${JSON.stringify(inputData.parsed, null, 2)}
Context:\n${inputData.contextSnippets.map(h => `- ${h.text} (${h.source ?? "unknown"})`).join("\n")}
    `;
    const res = await estimatorAgent.generate({
      prompt: `Create a concise RFI brief for estimators/PMs with bullets and a table.\n\n${context}`,
    });
    return { summary: res.text };
  },
});

/** Wire the graph */
export const committed = rfiSummaryWorkflow
  .then(ensureProjectStep)
  .then(fetchRFIsStep)
  .then(parseDocsStep)     // can be branched/conditional later
  .then(ragStep)
  .then(summarizeStep)
  .commit();
