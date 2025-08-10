// backend/services/routes.ts
import type express from "express";
import multer from "multer";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const log = (...args: any[]) => console.log("[routes]", ...args);

function getS3() {
  const region = process.env.AWS_REGION || "us-west-1";
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!bucket) {
    throw new Error("AWS_S3_BUCKET_NAME is not set. Add it to backend/.env");
  }
  const s3 = new S3Client({ region });
  return { s3, bucket, region };
}

// In-memory upload, we stream directly to S3
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// Helper: create a short-lived presigned GET URL for viewing
async function presignPdf(key: string, expiresInSec = 15 * 60) {
  const { s3, bucket } = getS3();
  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    // make sure browsers treat it as a PDF
    ResponseContentType: "application/pdf",
    // Optional filename when "save as" is used
    ResponseContentDisposition: `inline; filename="${path.basename(key)}"`,
  });
  return getSignedUrl(s3, cmd, { expiresIn: expiresInSec });
}

export async function registerRoutes(app: express.Express) {
  // --- Upload PDF → S3 ---
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, error: "No file received" });
      }

      const { s3, bucket } = getS3();

      // TODO: replace with real userId from auth/session
      const userId = "1";

      const orig = req.file.originalname || "upload.pdf";
      const ext = path.extname(orig) || ".pdf";
      const key = `drawings/${userId}/${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}${ext.toLowerCase()}`;

      // Upload the object (no ACLs needed with Object Ownership = bucket owner enforced)
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: req.file.buffer,
          ContentType: "application/pdf",
        })
      );

      // Presign a GET URL so the browser can display it, even if the bucket is private
      const viewUrl = await presignPdf(key);

      log(`PDF uploaded to S3: ${key}`);
      return res.json({
        ok: true,
        s3Key: key,
        // Plain S3 URL kept for reference, but not public:
        s3Url: `s3://${bucket}/${key}`,
        // Use this in your <iframe>:
        viewUrl,
        localPath: null, // not writing to disk in this route
      });
    } catch (e: any) {
      log("upload error:", e?.message || e);
      return res.status(500).json({ ok: false, error: e?.message || "Upload failed" });
    }
  });

  // --- Optional: refresh presigned URL if it expires while viewing ---
  // GET /api/file-url?key=drawings/1/12345-something.pdf
  app.get("/api/file-url", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const key = String(req.query.key || "");
      if (!key) {
        return res.status(400).json({ ok: false, error: "Missing 'key' query param" });
      }
      const url = await presignPdf(key); // default 15 minutes
      return res.json({ ok: true, viewUrl: url });
    } catch (e: any) {
      log("file-url error:", e?.message || e);
      return res.status(500).json({ ok: false, error: e?.message || "Failed to presign URL" });
    }
  });

  log("Upload route ready: POST /api/upload");
  log("File URL route ready: GET /api/file-url?key=...");
}
