// backend/routes/routes.parse.ts
import express from "express";
import { normalizeAndDraftQuoteFromS3 } from "../services/normalize-controller";

export const router = express.Router();

/**
 * DEV endpoint to run the full pipeline using an S3 PDF:
 *  1) Textract on S3 (TABLES/FORMS) -> adjudicator -> parsed.json
 *  2) Sonnet 4.5 (Bedrock) normalizes to schema-validated BOM
 *  3) Estimator (stub) -> Draft quote (stub)
 *
 * Path params:
 *   :docId   - your internal doc identifier (used for uploads/<docId>/parsed.json)
 *
 * Body (JSON):
 *   {
 *     "bucket": "your-s3-bucket",
 *     "key": "uploads/<docId>/source.pdf"
 *   }
 *
 * Example:
 *   POST /api/dev/normalize-s3/2d30994e9698df60b1e7ecb7022a742e
 *   { "bucket":"my-bucket", "key":"uploads/2d30994e9698df60b1e7ecb7022a742e/source.pdf" }
 */
router.post("/dev/normalize-s3/:docId", async (req, res) => {
  try {
    const { docId } = req.params as { docId: string };
    const { bucket, key } = (req.body ?? {}) as { bucket?: string; key?: string };

    if (!bucket || !key) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing required body fields: { bucket, key }" });
    }

    const result = await normalizeAndDraftQuoteFromS3({ docId, bucket, key });
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, error: err?.message || String(err) });
  }
});

/**
 * (Optional) lightweight health probe for this router group.
 */
router.get("/dev/health", (_req, res) => {
  res.json({ ok: true, service: "routes.parse", status: "healthy" });
});

// Keep both exports to be compatible with different import styles in your app.
export default router;
