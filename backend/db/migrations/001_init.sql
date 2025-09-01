-- Enable UUID generation (for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tenancy & Users
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orgs (
  org_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  user_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  email       TEXT UNIQUE NOT NULL,
  role        TEXT CHECK (role IN ('owner','admin','member')) DEFAULT 'member',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Documents & Versions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  doc_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  sha256       TEXT NOT NULL,
  uploaded_by  UUID NOT NULL REFERENCES users(user_id) ON DELETE SET NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT CHECK (status IN ('RECEIVED','PARSING','PARSED','FAILED')) DEFAULT 'RECEIVED'
);

CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(org_id);

CREATE TABLE IF NOT EXISTS document_versions (
  doc_ver_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id            UUID NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
  version           INT NOT NULL,
  pipeline_version  TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doc_id, version)
);

CREATE INDEX IF NOT EXISTS idx_doc_versions_doc ON document_versions(doc_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Raw OCR / Textract Blocks (provenance)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ocr_blocks (
  block_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_ver_id UUID NOT NULL REFERENCES document_versions(doc_ver_id) ON DELETE CASCADE,
  page_num   INT NOT NULL,
  kind       TEXT CHECK (kind IN ('TOKEN','LINE','TABLE','CELL','KEY','VALUE')),
  text       TEXT,
  bbox       JSONB,     -- {x,y,w,h} normalized 0..1
  conf       NUMERIC,   -- 0..1
  raw        JSONB
);

CREATE INDEX IF NOT EXISTS idx_ocr_blocks_docver ON ocr_blocks(doc_ver_id, page_num);

-- ─────────────────────────────────────────────────────────────────────────────
-- Extracted Entities (model-agnostic)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS extracted_entities (
  entity_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_ver_id  UUID NOT NULL REFERENCES document_versions(doc_ver_id) ON DELETE CASCADE,
  page_num    INT NOT NULL,
  type        TEXT CHECK (type IN (
                'material','form','grade','finish','dimension','tolerance',
                'process','note','table_row','table_cell','qty','part_tag')),
  raw_text    TEXT,
  bbox        JSONB,
  conf        NUMERIC,    -- 0..1
  source      TEXT,       -- 'textract','layoutlmv3','donut','heuristic'
  meta        JSONB
);

CREATE INDEX IF NOT EXISTS idx_entities_docver ON extracted_entities(doc_ver_id, page_num);
CREATE INDEX IF NOT EXISTS idx_entities_type ON extracted_entities(type);

-- ─────────────────────────────────────────────────────────────────────────────
-- Catalog / Normalization (controlled vocab)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materials (
  material_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family          TEXT CHECK (family IN ('steel','stainless','aluminum','other')) NOT NULL,
  grade           TEXT,
  finish          TEXT,
  density_lb_in3  NUMERIC,
  valid_from      DATE DEFAULT CURRENT_DATE,
  valid_to        DATE
);

CREATE TABLE IF NOT EXISTS product_forms (
  form_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,  -- sheet, plate, bar, pipe, HSS, channel, angle, tube, etc.
  uom_buy     TEXT NOT NULL   -- 'sheet','ft','ea','lb'
);

CREATE TABLE IF NOT EXISTS form_specs (
  form_spec_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id        UUID NOT NULL REFERENCES product_forms(form_id) ON DELETE CASCADE,
  dims_schema    JSONB NOT NULL,   -- e.g., {"thickness":"in","width":"in","length":"in"}
  weight_per_uom NUMERIC,
  constraints    JSONB
);

CREATE INDEX IF NOT EXISTS idx_formspec_form ON form_specs(form_id);

CREATE TABLE IF NOT EXISTS entity_normalizations (
  entity_id     UUID NOT NULL REFERENCES extracted_entities(entity_id) ON DELETE CASCADE,
  material_id   UUID REFERENCES materials(material_id),
  form_spec_id  UUID REFERENCES form_specs(form_spec_id),
  prob          NUMERIC NOT NULL CHECK (prob >= 0 AND prob <= 1),
  resolver      TEXT NOT NULL,   -- 'rules','model','user'
  PRIMARY KEY (entity_id, material_id, form_spec_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Parts, BOM
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parts (
  part_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  doc_ver_id   UUID NOT NULL REFERENCES document_versions(doc_ver_id) ON DELETE CASCADE,
  part_tag     TEXT,
  material_id  UUID REFERENCES materials(material_id),
  form_spec_id UUID REFERENCES form_specs(form_spec_id),
  qty          NUMERIC,
  mass_lb_est  NUMERIC,
  conf         NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_parts_org_docver ON parts(org_id, doc_ver_id);

CREATE TABLE IF NOT EXISTS bom_lines (
  bom_line_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  doc_ver_id    UUID NOT NULL REFERENCES document_versions(doc_ver_id) ON DELETE CASCADE,
  part_id       UUID REFERENCES parts(part_id) ON DELETE SET NULL,
  line_type     TEXT CHECK (line_type IN ('raw','part','assembly')) NOT NULL,
  required_qty  NUMERIC NOT NULL,
  uom           TEXT NOT NULL,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_bom_org_docver ON bom_lines(org_id, doc_ver_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Customer Accounting History (per-tenant)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_lines (
  po_line_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  date             DATE NOT NULL,
  supplier_name    TEXT,
  form_spec_key    TEXT,       -- e.g. "sheet:stainless:14ga:#4"
  qty              NUMERIC,
  total_weight_lb  NUMERIC,
  unit_price_usd   NUMERIC,
  uom              TEXT,       -- 'lb','ea','ft','sheet'
  ship_to_zip      TEXT,
  lead_time_days   NUMERIC,
  meta             JSONB
);

CREATE INDEX IF NOT EXISTS idx_purchase_org_date ON purchase_lines(org_id, date);
CREATE INDEX IF NOT EXISTS idx_purchase_formkey ON purchase_lines(form_spec_key);

-- ─────────────────────────────────────────────────────────────────────────────
-- Surcharges & Macro Indices (public/free signals)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS surcharges (
  surcharge_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family        TEXT,
  grade         TEXT,
  month         DATE NOT NULL,
  value_per_lb  NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_surcharges_key ON surcharges(family, grade, month);

CREATE TABLE IF NOT EXISTS macro_indices (
  index_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,   -- e.g. 'PPI_Steel_Mill', 'PPI_Aluminum'
  date      DATE NOT NULL,
  value     NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_macro_name_date ON macro_indices(name, date);

-- ─────────────────────────────────────────────────────────────────────────────
-- Pricing Outputs (traceability)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_breakdown (
  price_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  bom_line_id     UUID NOT NULL REFERENCES bom_lines(bom_line_id) ON DELETE CASCADE,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  rules_version   TEXT NOT NULL,
  model_version   TEXT,
  baseline_usd    NUMERIC NOT NULL,
  surcharge_usd   NUMERIC DEFAULT 0,
  freight_usd     NUMERIC DEFAULT 0,
  processing_usd  NUMERIC DEFAULT 0,
  ml_delta_usd    NUMERIC DEFAULT 0,
  final_unit_usd  NUMERIC NOT NULL,
  uom             TEXT NOT NULL,
  conf            NUMERIC,
  explain         JSONB
);

CREATE INDEX IF NOT EXISTS idx_price_org_bom ON price_breakdown(org_id, bom_line_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Model Runs (audit)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_runs (
  run_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  model_kind   TEXT CHECK (model_kind IN ('extractor','normalizer','pricing_delta','labor')) NOT NULL,
  version      TEXT NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  status       TEXT CHECK (status IN ('OK','ERROR')) DEFAULT 'OK',
  metrics      JSONB
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Document Hints (Pre-parse Sidebar answers)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_hints (
  hint_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  doc_ver_id     UUID NOT NULL REFERENCES document_versions(doc_ver_id) ON DELETE CASCADE,
  company_name   TEXT,
  will_deliver   BOOLEAN NOT NULL DEFAULT FALSE,
  deliver_zip    TEXT,
  lead_time      TEXT NOT NULL DEFAULT 'STANDARD',  -- STANDARD | RUSH | FLEX
  will_install   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, doc_ver_id)
);

CREATE INDEX IF NOT EXISTS idx_hints_org_docver ON document_hints(org_id, doc_ver_id);
