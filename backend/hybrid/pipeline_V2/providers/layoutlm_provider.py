from __future__ import annotations
from typing import Dict, Any, List

from ..types import Region, ProviderResult, BomRow

try:
    from backend.hybrid import layoutlm_infer
except ImportError:
    layoutlm_infer = None  # type: ignore[assignment]

NAME = "layoutlm"


def parse_region(region: Region, context: Dict[str, Any] | None = None) -> ProviderResult:
    if layoutlm_infer is None:
        return ProviderResult(provider=NAME, region=region)

    # TODO: call your existing LayoutLM inference
    #
    # llm_result = layoutlm_infer.run_on_region(
    #     doc_path=region.doc_path,
    #     page_index=region.page_index,
    #     bbox=region.bbox,
    # )

    llm_result: Dict[str, Any] = {}
    bom_rows: List[BomRow] = []

    # TODO: map llm_result into BomRow etc.

    return ProviderResult(
        provider=NAME,
        region=region,
        bom_rows=bom_rows,
        raw=llm_result,
    )
