// backend/services/normalize-controller.ts
import { buildParsedPayloadFromS3 } from "./parser-orchestrator";
import { normalizeWithSonnet } from "../ai/normalizer/normalizer";
import { tools } from "../ai/agent/tools";

/**
 * One-shot pipeline for S3 PDFs:
 * 1) Textract on S3 (TABLES/FORMS) -> adjudicator -> parsed.json
 * 2) Sonnet normalizer -> schema-validated BOM
 * 3) Estimator (stub) -> Draft quote (stub)
 */
export async function normalizeAndDraftQuoteFromS3(opts: {
  docId: string;
  bucket: string;
  key: string; // e.g. "uploads/<docId>/source.pdf"
}) {
  const { docId, bucket, key } = opts;

  // 1) Run Textract on S3, build & persist parsed payload
  await buildParsedPayloadFromS3(docId, bucket, key);

  // 2) Load parsed payload and normalize with Sonnet 4.5 (Bedrock)
  const parsed = await tools.get_parsed_chunks(docId);
  const bom = await normalizeWithSonnet(parsed);

  // 3) Estimate + Draft quote (stubs)
  const estimate = await tools.estimate_costs(bom);
  const quote = await tools.draft_quote(estimate);

  return { bom, estimate, quote };
}
