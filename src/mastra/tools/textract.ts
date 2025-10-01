import { TextractClient, StartDocumentAnalysisCommand, GetDocumentAnalysisCommand } from "@aws-sdk/client-textract";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const REGION = process.env.AWS_REGION!;
const BUCKET = process.env.S3_BUCKET!;
const textract = new TextractClient({ region: REGION });
const s3 = new S3Client({ region: REGION });

async function uploadToS3(key: string, bytes: Buffer | Uint8Array) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: bytes }));
  return { bucket: BUCKET, key };
}

async function startAndWaitAnalysis(s3obj: { bucket: string; key: string }) {
  const start = await textract.send(new StartDocumentAnalysisCommand({
    DocumentLocation: { S3Object: { Bucket: s3obj.bucket, Name: s3obj.key } },
    FeatureTypes: ["FORMS", "TABLES"],
  }));
  const jobId = start.JobId!;
  // Poll (simple backoff)
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000 + i * 200));
    const out = await textract.send(new GetDocumentAnalysisCommand({ JobId: jobId }));
    if (out.JobStatus === "SUCCEEDED") return out;
    if (out.JobStatus === "FAILED") throw new Error("Textract failed");
  }
  throw new Error("Textract timeout");
}

// Normalize a subset of Textract blocks to simple KV + tables
function normalizeTextract(output: any) {
  const blocks = output.Blocks ?? [];
  const keyMap: Record<string, any> = {};
  const valueMap: Record<string, any> = {};
  const blockMap: Record<string, any> = {};
  for (const b of blocks) blockMap[b.Id] = b;

  for (const b of blocks) {
    if (b.BlockType === "KEY_VALUE_SET" && b.EntityTypes?.includes("KEY")) keyMap[b.Id] = b;
    if (b.BlockType === "KEY_VALUE_SET" && b.EntityTypes?.includes("VALUE")) valueMap[b.Id] = b;
  }
  const getText = (b: any): string => {
    const ids = b.Relationships?.find((r: any) => r.Type === "CHILD")?.Ids ?? [];
    return ids.map((id: string) => blockMap[id])
      .filter((c: any) => c.BlockType === "WORD" || c.BlockType === "SELECTION_ELEMENT")
      .map((c: any) => (c.Text ?? (c.SelectionStatus === "SELECTED" ? "[X]" : "")))
      .join(" ").trim();
  };
  const kv: Record<string, string> = {};
  for (const kId of Object.keys(keyMap)) {
    const key = keyMap[kId];
    const valId = key.Relationships?.find((r: any) => r.Type === "VALUE")?.Ids?.[0];
    const val = valId ? valueMap[valId] : undefined;
    const k = getText(key);
    const v = val ? getText(val) : "";
    if (k) kv[k] = v;
  }
  // Tables (flattened)
  const tables: string[][][] = [];
  for (const b of blocks) {
    if (b.BlockType !== "TABLE") continue;
    const cells: any[] = [];
    const cellIds = b.Relationships?.find((r: any) => r.Type === "CHILD")?.Ids ?? [];
    for (const id of cellIds) {
      const c = blockMap[id];
      if (c.BlockType === "CELL") {
        const text = getText(c);
        cells.push({ r: c.RowIndex, c: c.ColumnIndex, text });
      }
    }
    const maxR = Math.max(0, ...cells.map(c => c.r));
    const maxC = Math.max(0, ...cells.map(c => c.c));
    const grid = Array.from({ length: maxR }, () => Array<string>(maxC).fill(""));
    for (const c of cells) grid[c.r - 1][c.c - 1] = c.text;
    tables.push(grid);
  }
  return { kv, tables };
}

export const textractAnalyzeTool = createTool({
  id: "sevenm.textractAnalyze",
  description: "Analyze PDFs with Textract (FORMS + TABLES) and return normalized KV/Tables.",
  inputSchema: z.object({
    files: z.array(z.object({
      filename: z.string(),
      bytesB64: z.string().optional(), // base64 if coming from client
      s3Key: z.string().optional(),    // or if already in S3
    })).min(1)
  }),
  outputSchema: z.object({
    pages: z.array(z.object({
      kv: z.record(z.string()).optional(),
      tables: z.array(z.array(z.array(z.string()))).optional(),
    }))
  }),
  execute: async ({ input }) => {
    const results: any[] = [];
    for (const f of input.files) {
      let key = f.s3Key;
      if (!key) {
        const bytes = Buffer.from(f.bytesB64!, "base64");
        key = `uploads/${Date.now()}-${f.filename}`;
        await uploadToS3(key, bytes);
      }
      const out = await startAndWaitAnalysis({ bucket: BUCKET, key });
      results.push(normalizeTextract(out));
    }
    return { pages: results };
  },
});
