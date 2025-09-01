import { Router } from "express";
import { Pool } from "pg";

export default function hintsRouter(db: Pool) {
  const r = Router();

  // PUT /api/hints/:docVerId
  r.put("/:docVerId", async (req, res) => {
    const docVerId = req.params.docVerId;
    const { org_id, company_name, will_deliver, deliver_zip, lead_time, will_install } = req.body || {};

    if (!org_id || !docVerId) return res.status(400).json({ error: "org_id and doc_ver_id required" });
    if (will_deliver && (!deliver_zip || !/^\d{5}$/.test(deliver_zip))) {
      return res.status(400).json({ error: "deliver_zip must be 5 digits when will_deliver=true" });
    }

    const sql = `
      INSERT INTO document_hints (org_id, doc_ver_id, company_name, will_deliver, deliver_zip, lead_time, will_install)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (org_id, doc_ver_id)
      DO UPDATE SET
        company_name = EXCLUDED.company_name,
        will_deliver = EXCLUDED.will_deliver,
        deliver_zip  = EXCLUDED.deliver_zip,
        lead_time    = EXCLUDED.lead_time,
        will_install = EXCLUDED.will_install,
        updated_at   = now()
      RETURNING *;
    `;

    try {
      const { rows } = await db.query(sql, [
        org_id, docVerId, company_name ?? null,
        !!will_deliver, deliver_zip ?? null,
        lead_time ?? "STANDARD", !!will_install
      ]);
      res.json(rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "failed to upsert hints" });
    }
  });

  // Optional: GET /api/hints/:docVerId?org_id=...
  r.get("/:docVerId", async (req, res) => {
    const docVerId = req.params.docVerId;
    const orgId = String(req.query.org_id || "");
    if (!orgId) return res.status(400).json({ error: "org_id required" });
    try {
      const { rows } = await db.query(`SELECT * FROM document_hints WHERE org_id=$1 AND doc_ver_id=$2`, [orgId, docVerId]);
      res.json(rows[0] ?? null);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "failed to fetch hints" });
    }
  });

  return r;
}
