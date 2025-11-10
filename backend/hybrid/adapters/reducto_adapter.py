import os
import json
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

try:
    import requests  # available on SageMaker & most envs
except Exception:  # fallback if requests missing
    requests = None

# Minimal shared candidate structure (keep in sync with docs/candidate_entity.md)
def _make_candidate(entity_type: str,
                    page: int,
                    bbox: List[float],
                    provider: str,
                    confidence: float,
                    fields: Dict[str, Any],
                    text_raw: Optional[str] = None) -> Dict[str, Any]:
    return {
        "id": f"{entity_type.lower()}_{uuid.uuid4().hex[:8]}",
        "entity_type": entity_type,  # "TABLE"|"DIMENSION"|"WELD"|"NOTE"|"SECTION"
        "page": page,
        "bbox": bbox,
        "text_raw": text_raw,
        "fields": fields or {},
        "confidence": float(confidence),
        "provider": provider,
        "low_confidence": confidence < 0.4
    }

def _read_file_bytes(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()

def _load_prompt_schema_paths(cfg: Dict[str, Any]) -> Tuple[str, str]:
    prompt_path = cfg.get("versions", {}).get("prompt_reducto") or "hybrid/config/prompts/reducto/system_v1.md"
    schema_path = cfg.get("versions", {}).get("schema_reducto") or "hybrid/config/schemas/reducto/blueprint_v1.json"
    return prompt_path, schema_path

def _load_text(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def _load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _post_reducto(endpoint: str, api_key: str, payload: Dict[str, Any], files: Dict[str, Any]) -> Dict[str, Any]:
    if requests is None:
        return {"error": "requests-not-available"}
    headers = {
        "Authorization": f"Bearer {api_key}"
    }
    resp = requests.post(endpoint, headers=headers, data=payload, files=files, timeout=90)
    try:
        return resp.json()
    except Exception:
        return {"status_code": resp.status_code, "text": resp.text}

def _map_reducto_json_to_candidates(rj: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Map your trial schema into CandidateEntity list. We’re lenient:
    - tables not in this trial schema, so we won’t emit TABLE entities
    - dimensions -> DIMENSION
    - weldSymbols -> WELD
    - sectionViews -> SECTION
    - project/customer/contractor -> NOTE (so you still see them)
    """
    cands: List[Dict[str, Any]] = []
    # The trial JSON likely has no bbox/page/conf; we’ll default and mark low_confidence accordingly.
    default_bbox = [0, 0, 0, 0]
    default_page = 0
    default_conf = 0.6  # trial. You can raise/lower later.

    # Welds
    for w in rj.get("weldSymbols", []) or []:
        fields = {
            "symbol": w.get("symbol"),
            "description": w.get("description")
        }
        cands.append(_make_candidate("WELD", default_page, default_bbox, "reducto", default_conf, fields))

    # Dimensions (general)
    for d in rj.get("dimensions", []) or []:
        fields = {
            "dimensionType": d.get("dimensionType"),
            "raw": d.get("value"),  # trial schema has only value; we keep it in raw for now
            "value": d.get("value"),
            "unit": None,
            "normalized_to_in": None,
            "feature_type": "feature"
        }
        cands.append(_make_candidate("DIMENSION", default_page, default_bbox, "reducto", default_conf, fields))

    # Layout dimensions
    for d in rj.get("layoutDimensions", []) or []:
        fields = {
            "dimensionType": d.get("layoutType"),
            "raw": d.get("value"),
            "value": d.get("value"),
            "unit": None,
            "normalized_to_in": None,
            "feature_type": "layout"
        }
        cands.append(_make_candidate("DIMENSION", default_page, default_bbox, "reducto", default_conf, fields))

    # Sections
    for s in rj.get("sectionViews", []) or []:
        fields = {
            "label": s.get("viewName"),
            "text_norm": s.get("description"),
            "scale_raw": None,
            "scale_norm": None,
            "target_page": None
        }
        cands.append(_make_candidate("SECTION", default_page, default_bbox, "reducto", default_conf, fields))

    # Project / customer / contractor as NOTES for visibility
    proj = rj.get("projectName")
    if proj:
        cands.append(_make_candidate("NOTE", default_page, default_bbox, "reducto", default_conf, {"text_norm": f"Project: {proj}"}))
    cust = rj.get("customer") or {}
    if cust.get("customerName"):
        cands.append(_make_candidate("NOTE", default_page, default_bbox, "reducto", default_conf, {"text_norm": f"Customer: {cust.get('customerName')}", "contact": cust.get("contactInformation")}))
    contr = rj.get("contractor") or {}
    if contr.get("contractorName"):
        cands.append(_make_candidate("NOTE", default_page, default_bbox, "reducto", default_conf, {"text_norm": f"Contractor: {contr.get('contractorName')}", "contact": contr.get("contactInformation")}))
    return cands

def predict(doc_path: str, cfg: Dict[str, Any], regions: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    """Main adapter entry. Returns candidate entities."""
    start = time.time()
    endpoint = os.getenv("REDUCTO_ENDPOINT", "").strip()
    api_key = os.getenv("REDUCTO_API_KEY", "").strip()
    prompt_path, schema_path = _load_prompt_schema_paths(cfg)

    # If no API creds, return empty—don’t break pipeline
    if not endpoint or not api_key:
        return []

    prompt_text = _load_text(prompt_path)
    schema_json = _load_text(schema_path)
    file_bytes = _read_file_bytes(doc_path)

    # Reducto typically wants prompt + schema + file
    payload = {
        "system_prompt": prompt_text,
        "schema": schema_json
    }
    files = {
        "file": (os.path.basename(doc_path), file_bytes)
    }
    r = _post_reducto(endpoint, api_key, payload, files)
    latency = int((time.time() - start) * 1000)

    # If API error, return empty gracefully
    if not isinstance(r, dict) or r.get("error"):
        return []

    # Expect a JSON matching your trial schema:
    candidates = _map_reducto_json_to_candidates(r)
    # Attach provider meta to each candidate (for logging convenience)
    for c in candidates:
        c.setdefault("_provider_meta", {})
        c["_provider_meta"].update({
            "latency_ms": latency,
            "adapter_version": cfg.get("versions", {}).get("adapter_versions", {}).get("reducto", "1.0.0"),
            "schema_version": cfg.get("versions", {}).get("schema_reducto"),
            "prompt_version": cfg.get("versions", {}).get("prompt_reducto")
        })
    return candidates
