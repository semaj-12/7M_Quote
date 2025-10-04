import { describe, it, expect } from "vitest";
import { validateBomPayload } from "../ai/normalizer/validator";

describe("bom schema validation", () => {
  it("accepts a valid payload", () => {
    const ok = {
      doc_id: "doc-123",
      units: "imperial",
      meta: { source_pages: [1,2], confidence: 0.9 },
      items: [{
        part_type: "plate",
        material: "Steel",
        grade: null,
        qty: 4,
        dims: { thickness_in: 0.25, width_in: 12, length_in: 36 },
        weld: { process: null, length_in: null, symbol: null },
        notes: null,
        confidence: 0.92
      }]
    };
    expect(validateBomPayload(ok).ok).toBe(true);
  });

  it("rejects when required fields are missing", () => {
    const bad = { doc_id: "x", units: "imperial", meta: {}, items: [{}] };
    const res = validateBomPayload(bad);
    expect(res.ok).toBe(false);
    expect(res.errors?.length).toBeGreaterThan(0);
  });
});
