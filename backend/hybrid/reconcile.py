from typing import Any, Dict, List, Tuple
import copy

# --- Hotspots detection -------------------------------------------------------

def find_hotspots(candidates: List[Dict[str, Any]], cfg: Dict[str, Any]) -> Dict[str, Any]:
    th = cfg.get("hotspot", {}).get("low_conf_threshold", 0.75)
    need_textract = False
    need_donut = False
    need_layoutlm = False
    regions_for_textract: List[Dict[str, Any]] = []
    regions_for_donut: List[Dict[str, Any]] = []
    regions_for_layoutlm: List[Dict[str, Any]] = []

    # simple heuristic: any candidate below threshold triggers a backup by entity type
    for c in candidates:
        if c.get("confidence", 0.0) < th:
            et = c.get("entity_type")
            bbox = c.get("bbox") or [0,0,0,0]
            region = {"page": c.get("page", 0), "bbox": bbox}
            if et == "TABLE":
                need_layoutlm = True; regions_for_layoutlm.append(region)
                need_donut = True;    regions_for_donut.append(region)
            elif et == "DIMENSION":
                need_donut = True;    regions_for_donut.append(region)
            elif et == "WELD":
                need_layoutlm = True; regions_for_layoutlm.append(region)
            elif et == "NOTE":
                need_textract = True; regions_for_textract.append(region)

    return {
        "need_textract": need_textract,
        "need_donut": need_donut,
        "need_layoutlm": need_layoutlm,
        "regions_for_textract": regions_for_textract[: cfg.get("hotspot", {}).get("max_regions_per_page", 999)],
        "regions_for_donut": regions_for_donut[: cfg.get("hotspot", {}).get("max_regions_per_page", 999)],
        "regions_for_layoutlm": regions_for_layoutlm[: cfg.get("hotspot", {}).get("max_regions_per_page", 999)]
    }

# --- Fusion / Arbitration -----------------------------------------------------

def _weight_for(provider: str, entity_type: str, cfg: Dict[str, Any]) -> float:
    return cfg.get("fusion_rules", {}).get("provider_weights", {}).get(entity_type, {}).get(provider, 0.0)

def _boost_if_agreement(cands: List[Dict[str, Any]], entity_type: str, cfg: Dict[str, Any]) -> None:
    """Very light agreement boost on identical values (dimensions) or matching headers (tables).
    We annotate confidence_calibrated."""
    boost = cfg.get("fusion_rules", {}).get("agreement_boost", 0.0)
    if not cands or boost <= 0:
        return
    if entity_type == "DIMENSION":
        values = {}
        for c in cands:
            v = (c.get("fields") or {}).get("value")
            if v is None: continue
            values.setdefault(v, []).append(c)
        for v, group in values.items():
            if len(group) >= 2:
                for g in group:
                    g["confidence_calibrated"] = min(1.0, (g.get("confidence_calibrated", g.get("confidence", 0.0)) + boost))
                    g.setdefault("_agreement_partners", [])
                    g["_agreement_partners"] = list(set([x.get("provider") for x in group if x is not g]))
    elif entity_type == "TABLE":
        # placeholder: if multiple providers present, give a tiny boost to non-primary to allow backfill later
        for c in cands:
            c["confidence_calibrated"] = min(1.0, (c.get("confidence_calibrated", c.get("confidence", 0.0)) + boost/2.0))

def calibrate_confidences(cands: List[Dict[str, Any]], calib_cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Identity calibration by default."""
    for c in cands:
        c["confidence_calibrated"] = c.get("confidence", 0.0)
    return cands

def fuse_entities(candidates: List[Dict[str, Any]], cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Per-entity-type winner-take-most with optional field backfill."""
    by_type: Dict[str, List[Dict[str, Any]]] = {}
    for c in candidates:
        by_type.setdefault(c.get("entity_type", "OTHER"), []).append(c)

    fused: List[Dict[str, Any]] = []

    for etype, cands in by_type.items():
        # boost agreements before selecting
        _boost_if_agreement(cands, etype, cfg)

        # pick best by weighted calibrated confidence
        best = None
        best_score = -1.0
        for c in cands:
            w = _weight_for(c.get("provider"), etype, cfg)
            score = w * c.get("confidence_calibrated", c.get("confidence", 0.0))
            if score > best_score:
                best = c; best_score = score
        if best is None:
            continue

        # clone for fused
        fused_ent = copy.deepcopy(best)
        fused_ent["_accepted"] = True
        fused_ent["_reason"] = "owner_default"  # default reason; may change below

        # Backfill rules (lightweight):
        if etype == "TABLE":
            # prefer grid from primary (configurable)
            prefer_grid = cfg.get("fusion_rules", {}).get("prefer_grid_from", "reducto")
            if fused_ent.get("provider") != prefer_grid:
                # keep winner, but do not alter underlying grid
                fused_ent["_reason"] = "highest_weighted"
            # NOTE: full backfill of missing cells requires cell-level alignment; keep simple for now
        elif etype == "WELD":
            # merge missing fields from other candidates if they have higher confidence
            fields = fused_ent.get("fields") or {}
            field_names = ["side","process","symbol","size","size_unit","length","pitch","contour","finish","tail"]
            for c in cands:
                if c is fused_ent: continue
                f2 = c.get("fields") or {}
                for k in field_names:
                    if (fields.get(k) in [None, "", 0]) and (f2.get(k) not in [None, ""]):
                        if c.get("confidence_calibrated", 0) >= fused_ent.get("confidence_calibrated", 0):
                            fields[k] = f2.get(k)
                            fused_ent["_reason"] = "field_backfill"
            fused_ent["fields"] = fields
        elif etype == "DIMENSION":
            # if two values within epsilon, keep best; otherwise accept best as-is
            fused_ent["_reason"] = fused_ent.get("_reason") or "highest_weighted"

        fused.append(fused_ent)

    return fused

# --- Sanity checks / conflicts ------------------------------------------------

def sanity_checks_and_fixups(fused: List[Dict[str, Any]], sanity_cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    # For now, just return; your OpenAI validator will enforce deeper checks.
    return fused

def detect_conflicts(fused: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # Simple placeholder: no conflict detection implemented here
    return []
