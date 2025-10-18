# hybrid/openai_validator.py
"""
OpenAI Validator & JSON Normalizer for Tape Measure AI Hybrid Parsing Pipeline
-------------------------------------------------------------------------------
Uses GPT-4.1 to:
 - Validate parsed output from Donut, LayoutLMv3, Textract
 - Repair malformed or partial JSON
 - Enforce consistent schema and numeric sanity
"""

import os
import json
import logging
from openai import OpenAI
from typing import Dict, Any

# -----------------------------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------------------------
OPENAI_MODEL = "gpt-4.1"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise EnvironmentError(
        "Missing OPENAI_API_KEY environment variable. Run:\n"
        '  export OPENAI_API_KEY="sk-..."'
    )

client = OpenAI(api_key=OPENAI_API_KEY)

logger = logging.getLogger("hybrid.openai_validator")
logger.setLevel(logging.INFO)

# -----------------------------------------------------------------------------
# SCHEMA DEFINITION
# -----------------------------------------------------------------------------
SCHEMA_TEMPLATE = {
    "weld_symbols_present": False,
    "weld_symbols_count": 0,
    "dim_values_count": 0,
    "bom_tag_count": 0,
    "bom_material_count": 0,
    "bom_qty_count": 0,
}

SCHEMA_DESC = """
{
  "weld_symbols_present": boolean,      // True if any weld symbols exist
  "weld_symbols_count": integer,        // Count of weld symbols
  "dim_values_count": integer,          // Count of dimension value annotations
  "bom_tag_count": integer,             // Count of BOM header tags
  "bom_material_count": integer,        // Count of BOM material rows
  "bom_qty_count": integer              // Count of BOM quantity values
}
"""

# -----------------------------------------------------------------------------
# HELPER: Local JSON sanity repair before calling GPT
# -----------------------------------------------------------------------------
def _local_repair(obj: Dict[str, Any]) -> Dict[str, Any]:
    """Ensures types and missing fields are fixed before sending to GPT."""
    fixed = {}
    for key, default in SCHEMA_TEMPLATE.items():
        val = obj.get(key, default)
        # Type coercion
        if isinstance(default, bool):
            val = bool(val)
        else:
            try:
                val = int(val)
            except Exception:
                val = default
        fixed[key] = val
    return fixed


# -----------------------------------------------------------------------------
# MAIN VALIDATION FUNCTION
# -----------------------------------------------------------------------------
def validate_counts_with_openai(raw_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validates & repairs parsed data to conform to the 6-field schema.
    Returns a clean dict that always passes JSON schema validation.
    """

    # Step 1: Basic local fix before GPT
    base = _local_repair(raw_dict or {})

    # Step 2: Construct system + user prompts
    system_prompt = (
        "You are a strict JSON validator for fabrication blueprint parsing. "
        "You always output valid JSON with no commentary or extra text."
    )

    user_prompt = f"""
Validate and repair the following JSON object so it matches this exact schema:

{SCHEMA_DESC}

Rules:
 - All counts must be integers (>=0)
 - 'weld_symbols_present' must be boolean
 - If any weld_symbols_count > 0, then weld_symbols_present must be true
 - If weld_symbols_present is false, weld_symbols_count must be 0
 - Fill any missing or null fields with logical defaults
 - Output only a JSON object. No extra text.

Input object:
{json.dumps(base, indent=2)}
"""

    try:
        resp = client.responses.create(
            model=OPENAI_MODEL,
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
        )

        content = resp.output[0].content[0].text
        result = json.loads(content)

        # Final local repair pass (ensures numeric types)
        return _local_repair(result)

    except Exception as e:
        logger.warning(f"[OpenAI validator] Fallback to local schema repair: {e}")
        return base


# -----------------------------------------------------------------------------
# DEMO ENTRY POINT
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    test_input = {
        "weld_symbols_present": True,
        "weld_symbols_count": "4",
        "dim_values_count": "3",
        "bom_tag_count": None,
        "bom_material_count": 2,
        # Missing bom_qty_count
    }

    clean = validate_counts_with_openai(test_input)
    print(json.dumps(clean, indent=2))
