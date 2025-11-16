from __future__ import annotations
from typing import List, Dict, Any

from .base import _call_adj_model
from ..types import BomRow, ProviderResult

PROMPT_BOM = """
You are adjudicating conflicting structural steel BOM rows from multiple OCR / CV providers.

Input JSON structure:
{
  "candidates": [
    {
      "provider": "o4-mini | reducto | textract | donut | layoutlm",
      "rows": [
        {
          "mark": string|null,
          "description": string|null,
          "profile": string|null,
          "material": string|null,
          "length_in": number|null,
          "quantity": number|null,
          "weight_per_ft_lb": number|null,
          "total_weight_lb": number|null,
          "notes": string|null
        }
      ]
    }
  ]
}

Your job:
- Merge rows that are obviously the same piece (same mark or same profile+length).
- Prefer o4-mini and reducto values when confident.
- Fix inconsistent units, convert to inches where possible.
- Ensure numeric fields are numbers, not strings.
- If weight_per_ft_lb and quantity and length_in are known, set total_weight_lb = weight_per_ft_lb * (length_in/12) * quantity.
- Be conservative: if unsure, leave field null instead of guessing.

Return JSON:
{
  "rows": [ ...merged and cleaned rows, same shape as above rows... ]
}
"""


def adjudicate(provider_results: List[ProviderResult]) -> List[BomRow]:
    if not provider_results:
        return []

    payload: Dict[str, Any] = {"candidates": []}
    for pr in provider_results:
        rows = []
        for r in pr.bom_rows:
            rows.append(
                {
                    "mark": r.mark,
                    "description": r.description,
                    "profile": r.profile,
                    "material": r.material,
                    "length_in": r.length_in,
                    "quantity": r.quantity,
                    "weight_per_ft_lb": r.weight_per_ft_lb,
                    "total_weight_lb": r.total_weight_lb,
                    "notes": r.notes,
                }
            )
        payload["candidates"].append({"provider": pr.provider, "rows": rows})

    result = _call_adj_model(PROMPT_BOM, payload)
    final_rows_json = result.get("rows", [])

    final_rows: List[BomRow] = []
    for r in final_rows_json:
        final_rows.append(
            BomRow(
                mark=r.get("mark"),
                description=r.get("description"),
                profile=r.get("profile"),
                material=r.get("material"),
                length_in=r.get("length_in"),
                quantity=r.get("quantity"),
                weight_per_ft_lb=r.get("weight_per_ft_lb"),
                total_weight_lb=r.get("total_weight_lb"),
                notes=r.get("notes"),
                provider="adjudicated",
                confidence=0.9,
            )
        )
    return final_rows
