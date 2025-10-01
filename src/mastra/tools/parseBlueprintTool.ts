import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { textractAnalyzeTool } from "./textract";

const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

/**
 * Orchestrates parsing:
 * 1) Textract → KV/tables
 * 2) Send pages + (optional) images to ML service (Donut/LayoutLM) for JSON extraction
 * 3) Normalize to 7M schema
 */
export const parseBlueprintTool = createTool({
  id: "sevenm.parseBlueprint",
  description: "Parse PDFs/drawings into normalized 7M JSON using Textract + ML (Donut/LayoutLM).",
  inputSchema: z.object({
    files: z.array(z.object({
      filename: z.string(),
      bytesB64: z.string().optional(),
      s3Key: z.string().optional(),
    })).min(1)
  }),
  outputSchema: z.object({
    titleBlock: z.record(z.string()).optional(),
    bom: z.array(z.object({
      tag: z.string().optional(),
      material: z.string().optional(),
      qty: z.number().optional(),
      dimensions: z.record(z.string()).optional(),
      notes: z.string().optional(),
    })).optional(),
    warnings: z.array(z.string()).optional(),
  }),
  execute: async ({ input }) => {
    const tex = await textractAnalyzeTool.execute({ files: input.files });

    const resp = await fetch(`${ML_URL}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textract: tex }),
    });
    if (!resp.ok) throw new Error(`ML service parse failed: ${await resp.text()}`);
    const ml = await resp.json();

    // Expect ML to return { title_block: {...}, bom: [...], warnings: [...] }
    // Minimal normalization here; adjust as you stabilize your schema.
    return {
      titleBlock: ml.title_block ?? {},
      bom: ml.bom ?? [],
      warnings: ml.warnings ?? [],
    };
  },
});
