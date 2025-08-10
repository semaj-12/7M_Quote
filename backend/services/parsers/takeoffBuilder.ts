// backend/services/parsers/takeoffBuilder.ts
export type SimpleCell = { text: string; row: number; col: number };
export type TextractTable = { cells: SimpleCell[] };

export type TakeoffItem = {
  item?: string | number;
  desc?: string;
  qty?: number;
  material?: string;
  size?: string;
  lengthFt?: number;
  weightLb?: number;
  __laborHoursHint?: number;
};

const HEADER_SYNONYMS: Record<string, string[]> = {
  item: ["item", "item no", "item #", "no.", "#", "mark"],
  qty: ["qty", "quantity", "q.t.y"],
  desc: ["description", "part", "name", "component"],
  material: ["material", "matl", "spec", "grade"],
  size: ["size", "section", "shape", "dim", "dimensions"],
  length: ["length", "len", "l"],
  weight: ["weight", "wt", "lbs", "lb"],
};

function norm(s: string) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[^\w.# ]+/g, "");
}
function isHeaderMatch(cell: string, kind: keyof typeof HEADER_SYNONYMS) {
  const n = norm(cell);
  return HEADER_SYNONYMS[kind].some((h) => n === h || n.startsWith(h + " "));
}

function detectHeaderRow(rows: string[][]) {
  let bestRow = -1;
  let bestScore = 0;
  let bestMap: Record<string, number> = {};
  rows.forEach((row, r) => {
    const map: Record<string, number> = {};
    let score = 0;
    row.forEach((txt, c) => {
      (Object.keys(HEADER_SYNONYMS) as (keyof typeof HEADER_SYNONYMS)[]).forEach((k) => {
        if (isHeaderMatch(txt, k) && map[k as string] === undefined) {
          map[k as string] = c;
          score++;
        }
      });
    });
    if (score >= 2 && score >= bestScore) {
      bestScore = score;
      bestRow = r;
      bestMap = map;
    }
  });
  return { headerRow: bestRow, colMap: bestMap };
}

function toRows(table: TextractTable): string[][] {
  const byRow: Record<number, Record<number, string>> = {};
  for (const c of table.cells) {
    byRow[c.row] = byRow[c.row] || {};
    byRow[c.row][c.col] = c.text ?? "";
  }
  const rows = Object.keys(byRow)
    .map((r) => parseInt(r, 10))
    .sort((a, b) => a - b)
    .map((r) => {
      const cols = byRow[r];
      const maxCol = Math.max(...Object.keys(cols).map((k) => parseInt(k, 10)));
      const row: string[] = [];
      for (let i = 0; i <= maxCol; i++) row.push((cols[i] ?? "").trim());
      return row;
    });
  return rows;
}

function parseNumber(s?: string): number | undefined {
  if (!s) return undefined;
  const m = (s.replace(/[, ]/g, "").match(/-?\d+(\.\d+)?/) || [])[0];
  const n = m ? Number(m) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function buildTakeoffFromTables(tables: TextractTable[] = []): TakeoffItem[] {
  const out: TakeoffItem[] = [];
  for (const t of tables) {
    const rows = toRows(t);
    if (rows.length < 2) continue;

    const { headerRow, colMap } = detectHeaderRow(rows);
    if (headerRow < 0) continue;

    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      const empty = row.every((x) => !x || !x.trim());
      if (empty) continue;

      const itemTxt = colMap.item !== undefined ? row[colMap.item] : row[0];
      const qtyTxt = colMap.qty !== undefined ? row[colMap.qty] : "";
      const descTxt = colMap.desc !== undefined ? row[colMap.desc] : "";
      const matTxt  = colMap.material !== undefined ? row[colMap.material] : "";
      const sizeTxt = colMap.size !== undefined ? row[colMap.size] : "";
      const lenTxt  = colMap.length !== undefined ? row[colMap.length] : "";
      const wtTxt   = colMap.weight !== undefined ? row[colMap.weight] : "";

      // Skip pure header repeats
      const isRepeatHeader =
        [itemTxt, qtyTxt, descTxt, matTxt, sizeTxt].filter(Boolean).some((v) =>
          (Object.values(HEADER_SYNONYMS).flat()).includes(norm(v))
        );
      if (isRepeatHeader) continue;

      const item: TakeoffItem = {
        item: itemTxt || undefined,
        desc: descTxt || undefined,
        qty: parseNumber(qtyTxt) ?? 1,
        material: matTxt || undefined,
        size: sizeTxt || undefined,
        lengthFt: parseNumber(lenTxt),
        weightLb: parseNumber(wtTxt),
      };

      // Heuristics: if desc contains size/material, backfill
      if (!item.material && item.desc) {
        if (/stainless|ss\d|304|316/i.test(item.desc)) item.material = "stainless";
        else if (/alum/i.test(item.desc)) item.material = "aluminum";
        else if (/steel|a36|a572|a992/i.test(item.desc)) item.material = "steel";
      }
      if (!item.size && item.desc) {
        const sizeMatch = item.desc.match(/(\d+["”]?\s*x\s*\d+["”]?|\b[WC]?\d{1,2}x\d{1,2}\b|\bSCH\s*\d+\b)/i);
        if (sizeMatch) item.size = sizeMatch[0];
      }

      out.push(item);
    }
  }
  return out;
}

// Fallback from dimensions/areas if no BOM found
export function buildFallbackTakeoffFromMeasurements(
  areas: { label?: string; sqft?: number }[] = [],
  polylens: { label?: string; feet?: number }[] = []
): TakeoffItem[] {
  const items: TakeoffItem[] = [];
  for (const a of areas) {
    items.push({
      item: a.label ?? "Plate",
      desc: a.label ?? "Plate",
      qty: 1,
      material: "steel",
      size: `${(a.sqft ?? 0).toFixed(1)} sf`,
    });
  }
  for (const p of polylens) {
    items.push({
      item: p.label ?? "Linear",
      desc: p.label ?? "Linear member",
      qty: 1,
      material: "steel",
      lengthFt: p.feet,
    });
  }
  return items;
}
