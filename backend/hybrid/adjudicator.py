import os
import json
from typing import List, Dict, Any

USE_ADJUDICATOR = bool(int(os.environ.get("USE_ADJUDICATOR", "0")))
DEFAULT_MODEL = os.environ.get("ADJUDICATOR_MODEL", "gpt-4.1-mini")

ADJ_PROMPT = """You are a careful adjudicator for document parsing.
You will receive multiple candidate JSON snippets for a SINGLE entity extracted from a blueprint.
Choose the best final fields that:
1) Match the schema keys provided,
2) Are most internally consistent (units, totals, ranges),
3) Prefer values that agree across candidates.

Return STRICT JSON with only the schema keys. Never invent new fields.
"""

def _format_messages(conflict: Dict[str, Any], schema_keys: List[str]) -> List[Dict[str, str]]:
    samples = json.dumps(conflict.get("candidates", []), ensure_ascii=False, indent=2)
    schema = json.dumps(schema_keys, ensure_ascii=False)
    return [
        {"role": "system", "content": ADJ_PROMPT},
        {"role": "user", "content": f"Schema keys: {schema}\n\nCandidates:\n{samples}\n\nReturn JSON using only these keys."}
    ]

def _get_model_for_entity(etype: str, cfg: Dict[str, Any]) -> str:
    """Read the model name for this entity type from ensemble.json, or fall back to env/default."""
    models_map = (
        cfg.get("adjudicator", {}).get("models", {})
        if isinstance(cfg, dict)
        else {}
    )
    return models_map.get(etype, cfg.get("adjudicator", {}).get("default_model", DEFAULT_MODEL))

def adjudicate_conflict(conflict: Dict[str, Any], schema_keys: List[str], cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    conflict = {
      "entity_type": "DIMENSION",
      "candidates": [ { "fields": {...}, "provider":"reducto", "confidence":0.8 }, ... ]
    }
    """
    etype = conflict.get("entity_type", "UNKNOWN")
    model_name = _get_model_for_entity(etype, cfg)

    if not USE_ADJUDICATOR:
        # Simple fallback: pick highest confidence
        return max(conflict["candidates"], key=lambda c: c.get("confidence", 0.0)).get("fields", {})

    import openai  # requires OPENAI_API_KEY in env
    client = openai.OpenAI()

    msgs = _format_messages(conflict, schema_keys)
    resp = client.chat.completions.create(
        model=model_name,
        messages=msgs,
        temperature=0
    )
    text = resp.choices[0].message.content.strip()
    try:
        data = json.loads(text)
        return {k: data.get(k) for k in schema_keys}
    except Exception:
        # If parsing fails, fallback to best confidence
        return max(conflict["candidates"], key=lambda c: c.get("confidence", 0.0)).get("fields", {})
