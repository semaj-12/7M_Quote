// backend/services/parsers/drawingParser.ts
import type { Block, Relationship } from "@aws-sdk/client-textract";

export type Table = { rows: string[][] };

export function collectLines(blocks: Block[]): string[] {
  const lines: string[] = [];
  for (const b of blocks) if (b.BlockType === "LINE" && b.Text) lines.push(b.Text);
  return lines;
}

export function collectTables(blocks: Block[]): Table[] {
  const byId = new Map(blocks.map(b => [b.Id!, b]));
  const tables: Table[] = [];

  for (const b of blocks) {
    if (b.BlockType !== "TABLE" || !b.Relationships) continue;
    const cells: any[] = [];
    for (const rel of b.Relationships as Relationship[]) {
      if (rel.Type !== "CHILD") continue;
      for (const cid of rel.Ids ?? []) {
        const cell = byId.get(cid);
        if (cell?.BlockType === "CELL") cells.push(cell);
      }
    }
    const maxRow = Math.max(0, ...cells.map(c => c.RowIndex || 0));
    const maxCol = Math.max(0, ...cells.map(c => c.ColumnIndex || 0));
    const rows: string[][] = Array.from({ length: maxRow }, () => Array(maxCol).fill(""));

    for (const c of cells) {
      const text = gatherText(c, byId).trim();
      const r = (c.RowIndex || 1) - 1;
      const col = (c.ColumnIndex || 1) - 1;
      rows[r][col] = text;
    }
    tables.push({ rows });
  }
  return tables;
}

function gatherText(block: Block, byId: Map<string, Block>): string {
  let txt = "";
  for (const rel of (block.Relationships ?? [])) {
    if (rel.Type !== "CHILD") continue;
    for (const id of (rel.Ids ?? [])) {
      const child = byId.get(id);
      if (child?.BlockType === "WORD" && child.Text) txt += (txt ? " " : "") + child.Text;
      if (child?.BlockType === "SELECTION_ELEMENT" && child.SelectionStatus === "SELECTED") {
        txt += (txt ? " " : "") + "[X]";
      }
    }
  }
  return txt;
}

// Pattern harvest
const DIM_RE = /\b(\d+\s*\d?\/\d+|\d+(\.\d+)?)[\s]*("|\bmm\b|\bin\b|\bcm\b|\bft\b|')\b/gi;
const DIA_RE = /\b(Ø|⌀|dia\.?)\s*(\d+(\.\d+)?|\d+\s*\d?\/\d+)\s*("|\bmm\b|\bin\b|')/gi;
const AREA_RE = /\b(\d{1,4}(\.\d{1,2})?)\s*(sf|sq\.?\s*ft)\b/gi;
const POLYLEN_RE = /\b(\d+)\s*['’]\s*(\d+)?(?:\s*(\d+)\/(\d+))?(?:\s*("|”))?\b|\b(\d+(\.\d+)?)\s*(lf|lin\.?\s*ft)\b/gi;

const SHEET_RE = /\bSHEET\s*[:\-]?\s*([A-Z]?\d+)\b/i;
const REV_RE = /\bREV(?:ISION)?\s*[:\-]?\s*([A-Z0-9\-\.]+)\b/i;
const SCALE_RE = /\bSCALE\s*[:\-]?\s*(\d+\/\d+\"=1'-0\"|1:\d+|\d+:\d+)\b/i;

const MATERIAL_HINTS = [
  "steel","stainless","alum","aluminum","pipe","tube","square tube","round tube",
  "plate","sheet","sch","schedule","gauge","ga","thk","thickness"
];

export type ParsedDrawing = {
  titleBlock: { sheet?: string; revision?: string; scale?: string; };
  dimensions: string[];
  diameters: string[];
  areaHits: string[];
  polylenHits: string[];
  materialsTextHits: string[];
  bomTables: Table[];
};

export function parseDrawing(blocks: Block[]): ParsedDrawing {
  const lines = collectLines(blocks);
  const tables = collectTables(blocks);
  const text = lines.join("\n");

  const dimensions = Array.from(text.matchAll(DIM_RE)).map(m => m[0]);
  const diameters  = Array.from(text.matchAll(DIA_RE)).map(m => m[0]);
  const areaHits   = Array.from(text.matchAll(AREA_RE)).map(m => m[0]);
  const polyHits   = Array.from(text.matchAll(POLYLEN_RE)).map(m => m[0]);

  const materialsTextHits = lines.filter(l => MATERIAL_HINTS.some(h => l.toLowerCase().includes(h)));

  const titleBlock = {
    sheet: (text.match(SHEET_RE)?.[1]) || undefined,
    revision: (text.match(REV_RE)?.[1]) || undefined,
    scale: (text.match(SCALE_RE)?.[1]) || undefined
  };

  return { titleBlock, dimensions, diameters, areaHits, polylenHits: polyHits, materialsTextHits, bomTables: tables };
}
