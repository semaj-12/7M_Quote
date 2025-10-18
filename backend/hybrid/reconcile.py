# /home/sagemaker-user/7m/hybrid/reconcile.py
from typing import Dict, Any
from .schemas import Counts

# Simple caps to avoid wild explosions
CAPS = dict(
    weld_symbols_count=300,
    dim_values_count=500,
    bom_tag_count=200,
    bom_material_count=500,
    bom_qty_count=5000,
)

FIELDS = list(CAPS.keys())

def _clip_nonneg_int(v, cap):
    try:
        v = int(v)
        if v < 0: v = 0
        if v > cap: v = cap
        return v
    except Exception:
        return 0

def reconcile_counts(*candidates: Dict[str, Any]) -> Dict[str, Any]:
    """Pick best values across candidates with simple confidence heuristics."""
    out: Dict[str, Any] = {}
    # Start with all zeros
    for k in ["weld_symbols_present", *FIELDS]:
        out[k] = 0 if k != "weld_symbols_present" else False

    # Heuristic: prefer the first candidate that provides a parseable value,
    # otherwise keep previous. Pass candidates in your preferred priority
    # (e.g., Donut -> LayoutLMv3 -> Textract).
    for cand in candidates:
        if not cand: 
            continue
        # If the candidate is already a dict of counts use it, otherwise try 'json'
        src = cand if all(isinstance(cand.get(k), (int, bool)) for k in out.keys()) else cand.get("json") or {}
        if not isinstance(src, dict): 
            continue
        # Weld present is true if any candidate says true OR any weld count > 0
        if bool(src.get("weld_symbols_present", False)):
            out["weld_symbols_present"] = True
        # Merge counts with clipping
        for k in FIELDS:
            if k in src:
                val = _clip_nonneg_int(src[k], CAPS[k])
                # take non-zero over zero; otherwise keep existing
                if val > 0 and val >= out[k]:
                    out[k] = val

    # Final consistency: if any weld count > 0, set present=True
    if out["weld_symbols_count"] > 0:
        out["weld_symbols_present"] = True

    # Validate through pydantic (raises if inconsistent types)
    return Counts(**out).model_dump()
