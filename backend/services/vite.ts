// backend/services/vite.ts
import type { Express } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer, type ViteDevServer } from "vite";

export function log(msg: string) {
  console.log(`[services] ${msg}`);
}

function paths() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const root = path.resolve(__dirname, "../../");      // project root
  const dist = path.resolve(root, "dist");
  const indexHtml = path.resolve(dist, "index.html");
  const viteConfigFile = path.resolve(root, "vite.config.ts");
  return { root, dist, indexHtml, viteConfigFile };
}

/**
 * Attach Vite dev middleware in development (no-op in production).
 * IMPORTANT: override/disable proxy here to avoid proxy loops,
 * and don't apply Vite middleware to /api/* routes.
 */
export async function setupVite(app: Express, httpServer?: import("http").Server) {
  if (process.env.NODE_ENV === "production") return;

  const { root, viteConfigFile } = paths();

  // Create a Vite dev server in middleware mode,
  // but OVERRIDE the proxy so it does not re-proxy /api back to :5000.
  const vite: ViteDevServer = await createViteServer({
    root,
    configFile: viteConfigFile,
    server: {
      middlewareMode: true,
      hmr: httpServer ? { server: httpServer } : undefined,
      // Disable proxy here to prevent loops
      proxy: undefined as any
    },
    appType: "custom",
  });

  // Only apply Vite middlewares for non-API paths
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    return vite.middlewares(req, res, next);
  });

  log("Vite dev middleware attached");
}

/**
 * Serve the built client in production.
 */
export async function serveStatic(app: Express) {
  if (process.env.NODE_ENV !== "production") return;

  const { dist, indexHtml } = paths();
  if (!fs.existsSync(dist)) {
    log("No dist/ folder found; skipping static serving");
    return;
  }

  const serveStatic = (await import("serve-static")).default;
  app.use(serveStatic(dist));

  app.use("*", async (_req, res, next) => {
    try {
      const html = fs.readFileSync(indexHtml, "utf-8");
      res.setHeader("Content-Type", "text/html");
      res.status(200).end(html);
    } catch (err) {
      next(err);
    }
  });

  log("Static assets served from dist/");
}
