// backend/services/index.ts

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createServer } from "http";

// Your existing routers/utilities
import { parseRouter } from "./routes.parse";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

import { Pool } from "pg";
import hintsRouter from "../routes/hints";

import { randomUUID } from "crypto";
import multer from "multer";

import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  TextractClient,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
  type Block,
} from "@aws-sdk/client-textract";

import { z } from "zod";

/* ---------------------------------- Setup --------------------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from backend/.env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = parseInt(process.env.PORT || "5000", 10);
const REGION = process.env.AWS_REGION || "us-west-1";
const DEFAULT_BUCKET = process.env.S3_BUCKET || "";

// AWS clients (region can also be picked up from env/instance metadata)
const s3 = new S3Client({ region: REGION });
const textract = new TextractClient({ region: REGION });

// Optional DB
const HAS_DB = !!process.env.DATABASE_URL;
app.set("hasDb", HAS_DB);
const db = HAS_DB ? new Pool({ connectionString: process.env.DATABASE_URL }) : undefined as any;

/* -------------------------- Security / Cache headers ----------------------- */

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Content-Security-Policy", "default-src 'self' data: blob:;");
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  } else {
    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
  }
  next();
});

/* ------------------------------ Local uploads dir ------------------------- */

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  log(`Created upload directory at ${uploadDir}`);
}

/* --------------------------------- Types ---------------------------------- */

export type JobStage = "QUEUED" | "RUNNING" | "DONUT" | "NORMALIZED" | "DONE" | "ERROR";

export type NormalizedLineItem = {
  description: string;
  qty?: number;
  unit?: string;
  material?: string;
  lengthIn?: number;
  widthIn?: number;
  thicknessIn?: number;
  unitPrice?: number;
  lineTotal?: number;
};

export type NormalizedDoc = {
  source: {
    bucket: string;
    key: string;
  };
  meta: {
    title?: string;
    vendor?: string;
    project?: string;
    issueDate?: string;
    pages: number;
  };
  keyValues: Record<string, string>;
  items: NormalizedLineItem[];
  totals?: {
    subtotal?: number;
    tax?: number;
    total?: number;
    currency?: string;
  };
};

export interface JobState {
  id: string;
  createdAt: number;
  s3Key: string;
  bucket?: string;
  textractJobId?: string;
  stage: JobStage;
  statusMsg?: string;
  textractPages?: any[];
  donut?: any;
  normalized?: NormalizedDoc;
  error?: string;
}

/* ------------------------------ In-memory jobs ---------------------------- */

const jobs = new Map<string, JobState>();

/* -------------------------------- Multer ---------------------------------- */

const storage = multer.memoryStorage();
const upload = multer({ storage });

/* -------------------------------- Helpers --------------------------------- */

function blocksToPages(blocks: Block[] | undefined) {
  const pages: Record<number, Block[]> = {};
  (blocks || []).forEach((b: any) => {
    const p = b.Page || b.PageNumber || 1;
    pages[p] = pages[p] || [];
    pages[p].push(b);
  });
  return Object.keys(pages)
    .map((n) => parseInt(n, 10))
    .sort((a, b) => a - b)
    .map((p) => ({ page: p, blocks: pages[p] }));
}

async function startTextractJob(s3Key: string, bucket: string): Promise<string> {
  if (!bucket) throw new Error("S3 bucket not provided");
  const cmd = new StartDocumentAnalysisCommand({
    DocumentLocation: { S3Object: { Bucket: bucket, Name: s3Key } },
    FeatureTypes: ["TABLES", "FORMS"],
  });
  const res = await textract.send(cmd);
  if (!res.JobId) throw new Error("Textract did not return a JobId");
  return res.JobId;
}

async function fetchAllPages(jobId: string) {
  let nextToken: string | undefined = undefined;
  const pages: any[] = [];
  do {
    const out = await textract.send(
      new GetDocumentAnalysisCommand({ JobId: jobId, NextToken: nextToken })
    );
    if (out.Blocks) pages.push({ blocks: out.Blocks });
    nextToken = out.NextToken;
    // safety sleep (Textract paginates results)
    if (nextToken) await new Promise((r) => setTimeout(r, 150));
  } while (nextToken);
  return pages;
}

