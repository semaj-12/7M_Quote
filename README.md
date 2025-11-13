# Tape Measure AI (formerly 7M Quote)

AI platform for trade contractors. Upload blueprints/scopes/docs → our AI parses drawings, extracts BOM & dimensions, and predicts **material + labor costs** with location-aware pricing and customer-specific adjustments. Review, tweak, and export to your systems.

> **Status:** Alpha. Active development; APIs and data models may change.

---

## SaaS flow with minor agentic flows
Static SaaS flow along with an  **AI-agent framework** that orchestrates:  
**parse → normalize → estimate → review → export**.  
This keeps our core promise—**accurate cost estimations**—while automating the busywork around it.

---

## Key Capabilities (current)
- 📄 **Blueprint & document parsing**: OCR + layout understanding → normalized fields
- 🧮 **Estimation engine**: material pricing (location-aware) + labor time predictions
- 🧠 **Customer-specific deltas**: learn adjustments over time from each shop’s history
- 🔗 **Integrations (scaffolded)**: QuickBooks / Xero;
- ✅ **Review & approval**: human-in-the-loop adjustments before export
- 📊 **Evaluation harness (WIP)**: coverage, per-field accuracy, variance vs. baseline

---

## Architecture at a Glance
- **frontend/** – React app: upload → review → approve → export
- **backend/** – Services & agents
  - `parse/` – Textract / Donut / LayoutLMv3 / Reducto / GPT-4.1 mini pipeline
  - `estimate/` – material + labor models, location pricing, customer deltas
  - `agent/` – task orchestration, retries, guardrails, evaluation hooks
- **db/** – Postgres schema & migrations (normalized doc + estimates + audit)
- **docs/** – Design docs, API, data schema, models
- **scripts/** – Utilities (pdf→images, dataset prep, eval runners)

> Deep dives live in:  
> - [System Architecture](./ARCHITECTURE.md)  
> - [Tech Stack](./TECH_STACK.md)  
> - [API Documentation](./API.md)  
> - [Database Schema](./DATA_SCHEMA.md)  
> - [Data Models](./DATA_MODELS.md)

---

## Quickstart (Local Dev)

### 1) Prereqs
- Node 18+ / PNPM or NPM
- Docker & Docker Compose
- Python 3.10+ (if running parsers locally)
- AWS creds configured **if** using Textract