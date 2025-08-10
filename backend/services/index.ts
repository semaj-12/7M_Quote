// backend/services/index.ts
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createServer } from "http";

import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// ----- Resolve __dirname / load .env -----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from backend/.env (VERY IMPORTANT)
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// ----- Express app -----
const app = express();
app.use(cors());
app.use(express.json());

// Flag for “no DB” fallback used in routes.ts
const HAS_DB = !!process.env.DATABASE_URL;
app.set("hasDb", HAS_DB);

// Ensure uploads dir exists (multer uses this path)
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  log(`Created upload directory at ${uploadDir}`);
}

// Basic headers for static/PDF safety
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Content-Security-Policy", "default-src 'self' data: blob:;");
  res.setHeader("Cache-Control", "public, max-age=3600");
  next();
});

// Simple health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: HAS_DB });
});

(async () => {
  // Create HTTP server FIRST so Vite HMR can attach
  const server = createServer(app);

  // Attach Vite dev middleware in development
  await setupVite(app, server);

  // Serve built client in production
  await serveStatic(app);

  // Register API routes
  await registerRoutes(app);

  // Start HTTP (match your vite proxy target http://localhost:5000)
  const httpPort = 5000;
  server.listen(httpPort, "0.0.0.0", () => {
    log(`HTTP server running at http://localhost:${httpPort}`);
    log(`Upload directory: ${uploadDir}`);
    log(`DB mode: ${HAS_DB ? "Connected (DATABASE_URL set)" : "NO DB (bypassing writes)"}`);
  });
})();