// Donut/LayoutLMv3 call (FastAPI microservice). Requires Node 18+ (global fetch).
async function runDonutLayoutLMv3(s3Key: string, bucket: string): Promise<any> {
  const svcUrl = process.env.DONUT_SVC_URL || "http://localhost:7000/analyze";
  const body = {
    bucket,
    key: s3Key,
    max_pages: 3,
    dpi: 220,
  };
  const resp = await fetch(svcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Donut svc error ${resp.status}: ${txt}`);
  }
  return await resp.json();
}

function normalize(textractPages: any[], donut: any, s3Key: string, bucket: string): NormalizedDoc {
  const kv: Record<string, string> = { ...(donut?.kv || {}) };

  // Fallback title heuristic from first page lines
  const firstPage = textractPages?.[0]?.blocks || [];
  const firstLines = firstPage.filter((b: any) => b.BlockType === "LINE");
  const maybeTitle = (firstLines?.[0]?.Text || kv.Title || "").toString();

  const items: NormalizedLineItem[] = (donut?.items || []).map((it: any) => ({
    description: it.description || it.desc || "",
    qty: num(it.qty),
    unit: it.unit || undefined,
    material: it.material || undefined,
    lengthIn: num(it.lengthIn),
    widthIn: num(it.widthIn),
    thicknessIn: num(it.thicknessIn),
    unitPrice: num(it.unitPrice),
    lineTotal: num(it.lineTotal),
  }));

  const totals = donut?.totals || {};

  return {
    source: { bucket, key: s3Key },
    meta: {
      title: maybeTitle,
      vendor: kv.Vendor || "",
      project: kv.Project || "",
      issueDate: kv.Date || "",
      pages: textractPages?.length || 1,
    },
    keyValues: kv,
    items,
    totals: {
      subtotal: num(totals.subtotal),
      tax: num(totals.tax),
      total: num(totals.total),
      currency: kv.Currency || totals.currency || "USD",
    },
  };
}

const num = (v: any) => (v === undefined || v === null || v === "" ? undefined : Number(v));

/* ------------------------------- Poller loop ------------------------------ */

async function beginPolling(awsJobId: string, jobKey: string) {
  try {
    // Poll Textract until SUCCEEDED / FAILED
    while (true) {
      // GetDocumentAnalysis without NextToken just to check status
      const out = await textract.send(new GetDocumentAnalysisCommand({ JobId: awsJobId }));
      const job = jobs.get(jobKey);
      if (!job) return;

      if (out.JobStatus === "SUCCEEDED") {
        job.statusMsg = "Textract SUCCEEDED, fetching pages";
        const pages = await fetchAllPages(awsJobId);
        job.textractPages = pages;
        job.stage = "DONUT";
        job.statusMsg = "Running Donut/LayoutLMv3";
        jobs.set(jobKey, job);

        // Model call
        const donut = await runDonutLayoutLMv3(job.s3Key, job.bucket || DEFAULT_BUCKET || "");
        job.donut = donut;
        job.stage = "NORMALIZED";
        job.statusMsg = "Normalizing";
        job.normalized = normalize(pages, donut, job.s3Key, job.bucket || DEFAULT_BUCKET || "");
        job.stage = "DONE";
        job.statusMsg = "Done";
        jobs.set(jobKey, job);
        break;
      }

      if (out.JobStatus === "FAILED") {
        const job = jobs.get(jobKey);
        if (job) {
          job.stage = "ERROR";
          job.error = "Textract FAILED";
          job.statusMsg = "Textract FAILED";
          jobs.set(jobKey, job);
        }
        break;
      }

      // Still running
      const j = jobs.get(jobKey);
      if (j) {
        j.stage = "RUNNING";
        j.statusMsg = `Textract status: ${out.JobStatus || "IN_PROGRESS"}`;
        jobs.set(jobKey, j);
      }

      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch (err: any) {
    const job = jobs.get(jobKey);
    if (job) {
      job.stage = "ERROR";
      job.error = err?.message || String(err);
      job.statusMsg = "Pipeline ERROR";
      jobs.set(jobKey, job);
    }
    console.error("[phase1] poller error:", err);
  }
}

/* ------------------------------ Phase-1 routes ----------------------------- */

/**
 * POST /api/phase1/parse/start
 * Accepts EITHER:
 *  - multipart/form-data:  file=<pdf>, optional field "bucket"
 *  - application/json:     { s3Key: string, bucket?: string }
 */
app.post("/api/phase1/parse/start", upload.single("file"), async (req: Request, res: Response) => {
  try {
    let s3Key: string | undefined;
    let chosenBucket: string | undefined;

    // 1) Multipart: upload to S3 (or use provided bucket override)
    if (req.file) {
      const bucketField = (req.body?.bucket as string | undefined)?.trim();
      chosenBucket = bucketField || DEFAULT_BUCKET;
      if (!chosenBucket) {
        return res.status(400).json({ error: "Missing S3 bucket (set body.bucket or S3_BUCKET in env)" });
      }
      const keyBase = `${Date.now()}-${randomUUID()}.pdf`;
      s3Key = `uploads/${keyBase}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: chosenBucket,
          Key: s3Key,
          Body: req.file.buffer,
          ContentType: "application/pdf",
        })
      );
    }
    // 2) JSON: use provided s3Key (and optional bucket)
    else if (req.is("application/json") && (req.body as any)?.s3Key) {
      const schema = z.object({
        s3Key: z.string().min(1),
        bucket: z.string().min(1).optional(),
      });
      const body = schema.parse(req.body);
      s3Key = body.s3Key;
      chosenBucket = body.bucket || DEFAULT_BUCKET;
    } else {
      return res.status(400).json({ error: "Provide a multipart 'file' OR JSON { s3Key, bucket? }" });
    }

    if (!s3Key) return res.status(400).json({ error: "Missing S3 key" });
    if (!chosenBucket) return res.status(400).json({ error: "Missing S3 bucket" });

    console.log("[phase1] starting textract", {
      region: process.env.AWS_REGION,
      bucket: chosenBucket,
      key: s3Key,
    });

    const awsJobId = await startTextractJob(s3Key, chosenBucket);

    const jobKey = randomUUID();
    const state: JobState = {
      id: jobKey,
      createdAt: Date.now(),
      s3Key,
      bucket: chosenBucket,
      textractJobId: awsJobId,
      stage: "RUNNING",
      statusMsg: "Textract STARTED",
    };
    jobs.set(jobKey, state);

    // Kick off poller (fire-and-forget)
    beginPolling(awsJobId, jobKey);

    return res.json({ jobId: jobKey, stage: state.stage });
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ error: err?.message || "Failed to start parse" });
  }
});

