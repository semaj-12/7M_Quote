from __future__ import annotations
from typing import Dict, Any, List

from ..types import Region, ProviderResult, BomRow, DimensionEntity, SheetMetadata

# TODO: update these imports to match your actual V1 modules
try:
    from backend.hybrid import textract_infer
except ImportError:
    textract_infer = None  # type: ignore[assignment]

NAME = "textract"


def parse_region(region: Region, context: Dict[str, Any] | None = None) -> ProviderResult:
    """
    Wrap your existing Textract logic.
    You likely have a function that can run Textract and then extract tables for a bbox.
    """
    if textract_infer is None:
        return ProviderResult(provider=NAME, region=region)

    doc_path = region.doc_path

    # TODO: Replace the call below with your actual Textract helper.
    # Example pattern only:
    #
    # textract_result = textract_infer.extract_region_table(
    #     doc_path=doc_path,
    #     page_index=region.page_index,
    #     bbox=region.bbox,
    # )

    textract_result: Dict[str, Any] = {}  # placeholder

    bom_rows: List[BomRow] = []
    dims: List[DimensionEntity] = []
    metadata: SheetMetadata | None = None

    # TODO: map textract_result into BomRow / DimensionEntity / SheetMetadata

    return ProviderResult(
        provider=NAME,
        region=region,
        bom_rows=bom_rows,
        dimensions=dims,
        metadata=metadata,
        raw=textract_result,
    )
