# backend/hybrid/ensemble.py
import os
import json
import time
import hashlib
from typing import Any, Dict, List, Optional, Tuple

# --- Adapters ---
from hybrid.adapters.donut_adapter import predict_page as donut_predict
from hybrid.adapters.layoutlm_adapter import predict_page as layout_predict
from hybrid.textract_infer import extract_words  # provides raw words (with bbox/score) + small sample
from hybrid.adapters.reducto_adapter import predict as reducto_predict

# --- Validator (OpenAI Responses API wrapper you already use) ---
from hybrid.openai_validator_requests import validate_with_openai_requests

# --- Telemetry ---
from hybrid.utils.logging_ndjson import (
    init_doc_logs,
    log_entity,
    log_summary,
)

CFG_ENV = "ENSEMBLE_CONFIG_PATH"
DEFAULT_CFG_PATH = "hybrid/config/ensemble.json"


# ----------------------------
# Helpers
# ----------------------------
def _load_cfg(path: Optional[str] = None) -> Dict[str, Any]:
    path = path or os.environ.get(CFG_ENV, DEFAULT_CFG_PATH)
    with open(path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    return cfg


def _hash_cfg(cfg: Dict[str, Any]) -> str:
    try:
        data = json.dumps(cfg, sort_keys=True, ensure_ascii=False)
        return hashlib.sha1(data.encode("utf-8")).hexdigest()[:12]
    except Exception:
        return "unknown"


def _get_validator_model(cfg: Dict[str, Any]) -> str:
    # Prefer validator.llm in config (e.g., "openai:gpt-4.1-mini")
    v_cfg = cfg.get("validator", {}) if isinstance(cfg, dict) else {}
    llm = v_cfg.get("llm")
    if isinstance(llm, str) and llm:
        # strip "openai:" prefix if present
        if llm.startswith("openai:"):
            return llm.split(":", 1)[1]
        return llm
    # fallback
    return os.environ.get("OPENAI_VALIDATOR_MODEL", "gpt-4.1")


def _get_schema_path(cfg: Dict[str, Any]) -> Optional[str]:
    # You chose Option B: update config to match your existing file:
    #   "versions": { "schema_reducto": "hybrid/schemas/blueprint_v1.json", ... }
    v = cfg.get("versions", {}) if isinstance(cfg, dict) else {}
    path = v.get("schema_reducto")
    if path and os.path.exists(path):
        return path
    # fallback: None (validator will operate without strict schema)
    return None


def _provider_versions(cfg: Dict[str, Any]) -> Dict[str, str]:
    return (cfg.get("versions", {}).get("adapter_versions") or {}) if isinstance(cfg, dict) else {}


def _telemetry_base(image_path: str, cfg_hash: str) -> Dict[str, Any]:
    return {
        "source": image_path,
        "ensemble_config_hash": cfg_hash,
    }


def _summarize_textract_words(words: List[Dict[str, Any]], sample_n: int = 12) -> Dict[str, Any]:
    """Keep Textract light for the validator (counts + small sample)."""
    return {
        "word_count": len(words or []),
        "sample": [{"text": w.get("Text"), "conf": w.get("Confidence")} for w in (words or [])[:sample_n]],
    }


# ----------------------------
# Core
# ----------------------------
def process_image(image_path: str, cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Runs all providers (Donut, LayoutLMv3, Textract, Reducto) and calls the validator with
    reducto_json as a first-class input. Returns an envelope compatible with your existing batch/API.
    """
    t0 = time.time()
    cfg = cfg or _load_cfg()
    cfg_hash = _hash_cfg(cfg)
    schema_path = _get_schema_path(cfg)
    validator_model = _get_validator_model(cfg)
    adapter_versions = _provider_versions(cfg)

    # Telemetry files
    tel = init_doc_logs(
        (cfg.get("telemetry", {}) or {}).get("log_path", "logs/parsing"),
        image_path,
    )
    base_fields = _telemetry_base(image_path, cfg_hash)

    latency_ms: Dict[str, int] = {}
    accepted_by_provider: Dict[str, int] = {"reducto": 0, "layoutlmv3": 0, "donut": 0, "textract": 0}
    counts: Dict[str, int] = {
        "TABLE": 0,
        "DIMENSION": 0,
        "WELD": 0,
        "NOTE": 0,
        "SECTION": 0,
    }

    # --- Donut ---
    d0 = time.time()
    try:
        donut_raw = donut_predict(image_path)  # string (can include <s_answer>…)
    except Exception:
        donut_raw = ""
    latency_ms["donut"] = int((time.time() - d0) * 1000)

    # --- LayoutLMv3 ---
    l0 = time.time()
    try:
        layout_pred = layout_predict(image_path)  # small dict with counts/flags (your adapter returns)
    except Exception:
        layout_pred = {
            "weld_symbols_present": False,
            "weld_symbols_count": 0,
            "dim_values_count": 0,
            "bom_tag_count": 0,
            "bom_material_count": 0,
            "bom_qty_count": 0,
        }
    latency_ms["layoutlmv3"] = int((time.time() - l0) * 1000)

    # --- Textract ---
    t1 = time.time()
    try:
        words = extract_words(image_path) or []
        textract_summary = _summarize_textract_words(words)
    except Exception:
        words = []
        textract_summary = {"word_count": 0, "sample": []}
    latency_ms["textract"] = int((time.time() - t1) * 1000)

    # --- Reducto ---
    r0 = time.time()
    try:
        reducto_cands: List[Dict[str, Any]] = reducto_predict(image_path, cfg) or []
    except Exception:
        reducto_cands = []
    latency_ms["reducto"] = int((time.time() - r0) * 1000)

    # Count entities from Reducto (optional, for telemetry)
    for c in reducto_cands:
        et = c.get("entity_type")
        if et in counts:
            counts[et] += 1

    # Log each candidate
    weights = (cfg.get("fusion_rules", {}) or {}).get("provider_weights", {})
    for c in reducto_cands:
        log_entity(
            tel["entities_path"],
            base_fields,
            c,
            weights.get(c.get("entity_type") or "", {}),
        )

    # --- Validator (OpenAI) ---
    v0 = time.time()
    final = validate_with_openai_requests(
        donut_raw=donut_raw,
        layout_json=layout_pred,
        textract_json=textract_summary,
        reducto_json={"candidates": reducto_cands},  # <-- FIRST-CLASS
        model=validator_model,
        schema_path=schema_path,
        require_schema=False,  # page-level: don’t force missing fields
    )
    latency_ms["validator"] = int((time.time() - v0) * 1000)

    # Roll up “accepted_by_provider” (we’re not running fusion/adjudicator yet, so just record counts by source)
    accepted_by_provider["reducto"] = len(reducto_cands)
    accepted_by_provider["layoutlmv3"] = int(bool(layout_pred))
    accepted_by_provider["donut"] = int(bool(donut_raw))
    accepted_by_provider["textract"] = textract_summary.get("word_count", 0)

    # Summary line
    log_summary(
        tel["summary_path"],
        base_fields,
        latency_ms=latency_ms,
        counts={
            "weld_symbols": final.get("weld_symbols_count", 0),
            "dimensions": final.get("dim_values_count", 0),
            "bom_tags": final.get("bom_tag_count", 0),
            "bom_materials": final.get("bom_material_count", 0),
            "bom_qty": final.get("bom_qty_count", 0),
            "reducto_entities_total": sum(counts.values()),
        },
        accepted_by_provider=accepted_by_provider,
        conflicts_detected=0,           # adjudicator not wired in here yet
        adjudications=0,
        validator_corrections=0,       # could track if you diff before/after
        schema_version=(cfg.get("versions", {}) or {}).get("schema_reducto", "n/a"),
        config_hash=cfg_hash,
        adapters={
            "reducto": adapter_versions.get("reducto", "unknown"),
            "textract": adapter_versions.get("textract", "unknown"),
            "donut": adapter_versions.get("donut", "unknown"),
            "layoutlmv3": adapter_versions.get("layoutlmv3", "unknown"),
        },
        cost_estimate=None,
    )

    # Return envelope compatible with your batch/API smoke tests
    elapsed = int((time.time() - t0) * 1000)
    return {
        "image": image_path,
        "donut_raw_head": (donut_raw or "")[:160],
        "layout_pred": layout_pred,
        "textract": textract_summary,                 # useful for debugging
        "reducto": {"count": len(reducto_cands)},     # quick glance
        "final": final,
        "errors": [],
        "latency_ms": latency_ms,
        "elapsed_ms": elapsed,
    }


# Convenience wrapper used by your batch/api modules (if needed)
def process(image_path: str, cfg_path: Optional[str] = None) -> Dict[str, Any]:
    cfg = _load_cfg(cfg_path) if cfg_path else _load_cfg()
    return process_image(image_path, cfg)
