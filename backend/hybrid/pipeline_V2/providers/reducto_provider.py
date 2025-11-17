from __future__ import annotations
from typing import Dict, Any, List

from ..types import Region, ProviderResult, BomRow, WeldSymbol, DimensionEntity

try:
    from backend.hybrid.adapters import reducto_adapter
except ImportError:
    reducto_adapter = None  # type: ignore[assignment]

NAME = "reducto"


def parse_region(region: Region, context: Dict[str, Any] | None = None) -> ProviderResult:
    if reducto_adapter is None:
        return ProviderResult(provider=NAME, region=region)

    cfg = context or {}
    try:
        candidates = reducto_adapter.predict(region.doc_path, cfg) if hasattr(reducto_adapter, "predict") else []
    except Exception as exc:
        return ProviderResult(provider=NAME, region=region, raw={"error": str(exc)})

    bom_rows: List[BomRow] = []
    welds: List[WeldSymbol] = []
    dims: List[DimensionEntity] = []

    for c in candidates:
        et = c.get("entity_type")
        fields = c.get("fields") or {}
        conf = float(c.get("confidence", 0.6))
        if et == "WELD":
            welds.append(
                WeldSymbol(
                    id=c.get("id"),
                    type=fields.get("symbol"),
                    reference=fields.get("description"),
                    location={"page_index": region.page_index, "bbox": c.get("bbox")},
                    provider=NAME,
                    confidence=conf,
                )
            )
        elif et == "DIMENSION":
            dims.append(
                DimensionEntity(
                    id=c.get("id"),
                    value_in=_safe_float(fields.get("value") or fields.get("normalized_to_in")),
                    unit=fields.get("unit") or "inch",
                    location={"page_index": region.page_index, "bbox": c.get("bbox")},
                    provider=NAME,
                    confidence=conf,
                )
            )

    red_result: Dict[str, Any] = {"candidates": candidates}

    return ProviderResult(
        provider=NAME,
        region=region,
        bom_rows=bom_rows,
        welds=welds,
        dimensions=dims,
        raw=red_result,
    )


def _safe_float(val: Any) -> float | None:
    try:
        return float(val)
    except Exception:
        return None
