// backend/services/index.ts

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createServer, request } from "http";

import parseRouter from "./routes.parse";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

import { Pool } from "pg";
import hintsRouter from "../routes/hints";

import { randomUUID } from "crypto";
import multer from "multer";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-west-1";
const DEFAULT_BUCKET = process.env.S3_BUCKET || "";

// AWS clients
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
  // NEW: carry through structured parts from donut_svc
  parts?: any[];
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
    if (nextToken) await new Promise((r) => setTimeout(r, 150));
  } while (nextToken);
  return pages;
}

// Donut/LayoutLMv3 call (FastAPI microservice)
async function runDonutLayoutLMv3(s3Key: string, bucket: string): Promise<any> {
  const svcUrl = process.env.DONUT_SVC_URL || "http://localhost:7000/analyze";
  const body = { bucket, key: s3Key, max_pages: 3, dpi: 220 };
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
    // CRITICAL: include structured parts from donut_svc
    parts: Array.isArray(donut?.parts) ? donut.parts : [],
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
    while (true) {
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
        const j = jobs.get(jobKey);
        if (j) {
          j.stage = "ERROR";
          j.error = "Textract FAILED";
          j.statusMsg = "Textract FAILED";
          jobs.set(jobKey, j);
        }
        break;
      }

      const j2 = jobs.get(jobKey);
      if (j2) {
        j2.stage = "RUNNING";
        j2.statusMsg = `Textract status: ${out.JobStatus || "IN_PROGRESS"}`;
        jobs.set(jobKey, j2);
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
 * EITHER:
 *  - multipart/form-data:  file=<pdf>, optional field "bucket"
 *  - application/json:     { s3Key: string, bucket?: string }
 */
app.post("/api/phase1/parse/start", upload.single("file"), async (req: Request, res: Response) => {
  try {
    let s3Key: string | undefined;
    let chosenBucket: string | undefined;

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
    } else if (req.is("application/json") && (req.body as any)?.s3Key) {
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
      region: REGION,
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

    // fire and forget
    void beginPolling(awsJobId, jobKey);

    return res.json({ jobId: jobKey, stage: state.stage });
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ error: err?.message || "Failed to start parse" });
  }
});

/** GET /api/phase1/parse/status/:jobId  (path-param style) */
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

