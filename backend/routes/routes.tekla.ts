// backend/routes/routes.tekla.ts
import express from "express";
import {
  teklaListJobs,
  teklaGetJob,
  teklaListJobParts,
  teklaCreateJob,
} from "../services/tekla-service";

export const teklaRouter = express.Router();

/**
 * GET /api/tekla/jobs
 * Headers: Authorization: Bearer <connector-api-key>  (optional if set in env)
 * Query:   base?=http://localhost:7000                     (optional override)
 */
teklaRouter.get("/tekla/jobs", async (req, res) => {
  try {
    const apiKey =
      req.header("authorization")?.replace(/^Bearer\s+/i, "") ||
      (process.env.TEKLA_CONNECTOR_API_KEY ?? "");
    const base = (req.query.base as string) || process.env.TEKLA_CONNECTOR_URL;

    const jobs = await teklaListJobs({ base, apiKey });
    res.json({ ok: true, jobs });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/**
 * GET /api/tekla/jobs/:id
 */
teklaRouter.get("/tekla/jobs/:id", async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const apiKey =
      req.header("authorization")?.replace(/^Bearer\s+/i, "") ||
      (process.env.TEKLA_CONNECTOR_API_KEY ?? "");
    const base = (req.query.base as string) || process.env.TEKLA_CONNECTOR_URL;

    const job = await teklaGetJob(id, { base, apiKey });
    res.json({ ok: true, job });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/**
 * GET /api/tekla/jobs/:id/parts
 */
teklaRouter.get("/tekla/jobs/:id/parts", async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const apiKey =
      req.header("authorization")?.replace(/^Bearer\s+/i, "") ||
      (process.env.TEKLA_CONNECTOR_API_KEY ?? "");
    const base = (req.query.base as string) || process.env.TEKLA_CONNECTOR_URL;

    const parts = await teklaListJobParts(id, { base, apiKey });
    res.json({ ok: true, parts });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/**
 * POST /api/tekla/jobs
 * Body: { name: string, status?: string }
 */
teklaRouter.post("/tekla/jobs", async (req, res) => {
  try {
    const apiKey =
      req.header("authorization")?.replace(/^Bearer\s+/i, "") ||
      (process.env.TEKLA_CONNECTOR_API_KEY ?? "");
    const base = (req.query.base as string) || process.env.TEKLA_CONNECTOR_URL;

    const job = await teklaCreateJob(req.body, { base, apiKey });
    res.json({ ok: true, job });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

export default teklaRouter;
