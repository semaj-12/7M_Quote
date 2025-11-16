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

    # TODO: call your existing Donut inference on the region/page.
    #
    # donut_result = donut_infer.run_on_region(
    #     doc_path=region.doc_path,
    #     page_index=region.page_index,
    #     bbox=region.bbox,
    # )

    donut_result: Dict[str, Any] = {}

    bom_rows: List[BomRow] = []
    welds: List[WeldSymbol] = []

    # TODO: map donut_result into BomRow / WeldSymbol

    return ProviderResult(
        provider=NAME,
        region=region,
        bom_rows=bom_rows,
        welds=welds,
        raw=donut_result,
    )
