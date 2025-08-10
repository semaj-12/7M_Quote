// backend/services/estimation/weightEngine.ts
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import type { TakeoffItem } from "./estimateCosts";

// Put your CSVs in backend/datasets (or change these paths)
const DS_DIR = path.resolve(process.cwd(), "backend", "datasets");
const PIPE_CSV   = process.env.WEIGHT_PIPE_CSV   || path.join(DS_DIR, "final_master_pipe.csv");
const SHAPES_CSV = process.env.WEIGHT_SHAPES_CSV || path.join(DS_DIR, "structural_steel_materials.csv");
const SHEET_CSV  = process.env.WEIGHT_SHEET_CSV  || path.join(DS_DIR, "sheet_metal_dataset_10000.csv");

type PipeRow = { ["Pipe Size (in)"]: string, ["Schedule"]: string, ["Weight Per Ft (lbs)"]: string|number, ["Material"]?: string };
type ShapeRow = { ["Material"]: string, ["Weight (lbs/ft)"]: string|number };
type SheetRow = { ["Thickness (in)"]: string|number, ["Density (lb/in^3)"]: string|number };

let pipeRows: PipeRow[] = [];
let shapeRows: ShapeRow[] = [];
let sheetRows: SheetRow[] = [];
let loaded = false;

function load() {
  if (loaded) return;
  if (fs.existsSync(PIPE_CSV)) {
    pipeRows = parse(fs.readFileSync(PIPE_CSV), { columns: true, skip_empty_lines: true }) as PipeRow[];
  }
  if (fs.existsSync(SHAPES_CSV)) {
    shapeRows = parse(fs.readFileSync(SHAPES_CSV), { columns: true, skip_empty_lines: true }) as ShapeRow[];
  }
  if (fs.existsSync(SHEET_CSV)) {
    sheetRows = parse(fs.readFileSync(SHEET_CSV), { columns: true, skip_empty_lines: true }) as SheetRow[];
  }
  loaded = true;
}

function norm(s?: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function inchesFromSizeToken(t: string): number | undefined {
  // "2\"", 2, 2.5, 1-1/2, 1 1/2"
  const clean = t.replace(/[”"\s]/g, "");
  const frac = clean.match(/^(\d+)[- ](\d+)\/(\d+)$/);
  if (frac) return parseFloat(frac[1]) + (parseFloat(frac[2]) / parseFloat(frac[3]));
  const num = parseFloat(clean.replace(/[^\d.]/g, ""));
  return isNaN(num) ? undefined : num;
}

function matchPipe(item: TakeoffItem): number | undefined {
  const s = `${item.item || ""} ${item.material || ""} ${item.size || ""}`.toLowerCase();
  if (!/pipe|sch|schedule/.test(s)) return undefined;
  const sizeTok = (s.match(/(\d+(\.\d+)?|\d+\s*\d?\/\d+)\s*("?)/) || [])[1];
  const schTok = (s.match(/sch(?:edule)?\s*([0-9x]+)/) || [])[1] || (s.includes("80") ? "80" : s.includes("40") ? "40" : undefined);
  const sizeIn = sizeTok ? inchesFromSizeToken(sizeTok) : undefined;
  if (!sizeIn || !schTok) return undefined;

  // build match keys like 2" & Sch 40
  const wantSize = `${sizeIn}"`;
  const wantSch  = schTok.startsWith("Sch") ? schTok : `Sch ${schTok}`;
  let row = pipeRows.find(r =>
    norm((r as any)["Pipe Size (in)"]) === norm(wantSize) &&
    norm((r as any)["Schedule"]) === norm(wantSch)
  );
  if (!row && schTok === "40") {
    // try common alias
    row = pipeRows.find(r => norm((r as any)["Pipe Size (in)"]) === norm(wantSize) && norm((r as any)["Schedule"]).includes("40"));
  }
  const wpf = row ? parseFloat(String((row as any)["Weight Per Ft (lbs)"])) : NaN;
  if (!row || isNaN(wpf)) return undefined;
  const len = item.lengthFt ?? 0;
  return wpf * len;
}

function matchShape(item: TakeoffItem): number | undefined {
  const s = norm(`${item.item || ""} ${item.size || ""}`);
  // matches like W12x26, C8x18, L4x4x3/8
  const m = s.match(/\b([wcmlh])\s*\d+[x×]\d+([x×]\d+\/?\d*)?/); // crude
  if (!m) {
    // attempt full name lookup "C8x18 Channel"
    const found = shapeRows.find(r => norm((r as any)["Material"]) === s);
    if (found) {
      const wpf = parseFloat(String((found as any)["Weight (lbs/ft)"]));
      const len = item.lengthFt ?? 0;
      return isNaN(wpf) ? undefined : wpf * len * (item.qty ?? 1);
    }
    return undefined;
  }
  // try to find a row whose Material contains the token
  const found = shapeRows.find(r => norm((r as any)["Material"]).includes(m[0].replace(/\s+/g, "")));
  if (!found) return undefined;
  const wpf = parseFloat(String((found as any)["Weight (lbs/ft)"]));
  const len = item.lengthFt ?? 0;
  return isNaN(wpf) ? undefined : wpf * len;
}

function matchSheet(item: TakeoffItem): number | undefined {
  const isArea = (item.size || "").toLowerCase().includes("sf");
  if (!isArea) return undefined;
  const sf = parseFloat((item.size || "").replace(/[^\d.]/g, ""));
  if (isNaN(sf) || sf <= 0) return undefined;

  const tIn = item.thicknessIn ?? 0.25; // default if unknown (adjust later)
  // steel density default if we can’t find a better one:
  const dens = 0.2836; // lb/in^3
  const areaIn2 = sf * 144;
  const volIn3 = areaIn2 * tIn;
  return volIn3 * dens;
}

export function computeWeightFromDatasets(item: TakeoffItem): number | undefined {
  load();
  // Prefer specific matchers:
  const pipe = matchPipe(item);
  if (pipe) return pipe;
  const shape = matchShape(item);
  if (shape) return shape;
  const sheet = matchSheet(item);
  if (sheet) return sheet;

  // Fallback: unknown
  return undefined;
}