/** GET /api/phase1/parse/status?jobId=...  (query-param style to match UI) */
app.get("/api/phase1/parse/status", (req: Request, res: Response) => {
  const jobId = (req.query.jobId as string | undefined)?.split("&")[0]; // tolerate extra params
  if (!jobId) return res.status(400).json({ error: "Missing jobId" });
  const job = jobs.get(jobId);
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

app.get("/api/material-costs", (_req, res) => {
  res.json({
    updatedAt: new Date().toISOString(),
    steel: { default: 0.75, a36: 0.75, a500: 0.80 },
    stainless: { default: 2.50, "304": 2.40, "316": 3.10 },
    aluminum: { default: 2.00, "5052": 1.90, "6061": 2.10 },
  });
});

app.post("/api/estimate/baseline", (req, res) => {
  const schema = z.object({
    normalized: z.any(),
    opts: z.object({
      hourlyRate: z.number().optional(),
      cutMinutesPerInch: z.number().optional(),
      weldMinutesPerInch: z.number().optional(),
      holeMinutesEach: z.number().optional(),
      finishMinutesPerFt2: z.number().optional(),
      overridesPerLb: z.record(z.number()).optional(),
    }).optional(),
  });
  const { normalized, opts } = schema.parse(req.body);

  const H = {
    hourlyRate: opts?.hourlyRate ?? 70,
    cutMinPerIn: opts?.cutMinutesPerInch ?? 0.12,
    weldMinPerIn: opts?.weldMinutesPerInch ?? 0.9,
    holeMinEach: opts?.holeMinutesEach ?? 0.6,
    finishMinPerFt2: opts?.finishMinutesPerFt2 ?? 3.0,
  };

  const DENSITY: Record<string, number> = { steel: 0.283, stainless: 0.289, aluminum: 0.098 };
  const DEFAULT_RATE_PER_LB: Record<string, number> = {
    steel: 0.75, stainless: 2.50, aluminum: 2.00, ...(opts?.overridesPerLb || {}),
  };

  const parts = (normalized?.parts ?? []) as any[];

  // fallback legacy split if no parts
  if (!Array.isArray(parts) || parts.length === 0) {
    const legacyLines = Array.isArray(normalized?.items) ? normalized.items : [];
    const sum = legacyLines.reduce((acc: number, it: any) => {
      const v = (it?.lineTotal ?? ((it?.qty && it?.unitPrice) ? (it.qty * it.unitPrice) : 0)) || 0;
      return acc + v;
    }, 0);
    const baseline = {
      materials: sum * 0.75,
      labor: sum * 0.20,
      overhead: sum * 0.05,
      method: "legacy-items",
    };
    const baselineCost = baseline.materials + baseline.labor + baseline.overhead;
    return res.json({ baseline, baselineCost });
  }

  function rectTubeArea(w: number, h: number, t: number) {
    const perim = 2 * (w + h);
    return perim * t; // in^2
  }
  function plateVolume(w: number, l: number, t: number) {
    return w * l * t; // in^3
  }

  let materialWeightLb = 0;
  let materialCost = 0;
  let laborMinutes = 0;
  const lines: any[] = [];

  for (const p of parts) {
    const mat = (p.material || "steel").toLowerCase();
    const dens = DENSITY[mat] ?? DENSITY.steel;
    const rateLb = DEFAULT_RATE_PER_LB[mat] ?? DEFAULT_RATE_PER_LB.steel;

    let wLb = 0, cutIn = 0, weldIn = 0, holeMin = 0, finishMin = 0;

    if (p.shape === "tube_rect" && p.widthIn && p.heightIn && p.thicknessIn) {
      const L = Number(p.lengthIn ?? 96);
      const A = rectTubeArea(Number(p.widthIn), Number(p.heightIn), Number(p.thicknessIn));
      const vol = A * L;
      wLb = vol * dens;
      cutIn += 2 * Math.max(Number(p.heightIn), Number(p.widthIn)) * 0.6;
    }

    if (p.shape === "plate" && p.widthIn && p.lengthIn && p.thicknessIn) {
      const vol = plateVolume(Number(p.widthIn), Number(p.lengthIn), Number(p.thicknessIn));
      wLb = vol * dens;
      cutIn += 2 * (Number(p.widthIn) + Number(p.lengthIn));
    }

    if (p.shape === "sheet" && p.thicknessIn) {
      if (p.features?.finish === "#4" && p.widthIn && p.lengthIn) {
        const ft2 = (Number(p.widthIn) * Number(p.lengthIn)) / 144.0;
        finishMin += ft2 * H.finishMinPerFt2;
      }
    }

    if (p.features?.holes && Array.isArray(p.features.holes)) {
      holeMin += p.features.holes.length * H.holeMinEach;
    }
    if (p.features?.weldIn) {
      weldIn += Number(p.features.weldIn);
    }

    const thisMat = wLb * rateLb;
    const thisLaborMin = (cutIn * H.cutMinPerIn) + (weldIn * H.weldMinPerIn) + holeMin + finishMin;

    materialWeightLb += wLb;
    materialCost += thisMat;
    laborMinutes += thisLaborMin;

    lines.push({
      shape: p.shape,
      material: mat,
      dims: { t: p.thicknessIn, w: p.widthIn, h: p.heightIn, L: p.lengthIn },
      weightLb: Number(wLb.toFixed(3)),
      materialCost: Number(thisMat.toFixed(2)),
      cutIn: Number(cutIn.toFixed(2)),
      weldIn: Number(weldIn.toFixed(2)),
      holeMin: Number(holeMin.toFixed(2)),
      finishMin: Number(finishMin.toFixed(2)),
      laborMin: Number(thisLaborMin.toFixed(2)),
    });
  }

  const laborCost = (laborMinutes / 60.0) * H.hourlyRate;
  const overhead = 0.05 * (materialCost + laborCost);
  const baselineCost = materialCost + laborCost + overhead;

  const baseline = {
    method: "parts-features",
    materialWeightLb: Number(materialWeightLb.toFixed(2)),
    materialCost: Number(materialCost.toFixed(2)),
    laborMinutes: Number(laborMinutes.toFixed(1)),
    laborCost: Number(laborCost.toFixed(2)),
    overhead: Number(overhead.toFixed(2)),
    lines,
    heuristics: H,
  };

  res.json({ baseline, baselineCost: Number(baselineCost.toFixed(2)) });
});

app.post("/api/estimate/delta", (req: Request, res: Response) => {
  const schema = z.object({ baselineCost: z.number(), features: z.any().optional() });
  const { baselineCost } = schema.parse(req.body);
  const deltaPct = 0.08; // stub
  const adjustedCost = Math.round(baselineCost * (1 + deltaPct) * 100) / 100;
  res.json({ deltaPct, adjustedCost });
});

// --- DASHBOARD / COMPANY / QUOTES / DRAWINGS STUBS ---

// Company profile
app.get("/api/company/:companyId", (req, res) => {
  const { companyId } = req.params;
  res.json({
    id: companyId,
    name: "Demo Fabrication Co.",
    location: "Anaheim, CA",
    currency: "USD",
    createdAt: "2024-01-01T00:00:00Z",
  });
});

// Dashboard stats
app.get("/api/dashboard/stats/:companyId", (req, res) => {
  res.json({
    openQuotes: 5,
    wonQuotes: 3,
    lostQuotes: 4,
    totalRevenue: 123456,
    lastUpdated: new Date().toISOString(),
  });
});

// Recent quotes
app.get("/api/quotes/recent/:companyId", (req, res) => {
  res.json([
    { id: "Q-001", title: "Ticketing Countertop", amount: 18500, status: "open", createdAt: "2025-08-20T12:10:00Z" },
    { id: "Q-002", title: "Charging Tables", amount: 9200, status: "won", createdAt: "2025-08-18T15:40:00Z" },
    { id: "Q-003", title: "Sulfur Barn Steel", amount: 43750, status: "open", createdAt: "2025-08-15T10:05:00Z" },
  ]);
});

// Drawings list
app.get("/api/drawings/:companyId", (req, res) => {
  res.json([
    { id: "D-1001", name: "CED6704-001-001_NC1.pdf", pages: 2, uploadedAt: "2025-08-19T09:00:00Z" },
  ]);
});

// --- MATERIAL COSTS (ARRAY SHAPE to satisfy materials.map) ---

// Array form (what your component expects)
app.get("/api/material-costs", (_req, res) => {
  res.json([
    { material: "steel",     grade: "default", pricePerLb: 0.75 },
    { material: "steel",     grade: "a36",     pricePerLb: 0.75 },
    { material: "steel",     grade: "a500",    pricePerLb: 0.80 },
    { material: "stainless", grade: "default", pricePerLb: 2.50 },
    { material: "stainless", grade: "304",     pricePerLb: 2.40 },
    { material: "stainless", grade: "316",     pricePerLb: 3.10 },
    { material: "aluminum",  grade: "default", pricePerLb: 2.00 },
    { material: "aluminum",  grade: "5052",    pricePerLb: 1.90 },
    { material: "aluminum",  grade: "6061",    pricePerLb: 2.10 },
  ]);
});

// (Optional) Keep the old object form around in case anything else uses it
app.get("/api/material-costs/object", (_req, res) => {
  res.json({
    updatedAt: new Date().toISOString(),
    steel: { default: 0.75, a36: 0.75, a500: 0.80 },
    stainless: { default: 2.50, "304": 2.40, "316": 3.10 },
    aluminum: { default: 2.00, "5052": 1.90, "6061": 2.10 },
  });
});


/* --------------------------------- Health --------------------------------- */

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: HAS_DB });
});

/* --------------------------- Mount legacy routers -------------------------- */

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
