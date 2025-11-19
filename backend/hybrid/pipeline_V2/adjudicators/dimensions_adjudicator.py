from __future__ import annotations
from typing import List, Dict, Any

from .base import _call_adj_model
from ..types import DimensionEntity, ProviderResult

PROMPT_DIMENSIONS = """
You merge dimension entities from multiple OCR / CV providers into a unified list.

Input JSON structure:
{
  "candidates": [
    {
      "provider": "o4-mini | reducto | textract | donut | layoutlm",
      "dimensions": [
        {
          "id": string|null,
          "value_in": number|null,
          "unit": string|null,
          "tolerance_in": number|null,
          "location": object|null
        }
      ]
    }
  ]
}

Your job:
- Merge obvious duplicates (matching id or same value/unit/location).
- Prefer o4-mini and reducto values when confident.
- Normalize units to inches where possible; set unit to "inch" for numeric inch values.
- If unsure about a value, leave it null instead of inventing numbers.

Return JSON:
{
  "dimensions": [ ...merged dimensions, same shape as above... ]
}
"""


def adjudicate(provider_results: List[ProviderResult]) -> List[DimensionEntity]:
    if not provider_results:
        return []

    payload: Dict[str, Any] = {"candidates": []}
    for pr in provider_results:
        dims = []
        for d in pr.dimensions:
            dims.append(
                {
                    "id": d.id,
                    "value_in": d.value_in,
                    "unit": d.unit,
                    "tolerance_in": d.tolerance_in,
                    "location": d.location,
                }
            )
        payload["candidates"].append({"provider": pr.provider, "dimensions": dims})

    result = _call_adj_model(PROMPT_DIMENSIONS, payload)
    final_dimensions_json = result.get("dimensions", [])

    final_dimensions: List[DimensionEntity] = []
    for d in final_dimensions_json:
        final_dimensions.append(
            DimensionEntity(
                id=d.get("id"),
                value_in=d.get("value_in"),
                unit=d.get("unit"),
                tolerance_in=d.get("tolerance_in"),
                location=d.get("location"),
                provider="adjudicated",
                confidence=0.9,
            )
        )
    return final_dimensions
