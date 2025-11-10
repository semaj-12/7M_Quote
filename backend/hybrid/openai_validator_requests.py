# backend/hybrid/openai_validator_requests.py
from __future__ import annotations
import os
import json
import logging
from typing import Any, Dict, Optional
import requests

logger = logging.getLogger("hybrid.openai_validator")
logger.setLevel(logging.INFO)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
TIMEOUT = float(os.getenv("HYBRID_OPENAI_TIMEOUT_SEC", "60"))

SCHEMA_NAME = "HybridCounts"
COUNTS_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "weld_symbols_present": {"type": "boolean"},
        "weld_symbols_count": {"type": "integer", "minimum": 0},
        "dim_values_count": {"type": "integer", "minimum": 0},
        "bom_tag_count": {"type": "integer", "minimum": 0},
        "bom_material_count": {"type": "integer", "minimum": 0},
        "bom_qty_count": {"type": "integer", "minimum": 0},
    },
    "required": [
        "weld_symbols_present",
        "weld_symbols_count",
        "dim_values_count",
        "bom_tag_count",
        "bom_material_count",
        "bom_qty_count",
    ],
}

SYSTEM_INSTRUCTIONS = (
    "You are a strict JSON validator and reconciler for fabrication drawings. "
    "Given partial model outputs, you MUST return a single JSON object that "
    "conforms exactly to the provided JSON schema. Do not include any prose."
)

def _headers() -> Dict[str, str]:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

def _mk_user_prompt(donut_raw: Optional[str], layout_json: Dict[str, Any], textract_json: Dict[str, Any]) -> str:
    # Keep the prompt compact; models do better when the schema is enforced via text.format.
    return (
        "Reconcile these sources into the final counts.\n\n"
        f"[DONUT_RAW]\n{(donut_raw or '')[:1000]}\n\n"
        "[LAYOUTLM_JSON]\n" + json.dumps(layout_json, ensure_ascii=False) + "\n\n"
        "[TEXTRACT_JSON]\n" + json.dumps(textract_json or {}, ensure_ascii=False) + "\n\n"
        "Return ONLY the JSON object."
    )

def _responses_create(model: str, system_text: str, user_text: str, use_schema: bool = True) -> Dict[str, Any]:
    """
    Call the Responses API. When use_schema=True, we pass text.format as an object:
      text.format = {
        type: 'json_schema',
        name: 'HybridCounts',
        schema: {...},
        strict: true
      }
    Content blocks must use 'input_text' for text inputs.
    """
    url = f"{OPENAI_BASE_URL.rstrip('/')}/responses"

    payload: Dict[str, Any] = {
        "model": model,
        "input": [
            {
                "role": "system",
                "content": [{"type": "input_text", "text": system_text}],
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": user_text}],
            },
        ],
    }

    if use_schema:
        payload["text"] = {
            "format": {
                "type": "json_schema",
                "name": SCHEMA_NAME,           # NOTE: required at this level
                "schema": COUNTS_SCHEMA,       # the JSON Schema
                "strict": True,                # force exact conformance
            }
        }

    # Absolutely no unsupported fields here (no seed, no reasoning.effort, etc.)
    resp = requests.post(url, headers=_headers(), data=json.dumps(payload), timeout=TIMEOUT)
    if resp.status_code != 200:
        raise RuntimeError(f"OpenAI error {resp.status_code}: {resp.text}")
    return resp.json()

def _extract_text(response_json: Dict[str, Any]) -> str:
    """
    Responses API returns:
      { id, output: [ {type: 'message', content: [{type:'output_text', text:'...'}], ...} ], ... }
    We need to gather the output_text chunks.
    """
    out = response_json.get("output") or []
    pieces = []
    for item in out:
        if item.get("type") == "message":
            for c in item.get("content", []):
                # The API names this 'output_text' for model output blocks.
                if c.get("type") == "output_text":
                    pieces.append(c.get("text", ""))
    return "".join(pieces).strip()

def validate_with_openai_requests(
    donut_raw: Optional[str],
    layout_json: Dict[str, Any],
    textract_json: Optional[Dict[str, Any]] = None,
    model: str = "gpt-4.1",
) -> Dict[str, Any]:
    """
    Try structured output first. If the server rejects 'text.format' shape,
    fall back to plain text (no schema) and best-effort JSON parse.
    """
    user_prompt = _mk_user_prompt(donut_raw, layout_json, textract_json or {})

    # 1) Try schema-enforced structured output
    try:
        resp = _responses_create(model=model, system_text=SYSTEM_INSTRUCTIONS, user_text=user_prompt, use_schema=True)
        text = _extract_text(resp)
        if text:
            return json.loads(text)
    except Exception as e:
        # Common 400s include: missing text.format.name, wrong shape, etc.
        logger.warning("[OpenAI] Schema path failed; falling back to plain JSON parse… (%s)", e)

    # 2) Fallback: no text.format — ask for JSON and parse
    try:
        plain_sys = SYSTEM_INSTRUCTIONS + " Return ONLY the JSON object, no extra text."
        resp = _responses_create(model=model, system_text=plain_sys, user_text=user_prompt, use_schema=False)
        text = _extract_text(resp)
        if text:
            # Be tolerant to trailing prose just in case.
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                text = text[start : end + 1]
            return json.loads(text)
    except Exception as e:
        logger.error("[OpenAI] Fallback path failed: %s", e)

    # 3) Final safety: if both calls fail, just return layout_json so pipeline continues
    return {
        "weld_symbols_present": bool(layout_json.get("weld_symbols_present", False)),
        "weld_symbols_count": int(layout_json.get("weld_symbols_count", 0) or 0),
        "dim_values_count": int(layout_json.get("dim_values_count", 0) or 0),
        "bom_tag_count": int(layout_json.get("bom_tag_count", 0) or 0),
        "bom_material_count": int(layout_json.get("bom_material_count", 0) or 0),
        "bom_qty_count": int(layout_json.get("bom_qty_count", 0) or 0),
    }

if __name__ == "__main__":
    # tiny smoke test without images; just ensures the module runs.
    demo = validate_with_openai_requests(
        donut_raw="<s_answer>{...}</s>",
        layout_json={
            "weld_symbols_present": False,
            "weld_symbols_count": 0,
            "dim_values_count": 0,
            "bom_tag_count": 0,
            "bom_material_count": 0,
            "bom_qty_count": 0,
        },
        textract_json={},
        model=os.getenv("HYBRID_OPENAI_MODEL", "gpt-4.1"),
    )
    print(json.dumps(demo, indent=2))
