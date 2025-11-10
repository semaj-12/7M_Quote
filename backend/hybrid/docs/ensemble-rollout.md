# Ensemble Rollout Plan

How to deploy the ensemble parser (Reducto + Textract + Donut + LayoutLMv3) safely and switch modes.

## Modes

| Mode | Description | Risk/Cost |
| --- | --- | --- |
| single | Only primary provider (Reducto) | Lowest cost, moderate risk |
| shadow | Primary governs output; others run in background for metrics | Medium cost, low risk |
| hotspot | Primary runs; low-confidence or failed checks trigger targeted fallbacks | Higher cost, moderate risk |
| full | All providers run; full fusion | Highest cost, lowest risk |

## Current Target for Demo

**hotspot** mode with **high aggressiveness**:
- `"mode": "hotspot"` in `hybrid/config/ensemble.json`
- `"low_conf_threshold": 0.75` (or higher if needed)
- Escalation order: `["layoutlmv3","donut","textract"]`
- Validator + adjudicator enabled

## Switching Modes

Edit `hybrid/config/ensemble.json`:

```json
{ "mode": "shadow" }  // or "single" | "hotspot" | "full"
