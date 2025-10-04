import { Adjudicator, saveParsedPayload } from "../ai/adjudicator/adjudicator";
import { startAnalysis, getAnalysis } from "./textract";
import type { Block } from "@aws-sdk/client-textract";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function runTextractOnS3(bucket: string, key: string) {
  const jobId = await startAnalysis(bucket, key);

  // Poll until SUCCEEDED/FAILED
  while (true) {
    const { status, blocks } = await getAnalysis(jobId);
    if (status === "SUCCEEDED") return { blocks };
    if (status === "FAILED" || status === "PARTIAL_SUCCESS") {
      throw new Error(`Textract job ${jobId} ended with status: ${status}`);
    }
    await sleep(1500);
  }
}

/** Group WORD blocks by page into: { pages: [{page, blocks: Block[]}, ...] } */
function groupWordBlocksByPage(blocks: Block[]) {
  const map = new Map<number, Block[]>();
  for (const b of blocks || []) {
    if (b.BlockType !== "WORD") continue;
    const page = (b.Page ?? 1);
    if (!map.has(page)) map.set(page, []);
    map.get(page)!.push(b);
  }
  return { pages: Array.from(map.entries()).map(([page, blks]) => ({ page, blocks: blks })) };
}

/** Build parsedPayload via Textract (S3), save to uploads/<docId>/parsed.json */
export async function buildParsedPayloadFromS3(docId: string, bucket: string, key: string) {
  const { blocks } = await runTextractOnS3(bucket, key);
  const { pages } = groupWordBlocksByPage(blocks);

  const adj = new Adjudicator(docId);
  for (const p of pages) {
    adj.addTextract(p.blocks as any, p.page);
  }
  adj.addNote("Parsed from Textract WORD blocks (S3 source). Donut/LayoutLMv3 pending.");

  const parsedPayload = adj.finalize();
  const file = await saveParsedPayload(docId, parsedPayload);
  return { file, parsedPayload };
}
