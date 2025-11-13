# Database Schema

```md
# Database Schema

PostgreSQL schema for Tape Measure AI.

---

## Tables

### **users**
| column | type | notes |
|--------|-------|--------|
| id | uuid | PK |
| email | text | |
| role | text | admin, user |
| created_at | timestamp | |

---

### **jobs**
Represents a single uploaded document.

| column | type | notes |
|--------|------|--------|
| id | uuid | PK |
| user_id | uuid | FK to users |
| file_path | text | S3/local path |
| status | text | uploaded, parsed, estimated, exported |
| created_at | timestamp | |

---

### **raw_extracts**
Stores raw Textract / Donut / LayoutLM output.

| column | type |
|--------|-------|
| job_id | uuid |
| content | jsonb |
| parser | text |

---

### **normalized_docs**
Unified structured document (NormalizedDoc).

| column | type |
|--------|-------|
| job_id | uuid |
| data | jsonb |
| confidence | jsonb |
| schema_version | text |

---

### **estimates**
Material + labor estimations.

| column | type |
|--------|--------|
| job_id | uuid |
| materials | jsonb |
| labor | jsonb |
| totals | jsonb |

---

### **audit_logs**
Tracks all agent actions.

| column | type |
|--------|--------|
| id | uuid |
| job_id | uuid |
| action | text |
| payload | jsonb |
| created_at | timestamp |

---

### **integrations**
Stores QB/Xero tokens.

---

## Indexing Strategy
- `GIN` on JSONB columns
- `BTREE` on timestamps for analytics
- `UNIQUE(job_id)` on normalized_docs and estimates

---

## Future Tables
- vendor_price_cache
- customer_deltas
- model_versions