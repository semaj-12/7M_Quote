// backend/services/routes.ts
import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";

import { storage } from "./storage";
import { uploadPdfToS3, validateS3Configuration } from "./s3-service";

// -------------------- Multer setup --------------------
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// -------------------- Route registration --------------------
export async function registerRoutes(app: Express): Promise<Server> {
  // Serve uploaded files (local fallback) safely
  app.get("/uploads/:filename", (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(uploadDir, filename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).send("File not found");
      }

      if (filePath.endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        res.setHeader("Access-Control-Allow-Origin", "*");
      }

      return res.sendFile(filePath);
    } catch (err: any) {
      console.error("Error serving /uploads file:", err);
      return res.status(500).send("Failed to serve file");
    }
  });

  // -------------------- PDF Upload (S3 + local fallback, NO-DB mode supported) --------------------
  app.post("/api/drawings/upload", upload.single("pdf"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userIdRaw = req.body.userId;
      const userId = Number(userIdRaw);
      if (!userId || Number.isNaN(userId)) {
        return res.status(400).json({ message: "User ID is required" });
      }

      // Try S3 first; if misconfigured or fails, fall back to local
      let s3Key: string | undefined;
      let s3Url: string | undefined;
      let storageType: "s3" | "local" = "local";

      try {
        // Validate S3 config (checks creds/bucket and sets CORS/policy)
        const s3Config = await validateS3Configuration();
        if (!s3Config.valid) {
          console.warn("S3 not configured properly:", s3Config.message);
          throw new Error("S3 configuration invalid");
        }

        // Upload to S3
        const s3Result = await uploadPdfToS3(req.file.path, req.file.originalname, userId);
        s3Key = s3Result.key;
        s3Url = s3Result.signedUrl || s3Result.url;
        storageType = "s3";
        console.log(`PDF successfully uploaded to S3: ${s3Key}`);
      } catch (s3Error: any) {
        console.warn("S3 upload failed, using local storage:", s3Error?.message || s3Error);
        // Keep storageType as "local" and continue
      }

      // Build drawing record payload
      const drawingData = {
        userId,
        name: req.body.name || req.file.originalname,
        originalName: req.file.originalname,
        filePath: req.file.filename, // local filename (for local fallback retrieval)
        fileSize: req.file.size,
        status: "uploaded" as const,
        s3Key,
        s3Url,
        storageType,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // NO-DB fallback: skip DB write if DATABASE_URL is not set (flag set in index.ts)
      const hasDb = req.app.get("hasDb") === true;

      let drawing: any;
      if (hasDb) {
        drawing = await storage.createDrawing(drawingData as any);
      } else {
        console.warn("DATABASE_URL not set — skipping DB write and returning minimal payload");
        drawing = { id: 0, ...drawingData };
      }

      // Mock async processing step (optional)
      setTimeout(async () => {
        const processed = {
          ...drawingData,
          status: "processed" as const,
          updatedAt: new Date(),
          extractedData: {
            // placeholder for future AI results
            summary: "Processing complete",
          },
        };

        if (hasDb && drawing?.id) {
          try {
            await storage.updateDrawing(drawing.id, processed as any);
          } catch (err) {
            console.warn("Failed to update drawing after processing (DB):", (err as any)?.message);
          }
        }
      }, 2000);

      return res.status(201).json(drawing);
    } catch (error: any) {
      console.error("Upload error:", error);
      return res
        .status(500)
        .json({ message: "Failed to upload drawing", error: error?.message || "Unknown error" });
    }
  });

  // Create and return HTTP server (index.ts will .listen(...) on this)
  const server = createServer(app);
  return server;
}

export default registerRoutes;
