// backend/services/s3-service.ts
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import fs from "fs";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Read env AFTER dotenv
const AWS_REGION = process.env.AWS_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

const s3 =
  AWS_REGION && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY
    ? new S3Client({
        region: AWS_REGION,
        credentials: {
          accessKeyId: AWS_ACCESS_KEY_ID,
          secretAccessKey: AWS_SECRET_ACCESS_KEY,
        },
      })
    : null;

export async function validateS3Configuration() {
  if (!AWS_S3_BUCKET_NAME || !AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    const missing = [
      !AWS_S3_BUCKET_NAME && "AWS_S3_BUCKET_NAME",
      !AWS_REGION && "AWS_REGION",
      !AWS_ACCESS_KEY_ID && "AWS_ACCESS_KEY_ID",
      !AWS_SECRET_ACCESS_KEY && "AWS_SECRET_ACCESS_KEY",
    ]
      .filter(Boolean)
      .join(", ");
  return { valid: false, message: `Missing AWS credentials or bucket name: ${missing}` };
  }

  if (!s3) {
    return { valid: false, message: "S3 client not initialized" };
  }
  return { valid: true, message: "S3 configured" };
}

export async function uploadPdfToS3(localPath: string, originalName: string, userId: number) {
  if (!s3 || !AWS_S3_BUCKET_NAME) {
    throw new Error("S3 not configured");
  }

  const fileBuffer = fs.readFileSync(localPath);
  const ext = originalName.toLowerCase().endsWith(".pdf") ? ".pdf" : "";
  const key = `drawings/${userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;

  const put = new PutObjectCommand({
    Bucket: AWS_S3_BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: "application/pdf",
  });

  await s3.send(put);

  const signedUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: AWS_S3_BUCKET_NAME,
      Key: key,
    }),
    { expiresIn: 60 } // note: this would normally be GetObject for viewing; keep Put for parity with your code
  );

  // For viewing you’ll probably want a GET signed URL:
  // const signedUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: AWS_S3_BUCKET_NAME, Key: key }), { expiresIn: 3600 });

  return { key, url: `https://s3.${AWS_REGION}.amazonaws.com/${AWS_S3_BUCKET_NAME}/${key}`, signedUrl };
}
