from __future__ import annotations
from typing import Dict, Any, List

from ..types import Region, ProviderResult, BomRow, WeldSymbol

try:
    from backend.hybrid import donut_infer
except ImportError:
    donut_infer = None  # type: ignore[assignment]

NAME = "donut"


def parse_region(region: Region, context: Dict[str, Any] | None = None) -> ProviderResult:
    if donut_infer is None:
        return ProviderResult(provider=NAME, region=region)

    cfg = context or {}
    try:
        runner = (
            donut_infer.DonutRunner(model_dir=cfg.get("donut_model_dir"))
            if cfg.get("donut_model_dir")
            else donut_infer.DonutRunner()
        )
        donut_result: Dict[str, Any] = runner.predict_counts(region.doc_path)
    except Exception as exc:  # safeguard if model dir missing
        return ProviderResult(provider=NAME, region=region, raw={"error": str(exc)})

    bom_rows: List[BomRow] = []
    welds: List[WeldSymbol] = []

    parsed_json = donut_result.get("json") if isinstance(donut_result, dict) else None
    if isinstance(parsed_json, dict):
        for r in parsed_json.get("bom_rows", []) or []:
            bom_rows.append(
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
                    confidence=0.55,
                )
            )

        for w in parsed_json.get("weld_symbols", []) or []:
            welds.append(
                WeldSymbol(
                    id=w.get("id"),
                    type=w.get("type"),
                    size_in=w.get("size_in"),
                    length_in=w.get("length_in"),
                    all_around=w.get("all_around"),
                    both_sides=w.get("both_sides"),
                    reference=w.get("reference"),
                    location={"page_index": region.page_index, "bbox": region.bbox},
                    provider=NAME,
                    confidence=0.55,
                )
            )

    return ProviderResult(
        provider=NAME,
        region=region,
        bom_rows=bom_rows,
        welds=welds,
        raw=donut_result,
    )
