import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createServer } from "http";
import { parseRouter } from "./routes.parse";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from backend/.env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
app.use(cors());
app.use(express.json());

// Flag for “no DB” fallback
const HAS_DB = !!process.env.DATABASE_URL;
app.set("hasDb", HAS_DB);

// Mount parse routes
app.use("/api", parseRouter);

// Ensure uploads dir exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  log(`Created upload directory at ${uploadDir}`);
}

// Headers + correct caching policy
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Content-Security-Policy", "default-src 'self' data: blob:;");

  // Never cache API responses (fixes polling getting stuck)
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  } else {
    // Cache static/build assets
    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
  }
  next();
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: HAS_DB });
});

(async () => {
  const server = createServer(app);

  await setupVite(app, server);
  await serveStatic(app);
  await registerRoutes(app);

  const httpPort = 5000;
  server.listen(httpPort, "0.0.0.0", () => {
    log(`HTTP server running at http://localhost:${httpPort}`);
    log(`Upload directory: ${uploadDir}`);
    log(`DB mode: ${HAS_DB ? "Connected (DATABASE_URL set)" : "NO DB (bypassing writes)"}`);
  });
})();
