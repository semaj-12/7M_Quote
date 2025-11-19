import fs from "node:fs/promises";
import path from "node:path";

/** Generic candidate we’ll feed to Sonnet’s normalizer */
export type Candidate = {
  field: string;            // e.g., DIM_VALUE, UNIT, MATERIAL, NOTE
  raw: string;              // raw text as seen
  page: number;             // 1-based page index
  conf: number;             // 0..1 confidence
  source: "Textract" | "Donut" | "LayoutLMv3";
  bbox?: { x: number; y: number; w: number; h: number }; // optional
  meta?: Record<string, unknown>;
};

export type ParsedPayload = {
  doc_id: string;
  pages: number[];
  candidates: Candidate[];
  notes?: string[];
};

/** Very simple in-memory collector you can reuse per doc */
export class Adjudicator {
  private docId: string;
  private pages = new Set<number>();
  private candidates: Candidate[] = [];
  private notes: string[] = [];

  constructor(docId: string) { this.docId = docId; }

  addNote(n: string) { this.notes.push(n); }

  /** Minimal Textract adapter.
   *  - You can enrich this: detect DIM_VALUE tokens, UNIT, MATERIAL in your block text.
   */
  addTextract(blocks: any[], page: number) {
    this.pages.add(page);
    for (const b of blocks || []) {
      if (b.BlockType === "WORD" && b.Text) {
        const raw = String(b.Text);
        // DIM_VALUE:  7'-2" or 86 in or 1800 mm
        if (/^\d+['’]-?\d+"$/.test(raw) || /^\d+(\.\d+)?\s*(in|mm|cm|ft)\b/i.test(raw)) {
          this.candidates.push({ field: "DIM_VALUE", raw, page, conf: (b.Confidence ?? 80)/100, source: "Textract" });
        }
        // UNIT-only tokens
        if (/^(in|mm|cm|ft|inch|inches|feet)$/i.test(raw)) {
          this.candidates.push({ field: "UNIT", raw, page, conf: (b.Confidence ?? 80)/100, source: "Textract" });
        }
        // MATERIAL very naive
        if (/^(steel|stainless|ss)$/i.test(raw)) {
          this.candidates.push({ field: "MATERIAL", raw, page, conf: (b.Confidence ?? 80)/100, source: "Textract" });
        }
      }
    }
  }

  /** Donut adapter (you’ll map from your donut_svc JSON into DIM_VALUE/MATERIAL/etc.) */
  addDonut(items: Array<{ text: string; label?: string; page?: number; conf?: number }>, page: number) {
    this.pages.add(page);
    for (const it of items || []) {
      const raw = it.text ?? "";
      const conf = it.conf ?? 0.75;
      if (!raw) continue;

      if (it.label === "DIM_VALUE" || /^\d+['’]-?\d+"$/.test(raw) || /^\d+(\.\d+)?\s*(in|mm|cm|ft)\b/i.test(raw)) {
        this.candidates.push({ field: "DIM_VALUE", raw, page: it.page ?? page, conf, source: "Donut" });
      } else if (it.label === "WELD_SYMBOL") {
        this.candidates.push({ field: "WELD_SYMBOL", raw, page: it.page ?? page, conf, source: "Donut" });
      } else if (it.label === "MATERIAL" || /^(steel|stainless|ss)$/i.test(raw)) {
        this.candidates.push({ field: "MATERIAL", raw, page: it.page ?? page, conf, source: "Donut" });
      }
    }
  }

  /** LayoutLMv3 adapter (typical Label Studio exports → label + text) */
  addLayoutLM(entities: Array<{ label: string; text: string; page?: number; conf?: number }>, page: number) {
    this.pages.add(page);
    for (const e of entities || []) {
      const field = e.label.toUpperCase();
      const conf = e.conf ?? 0.85;
      const raw = e.text ?? "";
      if (!raw) continue;

      if (field === "DIM_VALUE" || /^\d+['’]-?\d+"$/.test(raw) || /^\d+(\.\d+)?\s*(in|mm|cm|ft)\b/i.test(raw)) {
        this.candidates.push({ field: "DIM_VALUE", raw, page: e.page ?? page, conf, source: "LayoutLMv3" });
      } else if (field === "WELD_SYMBOL") {
        this.candidates.push({ field: "WELD_SYMBOL", raw, page: e.page ?? page, conf, source: "LayoutLMv3" });
      } else if (field === "MATERIAL") {
        this.candidates.push({ field: "MATERIAL", raw, page: e.page ?? page, conf, source: "LayoutLMv3" });
      } else if (field === "UNIT") {
        this.candidates.push({ field: "UNIT", raw, page: e.page ?? page, conf, source: "LayoutLMv3" });
      }
    }
  }

  finalize(): ParsedPayload {
    return {
      doc_id: this.docId,
      pages: [...this.pages].sort((a,b)=>a-b),
      candidates: this.candidates,
      notes: this.notes
    };
  }
}

/** Persist parsedPayload so tools.get_parsed_chunks can read it later */
export async function saveParsedPayload(docId: string, payload: ParsedPayload) {
  const dir = path.join("backend", "uploads", docId);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "parsed.json");
  await fs.writeFile(file, JSON.stringify(payload, null, 2), "utf-8");
  return file;
}

export async function loadParsedPayload(docId: string): Promise<ParsedPayload | null> {
  try {
    const file = path.join("backend", "uploads", docId, "parsed.json");
    const txt = await fs.readFile(file, "utf-8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}
