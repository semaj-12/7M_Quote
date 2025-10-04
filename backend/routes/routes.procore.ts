// backend/routes/routes.procore.ts
import express from "express";
import { listProjects, listRFIs } from "../services/procore-service";

export const procoreRouter = express.Router();

/**
 * GET /api/procore/projects
 * Headers: Authorization: Bearer <procore-access-token>   (or pass ?accessToken=)
 * Query:   companyId=123&search=foo (search optional)
 */
procoreRouter.get("/procore/projects", async (req, res) => {
  try {
    const headerToken = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const accessToken = (headerToken || (req.query.accessToken as string) || "").trim();
    const companyId = Number(req.query.companyId);
    const search = req.query.search ? String(req.query.search) : undefined;

    if (!accessToken || !companyId) {
      return res.status(400).json({ ok: false, error: "accessToken and companyId are required" });
    }

    const projects = await listProjects(accessToken, companyId, search);
    res.json({ ok: true, projects });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/**
 * GET /api/procore/rfis
 * Headers: Authorization: Bearer <procore-access-token>   (or pass ?accessToken=)
 * Query:   companyId=123&projectId=456
 */
procoreRouter.get("/procore/rfis", async (req, res) => {
  try {
    const headerToken = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const accessToken = (headerToken || (req.query.accessToken as string) || "").trim();
    const companyId = Number(req.query.companyId);
    const projectId = Number(req.query.projectId);

    if (!accessToken || !companyId || !projectId) {
      return res.status(400).json({ ok: false, error: "accessToken, companyId, and projectId are required" });
    }

    const rfis = await listRFIs(accessToken, projectId);
    res.json({ ok: true, rfis });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

export default procoreRouter;
