import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "./bom_payload.schema.json";

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
addFormats(ajv);

export type BomPayload = {
  doc_id: string;
  units: "imperial" | "metric";
  meta: { source_pages?: number[]; confidence?: number };
  items: Array<{
    part_type: string;
    material: string;
    grade?: string | null;
    qty: number;
    dims: {
      thickness_in?: number | null;
      width_in?: number | null;
      length_in?: number | null;
      od_in?: number | null;
      id_in?: number | null;
    };
    weld?: { process?: string | null; length_in?: number | null; symbol?: string | null };
    notes?: string | null;
    confidence?: number;
  }>;
};

const validate = ajv.compile(schema);
export function validateBomPayload(data: unknown): { ok: boolean; errors?: string[] } {
  const valid = validate(data);
  if (valid) return { ok: true };
  const errors = (validate.errors || []).map(e => `${e.instancePath} ${e.message}`);
  return { ok: false, errors };
}
