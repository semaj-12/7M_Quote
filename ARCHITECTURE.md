# System Architecture

Tape Measure AI uses an **AI Framework** designed to automate blueprint/document parsing, normalization, and cost estimation with high accuracy.  
The system integrates multiple parsing models (Textract, Donut, LayoutLMv3), an OpenAI adjudicator layer, and **Reducto** for deterministic JSON reduction and schema-safe normalization.

The architecture supports the core workflow:

**Upload → Parse → Normalize → Estimate → Review → Export**

---

# High-Level Architecture

┌───────────────────┐ ┌─────────────────────────┐
│ Frontend (UI) │ ----> │ Backend API Gateway │
└───────────────────┘ └──────────┬──────────────┘
│
┌────────────────┴────────────────┐
│ AI Orchestration │
└──────────────┬──────────────────┘
│
┌──────────────────────────────┼──────────────────────────────┐
│ │ │
┌──────▼─────────┐ ┌─────────▼───────────┐ ┌─────────▼──────────┐
│ Parsing Engine │ │ Estimation Engine │ │ Evaluation Engine │
│ (Hybrid + AI) │ │ (Material + Labor) │ │ (Coverage/Accuracy) │
└──────▲─────────┘ └─────────▲───────────┘ └─────────▲──────────┘
│ │ │
└──────────────────────────────┴──────────────────────────────┘


---

# Components Overview

## 1. Frontend (React)
- File upload (PDFs, images, blueprints, scope docs)
- Review/validation UI for the agent output
- Estimate preview & export interface  
- Integration authentication UI (QB/Xero)

---

## 2. Backend API Gateway
- Node / Express (or equivalent)
- Routes for:
  - Upload
  - Parse
  - Estimate
  - Export
  - Agent operations
- Normalized JSON responses for all major actions
- Auth middleware (future JWT support)

---

# 3. AI Orchestrator

The core of Tape Measure AI.

Responsibilities:
- Select the correct parser tool
- Call parsing → normalization → reducto reduction → estimation
- Retry rules and failure handling
- Use OpenAI models for:
  - adjudication
  - schema validation reasoning
  - error correction
- Trigger export tasks
- Logging every step into `audit_logs`

**Tools:**
- `parser_tool`
- `reducto_tool`
- `normalization_tool`
- `estimator_tool`
- `export_tool`
- `evaluation_tool`


---

# 4. Parsing Engine (Hybrid)

Tape Measure AI uses **four parsing layers** depending on the document:

### 🔹 **1. AWS Textract**
- Baseline OCR, tables, forms
- Good for invoices, bills, quotes, structured docs

### 🔹 **2. Donut**
- OCR-free vision transformer
- Strong for mixed-quality PDFs/images

### 🔹 **3. LayoutLMv3**
- Layout-aware token classification
- Ideal for technical drawings, dimension extraction, BOM sections

### 🔹 **4. Reducto (NEW — current parser upgrade)**
Reducto is used **post-extraction** to:

- Reduce scattered model outputs into **deterministic JSON**
- Apply JSON schema (`blueprint_v1.json`, etc.)
- Enforce field consistency
- Remove noise, hallucinations, or parser errors
- Provide confidence scoring

Reducto = the “truth filter” before data enters estimation.

---

# 5. Normalization Layer (OpenAI + Schema Validators)

After parsers + Reducto produce structured outputs:

- OpenAI (4.1/mini/small) adjudicates inconsistencies  
- AJV / JSON Schema validator enforces strict formats  
- Custom normalizers map:
  - Textract tables → structured materials  
  - LayoutLM tokens → blueprint entities  
  - Donut predictions → normalized doc model  

Output is a standard `NormalizedDoc` stored in the database.

---

# 6. Estimation Engine (Core Value)

The estimator produces **accurate, repeatable cost predictions**:

### Material Estimation
- Weight calculations (plate, pipe, tube, sheet metal)
- Material type normalization (Steel/Stainless/Aluminum)
- Cost-per-pound prediction
- Vendor/location adjustments
- Customer-specific deltas (learned from historical jobs)

### Labor Estimation
- Labor-hour prediction per task
- Tasks: welding, cutting, forming, assembly, painting, install
- Crew size modeling
- Shop vs field adjustments

### Models Used
- Global baseline regressors
- Customer-trained deltas
- Rule-based logic for special cases (pipe, plate, structural steel)

---

# 7. Evaluation Engine

Tracks end-to-end system accuracy:

- Field coverage (% of extracted entities)
- Parser confidence + Reducto confidence
- Estimate variance vs human baseline
- Per-document scoring
- Error classification (parser vs estimator vs agent)

A future CI step will reject deployments if accuracy drops.

---

# 8. Database Layer (PostgreSQL)

Tables include:

- `jobs`
- `raw_extracts`
- `normalized_docs`
- `estimates`
- `audit_logs`
- `integrations`
- `users`

Data flow:
raw_extracts → reducto_output → normalized_docs → estimates


---

# Pipeline Flow (Full)

1. **User uploads a PDF**
2. AI classifies doc type
3. AI selects parser (Textract/Donut/LayoutLMv3)
4. Parser output saved to `raw_extracts`
5. **Reducto** reduces raw JSON → structured intermediate form
6. OpenAI adjudicator fixes/validates fields
7. Normalizer enforces `NormalizedDoc` schema
8. Estimation engine calculates:
   - materials
   - labor
   - totals
9. User reviews output in UI
10. Export step (QB/Xero/PDF)
11. Evaluation logged

---

# Future Architecture Roadmap

- Multi-agent system (Parser Agent + Estimation Agent + Export Agent)
- Fine-tuned blueprint-specific model (custom LayoutLMv3 or Pix2Struct variant)
- Vendor price APIs (Ryerson/Grainger)
- RAG over past jobs for estimate refinement
- Streamed real-time agent feedback in UI

---

# Summary

Tape Measure AI integrates **multi-model parsing**, **Reducto reduction**, **OpenAI normalization**, and a custom **estimation engine** powered by an agent orchestration layer.  
This hybrid approach creates the foundation for accurate, scalable, automated cost estimation for contractor workflows.


