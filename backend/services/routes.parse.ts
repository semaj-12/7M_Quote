import express from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { startAnalysis, getAnalysis } from "./textract";
import { parseDrawing } from "./parsers/drawingParser";
import {
  buildTakeoffFromTables,
  buildFallbackTakeoffFromMeasurements,
  type TakeoffItem as ParsedTakeoffItem,
  type TextractTable,
} from "./parsers/takeoffBuilder";
import { computeWeightFromDatasets } from "./estimation/weightEngine";
import { estimateCosts, type TakeoffItem as EstTakeoffItem } from "./estimation/estimateCosts";
import { pricingProvider } from "./estimation/pricingAdapter";
import { analyzeBlueprintWithAI } from "./ai-service";

export const parseRouter = express.Router();

let s3: S3Client | null = null;
function ensureS3() {
  const region = process.env.AWS_REGION || "us-west-1";
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!bucket) {
    throw new Error("AWS_S3_BUCKET_NAME is not set. Add it to backend/.env");
  }
  if (!s3) s3 = new S3Client({ region });
  return { s3, bucket, region };
}

/** Helpers to normalize parser output */
function toTextractTables(anyTables: any[] | undefined): TextractTable[] {
  if (!Array.isArray(anyTables)) return [];
  return anyTables.map((t) => {
    if (t && Array.isArray(t.cells)) return { cells: t.cells };
    const rows: string[][] =
      Array.isArray(t?.rows) && Array.isArray(t.rows[0])
        ? (t.rows as string[][])
        : Array.isArray(t)
        ? (t as string[][])
        : [];
    const cells: { text: string; row: number; col: number }[] = [];
    rows.forEach((r, ri) => (r || []).forEach((txt, ci) => cells.push({ text: String(txt ?? ""), row: ri, col: ci })));
    return { cells };
  });
}
function toAreaObjs(areaHits: any): { label?: string; sqft?: number }[] {
  if (!Array.isArray(areaHits)) return [];
  return areaHits.map((a) => {
    if (a && typeof a === "object") return { label: a.label, sqft: a.sqft };
    if (typeof a === "string") return { label: a, sqft: undefined };
    if (typeof a === "number") return { label: `${a} sqft`, sqft: a };
    return { label: undefined, sqft: undefined };
  });
}
function toPolyObjs(polyHits: any): { label?: string; feet?: number }[] {
  if (!Array.isArray(polyHits)) return [];
  return polyHits.map((p) => {
    if (p && typeof p === "object") return { label: p.label, feet: p.feet };
    if (typeof p === "string") return { label: p, feet: undefined };
    if (typeof p === "number") return { label: `${p} ft`, feet: p };
    return { label: undefined, feet: undefined };
  });
}

parseRouter.post("/parse/start", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const { s3Key, localPath, useAI } = req.body as { s3Key: string; localPath?: string; useAI?: boolean };
    if (!s3Key) return res.status(400).json({ ok: false, error: "Missing s3Key" });

    const bucket = process.env.AWS_S3_BUCKET_NAME!;
    const jobId = await startAnalysis(bucket, s3Key);
    return res.json({ ok: true, jobId, useAI: !!useAI, localPath: localPath || null });
  } catch (e: any) {
    console.error("[parse/start]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

parseRouter.get("/parse/status", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const jobId = String(req.query.jobId || "");
    const region = String(req.query.region || "national");
    const laborRate = Number(req.query.laborRate || 65);
    const useAI = String(req.query.useAI || "0") === "1";
    const localPath = req.query.localPath ? String(req.query.localPath) : undefined;

    if (!jobId) return res.status(400).json({ ok: false, error: "Missing jobId" });

    const { status, blocks } = await getAnalysis(jobId);
    if (status !== "SUCCEEDED") return res.json({ ok: true, done: false, status });

    const parsed = parseDrawing(blocks);

    // Build takeoff
    const tables = toTextractTables(parsed?.bomTables);
    let takeoff: ParsedTakeoffItem[] = buildTakeoffFromTables(tables);
    if (takeoff.length === 0) {
      const areas = toAreaObjs(parsed?.areaHits);
      const polylines = toPolyObjs(parsed?.polylenHits);
      takeoff = buildFallbackTakeoffFromMeasurements(areas, polylines);
    }

    // Compute weights (and multiply by qty)
    for (const it of takeoff) {
      const estShape: EstTakeoffItem = {
        item: it.item != null ? String(it.item) : undefined,
        qty: it.qty ?? 1,
        material: it.material,
        size: it.size,
        lengthFt: it.lengthFt,
        weightLb: it.weightLb,
      };
      const wPer = computeWeightFromDatasets(estShape);
      if (wPer && wPer > 0) {
        const qty = estShape.qty ?? 1;
        it.weightLb = +(wPer * qty).toFixed(3);
      }
    }

    // Optional ML labor hint
    try {
      const mod = await import("./ml-service");
      const mlService = (mod as any).mlService;
      if (mlService?.predictLaborHours) {
        let totalWeight = takeoff.reduce((s, x) => s + (x.weightLb ?? 0), 0);
        if (totalWeight <= 0) totalWeight = 1;
        const ml = await mlService.predictLaborHours(1, {
          complexity: "moderate",
          materialType: (takeoff[0]?.material || "steel").toLowerCase(),
          weight: totalWeight,
          weldingType: "fillet",
          dimensions: (parsed?.dimensions || []).map((d: any) => ({ text: String(d) })),
          location: region,
        });
        const hoursPerLb = (ml?.predictedLaborHours ?? 0) / totalWeight;
        if (hoursPerLb > 0) {
          for (const it of takeoff) {
            const w = it.weightLb ?? 0;
            (it as any).__laborHoursHint = +(w * hoursPerLb).toFixed(3);
          }
        }
      }
    } catch {
      /* optional ML; ignore if unavailable */
    }

    // Map to estimator type
    const estItems: EstTakeoffItem[] = takeoff.map((it) => ({
      item: it.item != null ? String(it.item) : undefined,
      qty: it.qty ?? 1,
      material: it.material,
      size: it.size,
      lengthFt: it.lengthFt,
      weightLb: it.weightLb,
    }));

    const estimate = await estimateCosts(
      { region, laborRatePerHour: laborRate, historicalFactor: 1.0, items: estItems },
      pricingProvider
    );

    const result = {
      titleBlock: parsed?.titleBlock,
      dimensions: parsed?.dimensions,
      diameters: parsed?.diameters,
      materialsTextHits: parsed?.materialsTextHits,
      takeoff,
      estimate,
      ai: null as any,
    };

    if (useAI && localPath) {
      try {
        result.ai = await analyzeBlueprintWithAI(localPath);
      } catch (e: any) {
        console.warn("[parse/status] Claude analysis failed:", e.message);
      }
    }

    // Best-effort save analysis
    try {
      const { s3, bucket } = ensureS3();
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `analysis/${jobId}.analysis.json`,
          Body: Buffer.from(JSON.stringify(result, null, 2)),
          ContentType: "application/json",
        })
      );
    } catch (e: any) {
      console.warn("[parse/status] Failed saving analysis JSON:", e.message);
    }

    return res.json({ ok: true, done: true, status, result });
  } catch (e: any) {
    console.error("[parse/status]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});
