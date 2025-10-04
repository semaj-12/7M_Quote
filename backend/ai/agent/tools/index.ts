import fs from "node:fs/promises";
import path from "node:path";
import { loadParsedPayload } from "../../../ai/adjudicator/adjudicator";

export type ParsedCandidate = {
  field: string; raw: string; page: number; conf: number;
  source: "Textract" | "Donut" | "LayoutLMv3";
};

export const tools = {
  async get_parsed_chunks(docId: string) {
    // read the adjudicator file produced earlier
    const data = await loadParsedPayload(docId);
    if (data) return data;

    // Fallback: helpful error if not found
    const file = path.join("backend","uploads",docId,"parsed.json");
    throw new Error(`parsed payload not found for ${docId}. Expected at ${file}. Run the parser orchestrator first.`);
  },

  normalize_units(input: string) {
    const ftin = input.match(/^(\d+)['’]\-?(\d+)"?$/);
    if (ftin) return (+ftin[1] * 12) + (+ftin[2]);
    const inches = input.match(/^(\d+(?:\.\d+)?)\s*in(ch(es)?)?$/i);
    if (inches) return +inches[1];
    const mm = input.match(/^(\d+(?:\.\d+)?)\s*mm$/i);
    if (mm) return +mm[1] / 25.4;
    const feet = input.match(/^(\d+(?:\.\d+)?)\s*ft$/i);
    if (feet) return (+feet[1]) * 12;
    return null;
  },

  async fetch_material_map() {
    return { steel: { canonical: "Steel" }, stainless: { canonical: "Stainless" }, ss: { canonical: "Stainless" } };
  },

  async estimate_costs(bomPayload: any) {
    return { total_material: 0, total_labor: 0, items: (bomPayload.items||[]).map((it:any)=>({...it,cost:0})) };
  },

  async draft_quote(estimate: any) {
    const lines = (estimate.items||[]).map((it:any)=>({ desc:`${it.qty}x ${it.part_type}`, amount: it.cost||0 }));
    return { title: "Quote", lines, total: lines.reduce((s:number,l:any)=>s + l.amount, 0) };
  },

  async push_to_qbo(quote: any) { return { ok:true, id:"QB-PLACEHOLDER" }; },
  async ask_human_approve(payload: any) { return { task_id:"REVIEW-PLACEHOLDER" }; },
  log_event(evt: Record<string, unknown>) { console.info("[agent-log]", JSON.stringify(evt)); }
};
