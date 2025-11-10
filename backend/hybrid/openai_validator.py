# backend/hybrid/openai_validator.py
from __future__ import annotations

import os
import json
import logging
from typing import Dict, Any

import httpx  # <-- we inject our own httpx client to avoid the 'proxies' kwarg issue
from openai import OpenAI

SCHEMA_KEYS = [
    "weld_symbols_present",
    "weld_symbols_count",
    "dim_values_count",
    "bom_tag_count",
    "bom_material_count",
    "bom_qty_count",
]

# --- Logging ---
logger = logging.getLogger("hybrid.openai_validator")  # just a label, not your API key
logger.setLevel(logging.INFO)
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
    logger.addHandler(_h)

# --- Config ---
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY env var is not set")

# Inject our own httpx.Client so the OpenAI SDK doesn't construct its wrapper (which passes 'proxies')
_httpx = httpx.Client(timeout=60.0)  # no proxies kwarg here
client = OpenAI(api_key=OPENAI_API_KEY, http_client=_httpx)

SYSTEM_MSG = (
    "You are a strict validator. You receive noisy model outputs and must return a **single JSON object** "
    "with exactly these keys and types:\n"
    "  - weld_symbols_present: boolean\n"
    "  - weld_symbols_count: integer >= 0\n"
    "  - dim_values_count: integer >= 0\n"
    "  - bom_tag_count: integer >= 0\n"
    "  - bom_material_count: integer >= 0\n"
    "  - bom_qty_count: integer >= 0\n"
    "If values are uncertain, make the best conservative estimate (0 if truly unknown). "
    "Return only valid JSON with no extra keys, no comments, and no trailing commas."
)

USER_TEMPLATE = """Noisy inputs from earlier stages:

DONUT_RAW:
{donut_raw}

LAYOUTLM_JSON:
{layout_json}

TEXTRACT_JSON:
{textract_json}

Return ONLY a JSON object with exactly these keys: {keys}.
"""

def normalize_int(x: Any) -> int:
    try:
        v = int(x)
        return max(0, v)
    except Exception:
        return 0

def normalize_bool(x: Any) -> bool:
    if isinstance(x, bool):
        return x
    s = str(x).strip().lower()
    return s in {"true", "1", "yes", "y"}

def postprocess_schema(obj: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure correct keys/types; fill missing with conservative defaults."""
    out = {}
    out["weld_symbols_present"] = normalize_bool(obj.get("weld_symbols_present", False))
    out["weld_symbols_count"] = normalize_int(obj.get("weld_symbols_count", 0))
    out["dim_values_count"] = normalize_int(obj.get("dim_values_count", 0))
    out["bom_tag_count"] = normalize_int(obj.get("bom_tag_count", 0))
    out["bom_material_count"] = normalize_int(obj.get("bom_material_count", 0))
    out["bom_qty_count"] = normalize_int(obj.get("bom_qty_count", 0))
    return out

def validate_with_openai(
    donut_raw: str,
    layout_json: Dict[str, Any] | None,
    textract_json: Dict[str, Any] | None,
    model: str = "gpt-4.1",
) -> Dict[str, Any]:
    """
    Calls OpenAI Responses API (via python SDK) to coerce/repair into our schema.
    Returns a dict with exactly SCHEMA_KEYS.
    """
    layout_str = json.dumps(layout_json or {}, ensure_ascii=False)
    textract_str = json.dumps(textract_json or {}, ensure_ascii=False)

    user_msg = USER_TEMPLATE.format(
        donut_raw=(donut_raw or "")[:4000],  # keep prompt small-ish
        layout_json=layout_str[:4000],
        textract_json=textract_str[:4000],
        keys=", ".join(SCHEMA_KEYS),
    )

    # Responses API (json_object tool) to enforce structured output
    resp = client.responses.create(
        model=model,
        reasoning={"effort": "medium"},
        input=[
            {
                "role": "system",
                "content": [{"type": "text", "text": SYSTEM_MSG}],
            },
            {
                "role": "user",
                "content": [{"type": "text", "text": user_msg}],
            },
        ],
        # Ask the model to produce a single JSON object:
        response_format={"type": "json_object"},
    )

    # Pull text from the response
    try:
        out_text = resp.output_text  # SDK helper that concatenates text from content parts
    except Exception:
        # Fallback: manual extraction if needed
        out_text = ""
        try:
            chunks = resp.output[0].content
            for c in chunks:
                if c.type == "output_text":
                    out_text += c.text
        except Exception:
            pass

    if not out_text:
        logger.warning("Empty model reply; returning conservative defaults.")
        return postprocess_schema({})

    # Parse JSON
    try:
        obj = json.loads(out_text)
    except Exception:
        logger.warning("Model did not return valid JSON; returning conservative defaults.")
        return postprocess_schema({})

    return postprocess_schema(obj)

# ---------------- CLI smoke test ----------------
if __name__ == "__main__":
    # Tiny demo payload (replace with real pipeline outputs)
    donut_raw_demo = "<s_answer>{\"weld_symbols_present\": false,  \"weld_symbols_count\": 20,  \"dim_values_count\": 1,  \"bom_tag_count\": 0,  \"bom_material_count\": 0,  \"bom_qty_count\": 0}</s>"
    layout_demo = {"weld_symbols_present": False, "weld_symbols_count": 4}  # pretend partial
    textract_demo = {"ocr_words": 1234}  # pretend metadata

    fixed = validate_with_openai(
        donut_raw=donut_raw_demo,
        layout_json=layout_demo,
        textract_json=textract_demo,
        model="gpt-4.1",
    )
    print(json.dumps(fixed, indent=2))
