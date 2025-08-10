// backend/services/routes.upload.ts
import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const uploadDir = path.resolve(process.cwd(), "backend", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

let s3: S3Client | null = null;
function ensureS3() {
  const region = process.env.AWS_REGION || "us-west-1";
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!bucket) {
    throw new Error(
      "AWS_S3_BUCKET_NAME is not set. Add it to backend/.env (e.g., AWS_S3_BUCKET_NAME=my-bucket-name)"
    );
  }
  if (!s3) {
    s3 = new S3Client({
      region,
      // credentials are picked up from env automatically; no need to set here unless you want to override
    });
  }
  return { s3, bucket, region };
}

export const uploadRouter = Router();

uploadRouter.get("/health", (_req, res) => res.json({ ok: true }));

// POST /api/upload (form field: "file")
uploadRouter.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "No file uploaded" });

    const { s3, bucket, region } = ensureS3();

    const userId = 1; // TODO: replace with real user id
    const keyName = `drawings/${userId}/${Date.now()}-${req.file.filename}.pdf`;

    // Upload WITHOUT ACL (your bucket has ACLs disabled)
    const data = await fs.promises.readFile(req.file.path);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: keyName,
        Body: data,
        ContentType: "application/pdf",
      })
    );

    // Signed URL for viewing in iframe
    const viewUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: bucket,
        Key: keyName,
        ResponseContentType: "application/pdf",
      }),
      { expiresIn: 60 * 60 } // 1 hour
    );

    // Optional: plain S3 URL (not public)
    const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${keyName}`;

    return res.json({
      ok: true,
      s3Key: keyName,
      s3Url,
      viewUrl,
      localPath: req.file.path,
    });
  } catch (e: any) {
    console.error("[/api/upload] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Upload failed" });
  }
});
