import os, json, time
from typing import Dict, Any, List

from hybrid.utils.logging_ndjson import init_doc_logs, log_entity, log_summary
from hybrid.adapters import reducto_adapter
from .donut_infer import DonutRunner
from .layoutlm_infer import predict_counts_with_layoutlm
from .textract_infer import predict_counts_with_textract
from .reconcile import reconcile_counts
from .schemas import Counts

USE_OPENAI = bool(int(os.environ.get("USE_OPENAI_VALIDATOR", "0")))
ENSEMBLE_CONFIG_PATH = os.environ.get("ENSEMBLE_CONFIG_PATH", "hybrid/config/ensemble.json")

def _load_cfg(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        # Safe defaults if config missing
        return {
            "mode": "hotspot",
            "primary": "reducto",
            "fusion_rules": {
                "provider_weights": {
                    "TABLE":    {"reducto": 0.6, "layoutlmv3": 0.25, "donut": 0.1, "textract": 0.05},
                    "DIMENSION":{"reducto": 0.55, "donut": 0.3, "layoutlmv3": 0.1, "textract": 0.05},
                    "WELD":     {"layoutlmv3": 0.6, "reducto": 0.3, "donut": 0.07, "textract": 0.03},
                    "NOTE":     {"textract": 0.45, "reducto": 0.3, "donut": 0.2, "layoutlmv3": 0.05},
                    "SECTION":  {"reducto": 0.65, "layoutlmv3": 0.25, "donut": 0.07, "textract": 0.03}
                }
            },
            "hotspot": {
                "low_conf_threshold": 0.75
            },
            "telemetry": {
                "enabled": True,
                "log_path": "logs/parsing",
                "log_format": "ndjson",
                "sample_rate": 1.0
            }
        }

def _counts_from_reducto_candidates(cands: List[Dict[str, Any]]) -> Dict[str, int]:
    """
    Translate Reducto candidate entities into the same count fields your pipeline uses.
    We only count what your schema supports (welds, dimensions, simple BOM heuristics if present in notes later).
    """
    welds = sum(1 for c in cands if c.get("entity_type") == "WELD")
    dims  = sum(1 for c in cands if c.get("entity_type") == "DIMENSION")

    # Reducto trial schema didn’t emit TABLEs; leave BOM counts at 0 here.
    # If you later add a table schema to Reducto, you can compute bom_* here.
    return {
        "weld_symbols_present": bool(welds > 0),
        "weld_symbols_count": welds,
        "dim_values_count": dims,
        "bom_tag_count": 0,
        "bom_material_count": 0,
        "bom_qty_count": 0
    }

def _merge_counts(base_counts: Dict[str, Any], override_counts: Dict[str, Any]) -> Dict[str, Any]:
    """
    Conservative merge: OR booleans; take the MAX of numeric counts.
    This lets Reducto 'upgrade' what Donut/LayoutLM/Textract found, without losing signal.
    """
    out = dict(base_counts)
    out["weld_symbols_present"] = bool(base_counts.get("weld_symbols_present", False) or override_counts.get("weld_symbols_present", False))

    for k in ["weld_symbols_count", "dim_values_count", "bom_tag_count", "bom_material_count", "bom_qty_count"]:
        out[k] = max(int(base_counts.get(k, 0)), int(override_counts.get(k, 0)))
    return out

def run_hybrid_on_image(
    image_path: str,
    donut_model_dir: str = None,
    page_context: str = ""
) -> Dict[str, Any]:
    """
    Your existing entrypoint, now with:
    - Reducto (primary) consulted first for complex drawings
    - Aggressive 'hotspot' behavior (we’ll still run Donut/LayoutLM/Textract to maximize accuracy for demo)
    - NDJSON logging (per-entity + per-doc summary)
    - Final OpenAI validation (unchanged env toggle)
    """
    t0 = time.time()
    cfg = _load_cfg(ENSEMBLE_CONFIG_PATH)
    telemetry = cfg.get("telemetry", {})
    provider_weights = cfg.get("fusion_rules", {}).get("provider_weights", {})

    # 0) Init logging
    log_meta = init_doc_logs(telemetry.get("log_path", "logs/parsing"), os.path.basename(image_path))
    base_fields = {
        "doc_id": log_meta["doc_id"],
        "source_name": os.path.basename(image_path),
        "mode": cfg.get("mode", "hotspot"),
        "primary": cfg.get("primary", "reducto")
    }

    # 1) Run Reducto first (primary for complex drawings)
    reducto_latency = None
    reducto_candidates: List[Dict[str, Any]] = []
    try:
        r_start = time.time()
        # reducto_adapter expects the raw path (file) and the ensemble cfg for prompt/schema paths
        reducto_candidates = reducto_adapter.predict(image_path, cfg)
        reducto_latency = int((time.time() - r_start) * 1000)
    except Exception:
        reducto_candidates = []
        reducto_latency = None

    # Log each Reducto candidate as "accepted" for visibility in the demo logs (counts-only pipeline)
    for c in reducto_candidates:
        c["_accepted"] = True
        c["_reason"] = "counts_only"
        log_entity(
            log_meta["entities_path"],
            base_fields,
            c,
            provider_weights.get(c.get("entity_type", ""), {})
        )

    # 2) Existing models (Donut FT, LayoutLMv3 FT, Textract)
    donut = DonutRunner(model_dir=donut_model_dir) if donut_model_dir else DonutRunner()
    d_out = donut.predict_counts(image_path)             # {"raw": str, "json": dict|None}

    l_out = predict_counts_with_layoutlm(image_path)     # {} for now (optional)
    t_out = predict_counts_with_textract(image_path)     # {} for now (optional)

    # 3) Reconcile with your existing logic
    reconciled = reconcile_counts(d_out, l_out, t_out)

    # 4) Merge in Reducto-derived counts (conservative)
    r_counts = _counts_from_reducto_candidates(reducto_candidates)
    merged = _merge_counts(reconciled, r_counts)

    # 5) Optional OpenAI validation (unchanged)
    if USE_OPENAI:
        from .openai_validator import validate_with_openai
        try:
            validated = validate_with_openai(page_context or os.path.basename(image_path), merged)
            final = Counts(**validated).model_dump()
        except Exception:
            final = Counts(**merged).model_dump()
    else:
        final = Counts(**merged).model_dump()

    # 6) Summary log
    total_latency = int((time.time() - t0) * 1000)
    latency_ms = {
        "total": total_latency,
        "reducto": reducto_latency
        # If you start timing Donut/LayoutLM/Textract, add them here too.
    }
    counts = {
        "WELD": final.get("weld_symbols_count", 0),
        "DIMENSION": final.get("dim_values_count", 0),
        # BOM counts are split across three metrics; not an entity type in this counts-only pipeline.
    }
    accepted_by_provider = {
        # In this simplified counts pipeline, we didn't 'select' providers per entity.
        # We still surface that Reducto contributed (for demo analytics).
        "reducto": r_counts.get("weld_symbols_count", 0) + r_counts.get("dim_values_count", 0)
    }
    adapters_versions = cfg.get("versions", {}).get("adapter_versions", {})
    schema_version = "Counts@v1"
    config_hash = "na"  # if you want, compute a stable hash of ensemble.json

    log_summary(
        log_meta["summary_path"],
        base_fields,
        latency_ms=latency_ms,
        counts=counts,
        accepted_by_provider=accepted_by_provider,
        conflicts_detected=0,
        adjudications=0,
        validator_corrections=0,
        schema_version=schema_version,
        config_hash=config_hash,
        adapters=adapters_versions,
        cost_estimate=None
    )

    return final
