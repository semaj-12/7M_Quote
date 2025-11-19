from __future__ import annotations
from typing import Dict, Any, List

from .router import classify_document, detect_regions
from .types import DocumentInfo, Region
from .providers import (
    o4_mini_provider,
    textract_provider,
    donut_provider,
    layoutlm_provider,
    reducto_provider,
)
from .adjudicators import (
    bom_adjudicator,
    welds_adjudicator,
    dimensions_adjudicator,
    metadata_adjudicator,
)
from .normalizers import blueprint_v2 as blueprint_normalizer


def run_blueprint_pipeline_v2(doc_path: str, *, job_context: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """
    Main entrypoint for V2 blueprint parsing.
    """
    job_context = job_context or {}

    # 1. classify + load pages
    doc_info: DocumentInfo = classify_document(doc_path, job_context=job_context)

    if doc_info.doc_type != "blueprint":
        raise ValueError(f"Unsupported doc_type for V2 pipeline: {doc_info.doc_type}")

    # 2. o4-mini first pass for each page
    o4_page_results: List[Dict[str, Any]] = []
    for page in doc_info.pages:
        if page.image_bytes is None:
            # TODO: load bytes from image_path if needed
            raise RuntimeError("Page.image_bytes not set; implement your loader here")

        o4_result = o4_mini_provider.first_pass_page(page.image_bytes)
        o4_page_results.append(o4_result)

    # 3. build regions from o4-mini
    regions: List[Region] = detect_regions(doc_info, o4_first_pass_results=o4_page_results)

    provider_results = {
        "bom": [],
        "welds": [],
        "dimensions": [],
        "metadata": [],
    }

    # 4. fan-out providers per region
    for region in regions:
        page_o4 = o4_page_results[region.page_index]

        if region.region_type == "bom_table":
            provider_results["bom"].extend([
                o4_mini_provider.to_bom_result(region, page_o4),
                reducto_provider.parse_region(region, context=job_context),
                textract_provider.parse_region(region, context=job_context),
                donut_provider.parse_region(region, context=job_context),
                layoutlm_provider.parse_region(region, context=job_context),
            ])
        elif region.region_type == "weld_cluster":
            provider_results["welds"].extend([
                o4_mini_provider.to_welds_result(region, page_o4),
                reducto_provider.parse_region(region, context=job_context),
                donut_provider.parse_region(region, context=job_context),
            ])
        elif region.region_type == "dimensions":
            provider_results["dimensions"].extend([
                o4_mini_provider.to_dimensions_result(region, page_o4),
                reducto_provider.parse_region(region, context=job_context),
                textract_provider.parse_region(region, context=job_context),
            ])
        elif region.region_type == "title_block":
            provider_results["metadata"].append(
                o4_mini_provider.to_metadata_result(region, page_o4)
            )
            provider_results["metadata"].append(
                textract_provider.parse_region(region, context=job_context)
            )

    # 5. adjudicate entities
    bom_rows = bom_adjudicator.adjudicate(provider_results["bom"])
    welds = welds_adjudicator.adjudicate(provider_results["welds"])
    dimensions = dimensions_adjudicator.adjudicate(provider_results["dimensions"])
    metadata = metadata_adjudicator.adjudicate(provider_results["metadata"])
    notes = []       # optional

    # 6. normalize
    blueprint_obj = blueprint_normalizer.build_blueprint(
        doc_info=doc_info,
        bom_rows=bom_rows,
        welds=welds,
        dimensions=dimensions,
        metadata=metadata,
        notes=notes,
    )

    return blueprint_obj
