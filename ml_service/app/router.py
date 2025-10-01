# ml_service/app/router.py
from typing import Dict, Any, List, Tuple
from .settings import settings
from .validators import validate_field
from .providers.textract import run_textract
from .providers.layoutlmv3 import run_layoutlmv3
from .providers.donut import run_donut
from .providers.openai_fallback import run_openai_fallback

REQUIRED = ["project_name", "sheet_number", "revision", "date", "scale"]

def assemble_json(donut: Dict[str, Any], ner: Dict[str, Any], ocr: Dict[str, Any]) -> Dict[str, Any]:
    """Merge Donut + NER into a normalized doc."""
    doc: Dict[str, Any] = {
        "project_name": {"value": None, "source": None, "confidence": 0.0},
        "sheet_number": {"value": None, "source": None, "confidence": 0.0},
        "revision": {"value": None, "source": None, "confidence": 0.0},
        "date": {"value": None, "source": None, "confidence": 0.0},
        "scale": {"value": None, "source": None, "confidence": 0.0},
        "bom_headers": donut.get("bom_headers") if donut else [],
        "bom": donut.get("bom") if donut else [],
        "dimensions": donut.get("dimensions") if donut else [],
        "weld_symbols": donut.get("weld_symbols") if donut else [],
    }

    # prefer NER for title block fields
    for f in ["project_name","sheet_number","revision","date","scale"]:
        # from NER
        if ner and f in ner and ner[f].get("value"):
            doc[f] = {"value": ner[f]["value"], "source": "ner", "confidence": float(ner[f].get("confidence", 0.0))}
        # fallback from Donut title_block
        elif donut and donut.get("title_block", {}).get(f):
            doc[f] = {"value": donut["title_block"][f], "source": "donut", "confidence": 0.0}
    return doc

def compute_coverage(doc: Dict[str, Any]) -> float:
    ok = 0
    for f in REQUIRED:
        v = (doc.get(f) or {}).get("value")
        if validate_field(field=f, value=v):
            ok += 1
    return ok / len(REQUIRED)

def needs_fallback(doc: Dict[str, Any]) -> List[str]:
    missing = []
    for f in REQUIRED:
        v = (doc.get(f) or {}).get("value")
        conf = (doc.get(f) or {}).get("confidence", 0.0)
        if not validate_field(f, v):  # invalid or missing
            missing.append(f)
        elif (doc.get(f) or {}).get("source") == "ner" and conf < settings.thresholds.entity_min:
            # low-confidence NER: treat as missing to allow upgrade
            missing.append(f)
    return missing

def route_extract(page_path: str) -> Dict[str, Any]:
    # 1) Primary calls
    ocr = run_textract(page_path)
    ner = run_layoutlmv3(page_path, ocr)
    donut = run_donut(page_path)

    # 2) Merge & validate
    doc = assemble_json(donut, ner, ocr)
    coverage = compute_coverage(doc)
    stage = "primary"

    if coverage >= settings.thresholds.page_coverage:
        doc["_router"] = {"stage": stage, "coverage": coverage}
        return doc

    # 3) (Optional) simple recovery could go here (rotations/crops) – skipped for MVP

    # 4) Fallback to OpenAI for missing/invalid fields
    missing = needs_fallback(doc)
    if missing:
        # Build a single OCR text blob (MVP). Later: pass cropped images too.
        ocr_text = " ".join(w.get("text","") for w in (ocr.get("words") or []))
        oa = run_openai_fallback(missing_fields=missing, ocr_text=ocr_text, page_path=page_path)
        for f in missing:
            if oa.get(f, {}).get("value"):
                doc[f] = {
                    "value": oa[f]["value"],
                    "source": "openai_fallback",
                    "confidence": float(oa[f].get("confidence", 0.6))
                }
        stage = "openai_fallback"
        coverage = compute_coverage(doc)

    doc["_router"] = {"stage": stage, "coverage": coverage}
    return doc
