# CandidateEntity Specification

This file describes the **shared output format** emitted by each adapter (Donut adapter, LayoutLMv3 adapter, Textract adapter, and Reducto adapter). It ensures all providers speak the same “language” so the fusion/arbitration layer can operate consistently.

## Schema (JSON-like)
```json
{
  "id": "string",
  "entity_type": "TABLE|DIMENSION|WELD|NOTE|SECTION",
  "page": 0,
  "bbox": [x0, y0, x1, y1],
  "text_raw": "string|null",
  "fields": {},
  "confidence": 0.0,
  "provider": "reducto|textract|donut|layoutlmv3",
  "low_confidence": false,
  "confidence_calibrated": 0.0,
  "_provider_meta": {
    "latency_ms": 0,
    "adapter_version": "1.0.0",
    "schema_version": "…",
    "prompt_version": "…"
  },
  "_accepted": false,
  "_reason": "owner_default|highest_weighted|field_backfill|agreement_boost",
  "_disagreement": "value|structure|unit|null",
  "_escalated": false,
  "_fallbacks": ["provider1","provider2"],
  "_agreement_partners": ["providerX","providerY"],
  "_adjudicator_used": false
}

{
  "type":"BOM|PARTS_LIST|OTHER",
  "columns":[{"index":0,"header_raw":"QTY","header_norm":"QTY"}],
  "cells":[{"row":1,"col":0,"text_raw":"12","text_norm":"12"}]
}

{
  "raw":"3'-4 1/2\"",
  "value":40.5,
  "unit":"in",
  "normalized_to_in":40.5,
  "feature_type":"overall|hole|edge|layout"
}

{
  "side":"arrow|other|both",
  "process":"SMAW|FCAW|GMAW|…",
  "symbol":"fillet|groove|plug|…",
  "size":0.25,
  "size_unit":"in|mm",
  "length":6,
  "pitch":8,
  "contour":"flush|convex|concave",
  "finish":"grind|…",
  "tail":"optional note"
}

{ "index":1, "text_norm":"REMOVE BURRS; TYP UNLESS NOTED." }

{ "label":"SECTION A–A","scale_raw":"1:10","scale_norm":"1:10","target_page":null }