/** GET /api/phase1/parse/status/:jobId */
app.get("/api/phase1/parse/status/:jobId", (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({
    id: job.id,
    stage: job.stage,
    status: job.statusMsg,
    error: job.error,
    normalized: job.stage === "DONE" ? job.normalized : undefined,
  });
});

/* ---------------------------- Baseline / Delta ----------------------------- */

app.post("/api/estimate/baseline", (req: Request, res: Response) => {
  // Accept normalized doc + optional overrides
  const schema = z.object({
    normalized: z.any(),
    opts: z.object({
      hourlyRate: z.number().optional(),   // $/hr for labor, default 65
      overheadPct: z.number().optional(),  // default 0.05
      materialsPctOfSum: z.number().optional(), // legacy fallback when no items/parts
    }).optional()
  });

  const { normalized, opts } = schema.parse(req.body);
  const hourlyRate = opts?.hourlyRate ?? Number(process.env.HOURLY_RATE ?? 65);
  const overheadPct = opts?.overheadPct ?? 0.05;
  const legacyMatPct = opts?.materialsPctOfSum ?? 0.75;

  const doc = normalized as any;

  // ------- 1) Legacy materials/labor from line items (if present) -------
  const lines = Array.isArray(doc?.items) ? doc.items : [];
  const sumFromItems = lines.reduce((acc: number, it: any) => {
    const line = (it?.lineTotal ?? ((it?.qty && it?.unitPrice) ? (it.qty * it.unitPrice) : 0)) || 0;
    return acc + line;
  }, 0);

  const legacyBaseline = {
    materials: sumFromItems * legacyMatPct,
    labor: sumFromItems * (1 - legacyMatPct - overheadPct),
    overhead: sumFromItems * overheadPct,
  };

  // ------- 2) Labor from parts.features (new, preferred when present) -------
  type Hole = { size?: string | null };
  type PartsFeatures = {
    bends?: { count?: number; hasRadiusBends?: boolean };
    holes?: { countersunk?: Hole[]; tapped?: Hole[] };
    weld?: { types?: string[]; lengthHintIn?: number | null };
    notes?: string[];
  };
  type Part = {
    sheet?: string | null;
    partNo?: string | null;
    qty?: number | null;
    material?: string | null;
    gauge?: number | null;
    finish?: string | null;
    features?: PartsFeatures;
  };

  const parts: Part[] = Array.isArray(doc?.parts) ? doc.parts : [];

  const estimateLaborMinutesFromParts = (ps: Part[]) => {
    let minutes = 0;

    const add = (m: number, count = 1) => { minutes += (m * count); };

    for (const p of ps) {
      const qty = Number(p?.qty ?? 1) || 1;
      const f = p?.features || {};
      const bendsCount = Math.max(0, Number(f?.bends?.count ?? 0));
      const hasRadius = !!f?.bends?.hasRadiusBends;

      const cskCount = (f?.holes?.countersunk || []).length;
      const tapCount = (f?.holes?.tapped || []).length;

      const weldTypes = (f?.weld?.types || []).map((x) => (x || "").toUpperCase());
      const hasSpot = weldTypes.some(t => t.includes("SPOT"));
      const hasWeld = weldTypes.some(t => t.includes("WELD"));

      // --- Rules (tunable) ---
      // bends
      if (bendsCount > 0) add(1.2 * bendsCount, qty);          // 1.2 min per bend
      if (hasRadius) add(0.8, qty);                            // +0.8 min if radius bends present

      // holes
      if (cskCount > 0) add(0.6 * cskCount, qty);              // 0.6 min per countersink
      if (tapCount > 0)  add(0.9 * tapCount, qty);             // 0.9 min per tapped hole

      // weld
      if (hasSpot) add(6, qty);                                // 6 min per part if spot welds
      if (hasWeld) add(10, qty);                               // 10 min per part if welded joints

      // finish
      const finish = (p?.finish || "").toUpperCase();
      if (finish.includes("POWDER COAT")) add(4, qty);         // 4 min per part

      // material / gauge bump
      const material = (p?.material || "").toUpperCase();
      const gauge = p?.gauge ?? null;
      const needsBump =
        material.includes("A36") ||
        material.includes("A500") ||
        (gauge !== null && gauge <= 14);

      if (needsBump) minutes *= 1.10; // +10%
    }

    return Math.round(minutes * 100) / 100;
  };

  const laborMinutesFromParts = parts.length ? estimateLaborMinutesFromParts(parts) : 0;
  const laborCostFromParts = Math.round(((laborMinutesFromParts / 60) * hourlyRate) * 100) / 100;

  // If we have parts, prefer that labor number; otherwise fallback to legacy split.
  const baseline = parts.length
    ? {
        materials: 0, // phase-1: unknown until you add weight/price; keep 0 or compute from items if you wish
        labor: laborCostFromParts,
        overhead: laborCostFromParts * overheadPct,
        laborFromPartsMinutes: laborMinutesFromParts,
        hourlyRate,
        method: "parts-features"
      }
    : {
        ...legacyBaseline,
        method: "legacy-items"
      };

  const baselineCost = baseline.materials + baseline.labor + baseline.overhead;

  res.json({ baseline, baselineCost });
});


app.post("/api/estimate/delta", (req: Request, res: Response) => {
  const schema = z.object({ baselineCost: z.number(), features: z.any().optional() });
  const { baselineCost } = schema.parse(req.body);
  const deltaPct = 0.08; // stub
  const adjustedCost = Math.round(baselineCost * (1 + deltaPct) * 100) / 100;
  res.json({ deltaPct, adjustedCost });
});

/* --------------------------------- Health --------------------------------- */

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: HAS_DB });
});

/* --------------------------- Mount legacy routers -------------------------- */
/* IMPORTANT: Phase-1 routes are defined BEFORE these to avoid collisions.    */

app.use("/api", parseRouter);
if (db) app.use("/api/hints", hintsRouter(db));

/* ------------------------------ Start server ------------------------------- */

(async () => {
  const server = createServer(app);
  await setupVite(app, server);
  await serveStatic(app);
  await registerRoutes(app);

  server.listen(PORT, "0.0.0.0", () => {
    log(`[services] HTTP server running at http://localhost:${PORT}`);
    log(`[services] Upload directory: ${uploadDir}`);
    log(`[services] DB mode: ${HAS_DB ? "Connected (DATABASE_URL set)" : "NO DB (bypassing writes)"}`);
  });
})();
