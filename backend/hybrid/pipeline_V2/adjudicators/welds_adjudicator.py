from __future__ import annotations
from typing import List, Dict, Any

from .base import _call_adj_model
from ..types import WeldSymbol, ProviderResult

PROMPT_WELDS = """
You combine weld symbols from multiple OCR / CV providers into a single list.

Input JSON structure:
{
  "candidates": [
    {
      "provider": "o4-mini | reducto | textract | donut | layoutlm",
      "welds": [
        {
          "id": string|null,
          "type": string|null,
          "size_in": number|null,
          "length_in": number|null,
          "all_around": boolean|null,
          "both_sides": boolean|null,
          "reference": string|null,
          "location": object|null
        }
      ]
    }
  ]
}

Your job:
- Merge symbols that clearly refer to the same weld (same id or matching type/size/location).
- Prefer o4-mini and reducto values when confident.
- Keep booleans as true/false when clearly stated; otherwise leave null.
- Be conservative: if uncertain, leave a field null rather than guessing.

Return JSON:
{
  "welds": [ ...merged weld symbols, same shape as above... ]
}
"""


def adjudicate(provider_results: List[ProviderResult]) -> List[WeldSymbol]:
    if not provider_results:
        return []

    payload: Dict[str, Any] = {"candidates": []}
    for pr in provider_results:
        welds = []
        for w in pr.welds:
            welds.append(
                {
                    "id": w.id,
                    "type": w.type,
                    "size_in": w.size_in,
                    "length_in": w.length_in,
                    "all_around": w.all_around,
                    "both_sides": w.both_sides,
                    "reference": w.reference,
                    "location": w.location,
                }
            )
        payload["candidates"].append({"provider": pr.provider, "welds": welds})

    result = _call_adj_model(PROMPT_WELDS, payload)
    final_welds_json = result.get("welds", [])

    final_welds: List[WeldSymbol] = []
    for w in final_welds_json:
        final_welds.append(
            WeldSymbol(
                id=w.get("id"),
                type=w.get("type"),
                size_in=w.get("size_in"),
                length_in=w.get("length_in"),
                all_around=w.get("all_around"),
                both_sides=w.get("both_sides"),
                reference=w.get("reference"),
                location=w.get("location"),
                provider="adjudicated",
                confidence=0.9,
            )
        )
    return final_welds
