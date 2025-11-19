# backend/hybrid/pipeline_V2/providers/o4_mini_provider.py
from __future__ import annotations

import base64
import json
from typing import Dict, Any

from openai import OpenAI

from ..config import settings
from ..types import (
    Region,
    ProviderResult,
    BomRow,
    WeldSymbol,
    DimensionEntity,
    SheetMetadata,
)

# Initialize OpenAI client using env-driven settings
client = OpenAI(
    api_key=settings.OPENAI_API_KEY,
    base_url=settings.OPENAI_BASE_URL or None,
)

NAME = "o4-mini"

O4_PROMPT = """
You are an expert structural-steel blueprint interpreter.

You receive a blueprint page image and must return JSON with:

- "regions": list of objects with:
    - "type": one of ["title_block","bom_table","weld_cluster","dimensions","notes"]
    - "bbox": [x1, y1, x2, y2] normalized 0-1 in page coordinates
    - "metadata": optional object for any extra info

- "bom_rows": list of:
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

- "weld_symbols": list of:
    {
      "id": string|null,
      "type": string|null,
      "size_in": number|null,
      "length_in": number|null,
      "all_around": boolean|null,
      "both_sides": boolean|null,
      "reference": string|null
    }

- "dimensions": list of:
    {
      "id": string|null,
      "value_in": number|null,
      "unit": "inch" | "ft" | "mm" | "cm" | null,
      "tolerance_in": number|null
    }

- "metadata": optional sheet-level metadata:
    {
      "sheet_number": string|null,
      "sheet_title": string|null,
      "revision": string|null,
      "date": string|null,
      "scale": string|null,
      "drawn_by": string|null,
      "checked_by": string|null
    }

Return ONLY a strict JSON object, no comments or extra text.
"""


def _encode_image_to_data_url(image_bytes: bytes) -> str:
    """
    Encode raw image bytes as a data URL suitable for the Responses API.
    """
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def first_pass_page(image_bytes: bytes) -> Dict[str, Any]:
    """
    Run o4-mini on a single page image and return parsed JSON (dict).

    NOTE:
    - We do NOT use `response_format` because the OpenAI SDK version
      in this environment does not support that argument on Responses.create().
    - Instead, we rely on a strong prompt asking for strict JSON and
      then parse the text.
    """
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not set; required for o4-mini provider")

    data_url = _encode_image_to_data_url(image_bytes)

    response = client.responses.create(
        model=settings.O4_MODEL_NAME,
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": O4_PROMPT},
                    {"type": "input_image", "image_url": data_url},
                ],
            }
        ],
    )

    # Try to extract the JSON string from the response in a way that works
    # across SDK minor versions.
    #
    # Typical shape (1.x SDK):
    #   response.output[0].content[0].text
    out0 = response.output[0].content[0]

    if hasattr(out0, "text"):
        json_text = out0.text
    else:
        # Fallback: stringify and hope it's already plain JSON
        json_text = str(out0)

    return json.loads(json_text)


def to_bom_result(region: Region, o4_results_for_page: Dict[str, Any]) -> ProviderResult:
    """
    Convert o4-mini JSON for this page into BomRow ProviderResult.
    """
    rows = []
    for r in o4_results_for_page.get("bom_rows", []):
        rows.append(
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
                region_ref=region,
                provider=NAME,
                confidence=0.75,  # heuristic default
            )
        )
    return ProviderResult(provider=NAME, region=region, bom_rows=rows, raw=o4_results_for_page)


def to_welds_result(region: Region, o4_results_for_page: Dict[str, Any]) -> ProviderResult:
    """
    Convert o4-mini JSON for this page into WeldSymbol ProviderResult.
    """
    welds = []
    for w in o4_results_for_page.get("weld_symbols", []):
        welds.append(
            WeldSymbol(
                id=w.get("id"),
                type=w.get("type"),
                size_in=w.get("size_in"),
                length_in=w.get("length_in"),
                all_around=w.get("all_around"),
                both_sides=w.get("both_sides"),
                reference=w.get("reference"),
                location={
                    "page_index": region.page_index,
                    "bbox": region.bbox,
                },
                provider=NAME,
                confidence=0.75,
            )
        )
    return ProviderResult(provider=NAME, region=region, welds=welds, raw=o4_results_for_page)


def to_dimensions_result(region: Region, o4_results_for_page: Dict[str, Any]) -> ProviderResult:
    """
    Convert o4-mini JSON for this page into DimensionEntity ProviderResult.
    """
    dims = []
    for d in o4_results_for_page.get("dimensions", []):
        dims.append(
            DimensionEntity(
                id=d.get("id"),
                value_in=d.get("value_in"),
                unit=d.get("unit") or "inch",
                tolerance_in=d.get("tolerance_in"),
                location={
                    "page_index": region.page_index,
                    "bbox": region.bbox,
                },
                provider=NAME,
                confidence=0.7,
            )
        )
    return ProviderResult(provider=NAME, region=region, dimensions=dims, raw=o4_results_for_page)


def to_metadata_result(region: Region, o4_results_for_page: Dict[str, Any]) -> ProviderResult:
    """
    Convert o4-mini JSON for this page into SheetMetadata ProviderResult.
    """
    meta_dict = o4_results_for_page.get("metadata") or {}
    metadata = SheetMetadata(
        sheet_number=meta_dict.get("sheet_number"),
        sheet_title=meta_dict.get("sheet_title"),
        revision=meta_dict.get("revision"),
        date=meta_dict.get("date"),
        scale=meta_dict.get("scale"),
        drawn_by=meta_dict.get("drawn_by"),
        checked_by=meta_dict.get("checked_by"),
        extra={
            k: v
            for k, v in meta_dict.items()
            if k
            not in {
                "sheet_number",
                "sheet_title",
                "revision",
                "date",
                "scale",
                "drawn_by",
                "checked_by",
            }
        },
    )
    return ProviderResult(provider=NAME, region=region, metadata=metadata, raw=o4_results_for_page)
