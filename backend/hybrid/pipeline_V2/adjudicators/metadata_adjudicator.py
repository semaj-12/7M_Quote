from __future__ import annotations
from typing import List, Dict, Any

from .base import _call_adj_model
from ..types import SheetMetadata, ProviderResult

PROMPT_METADATA = """
You merge title block / sheet metadata from multiple OCR / CV providers into one record.

Input JSON structure:
{
  "candidates": [
    {
      "provider": "o4-mini | reducto | textract | donut | layoutlm",
      "metadata": {
        "sheet_number": string|null,
        "sheet_title": string|null,
        "revision": string|null,
        "date": string|null,
        "scale": string|null,
        "drawn_by": string|null,
        "checked_by": string|null,
        "extra": object|null
      }
    }
  ]
}

Your job:
- Choose the clearest value for each field; prefer o4-mini and reducto when confident.
- Keep concise strings; trim obvious noise like repeated labels.
- Merge useful extra fields but avoid duplicates or nonsense.
- If a field is unclear, leave it null.

Return JSON:
{
  "metadata": { ...final metadata object... }
}
"""


def adjudicate(provider_results: List[ProviderResult]) -> SheetMetadata | None:
    if not provider_results:
        return None

    payload: Dict[str, Any] = {"candidates": []}
    for pr in provider_results:
        meta = pr.metadata
        payload["candidates"].append(
            {
                "provider": pr.provider,
                "metadata": {
                    "sheet_number": meta.sheet_number if meta else None,
                    "sheet_title": meta.sheet_title if meta else None,
                    "revision": meta.revision if meta else None,
                    "date": meta.date if meta else None,
                    "scale": meta.scale if meta else None,
                    "drawn_by": meta.drawn_by if meta else None,
                    "checked_by": meta.checked_by if meta else None,
                    "extra": meta.extra if meta else None,
                },
            }
        )

    result = _call_adj_model(PROMPT_METADATA, payload)
    meta_json = result.get("metadata") or {}

    return SheetMetadata(
        sheet_number=meta_json.get("sheet_number"),
        sheet_title=meta_json.get("sheet_title"),
        revision=meta_json.get("revision"),
        date=meta_json.get("date"),
        scale=meta_json.get("scale"),
        drawn_by=meta_json.get("drawn_by"),
        checked_by=meta_json.get("checked_by"),
        extra=meta_json.get("extra") or {},
    )
