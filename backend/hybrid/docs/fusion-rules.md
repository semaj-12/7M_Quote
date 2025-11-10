
---

### `docs/fusion-rules.md`
```markdown
# Fusion & Arbitration Rules

Defines how the system merges/chooses between signals from Reducto, Textract, Donut, and LayoutLMv3 to form the final output.

## Ownership Defaults by Entity Type

| Entity Type | Primary Provider | Notes |
| --- | --- | --- |
| TABLE | Reducto | Best at complex table layouts; allow back-fill from others for missing cells. |
| DIMENSION | Reducto | Strong near dimension lines; Donut good for text-only dims. |
| WELD | LayoutLMv3 | Fine-tuned for weld symbols; Reducto as secondary. |
| NOTE | Textract | Good for handwriting; Reducto/Donut for typed notes. |
| SECTION | Reducto | Good at structural page understanding. |

## Weighted Confidence Fusion

1. After (optional) calibration, each candidate has `confidence_calibrated`.
2. Each provider has a **weight** per entity type (see `fusion_rules.provider_weights` in `ensemble.json`).
3. Score per candidate:  
   `score = provider_weight(entity_type, provider) * confidence_calibrated`
4. Pick the candidate with the **highest score**.
5. **Agreement boost**: If two or more providers agree (e.g., same dimension value within ε or matching table headers), add `agreement_boost` (see config) to their calibrated confidence before scoring.

## Back-fill Rules

- **TABLE**: After selecting the top table, optionally back-fill missing cells from other providers when cell bboxes overlap and donor confidence ≥ winner confidence.
- **WELD**: Field-wise merge if the winner lacks fields (`size`, `pitch`, `process`, etc.) and another candidate provides them with equal/higher confidence.
- **DIMENSION**: If candidates differ by ≤ ε (`epsilon_in` / `epsilon_mm` in config), keep the higher-confidence candidate and mark `_agreement_partners`.

## Sanity Checks & Hotspot Escalation

- **Tables**: sum(rows) ≈ total (± tolerance). Require minimum columns and header mapping when configured.
- **Dimensions**: unit consistency; max reasonable bounds (e.g., `max_reasonable_in`).
- **Welds**: valid symbol/side/process combos per AWS A2.4 when present.

If a check fails or confidence < `low_conf_threshold`, **escalate** (query fallback providers in `hotspot.escalation_order`) for the affected region/entity.

## Logging & Traceability

For each **accepted** candidate:
- `entity_type`, `entity_id`, `provider`, `confidence_calibrated`, `selection_reason`, `disagreement_class`,
- flags: `_escalated`, `_fallbacks`, `_agreement_partners`, `_adjudicator_used`,
- provider meta: latency, adapter/prompt/schema versions.

A **document summary** line records:
- entity counts by type,
- accepted_by_provider tallies,
- latency totals per provider,
- mode, config hash, adapter versions.

## Tuning Guide

- Increase `low_conf_threshold` to escalate more aggressively.
- Adjust provider weights per entity to shift ownership.
- Raise/lower `agreement_boost` to favor cross-provider consensus.
- Tighten loosen ε tolerances to control dimension agreement.
