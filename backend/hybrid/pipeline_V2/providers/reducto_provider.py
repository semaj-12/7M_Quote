from __future__ import annotations
from typing import Dict, Any, List

from ..types import Region, ProviderResult, BomRow, WeldSymbol, DimensionEntity

try:
    # Adjust this import to your actual Reducto client
    from backend.hybrid.reducers import reducto_client
except ImportError:
    reducto_client = None  # type: ignore[assignment]

NAME = "reducto"


def parse_region(region: Region, context: Dict[str, Any] | None = None) -> ProviderResult:
    if reducto_client is None:
        return ProviderResult(provider=NAME, region=region)

    # TODO: call Reducto in the way your V1 pipeline does.
    #
    # red_result = reducto_client.parse_region(
    #     doc_path=region.doc_path,
    #     page_index=region.page_index,
    #     bbox=region.bbox,
    #     region_type=region.region_type,
    # )

    red_result: Dict[str, Any] = {}

    bom_rows: List[BomRow] = []
    welds: List[WeldSymbol] = []
    dims: List[DimensionEntity] = []

    # TODO: map red_result into BomRow / WeldSymbol / DimensionEntity

    return ProviderResult(
        provider=NAME,
        region=region,
        bom_rows=bom_rows,
        welds=welds,
        dimensions=dims,
        raw=red_result,
    )
