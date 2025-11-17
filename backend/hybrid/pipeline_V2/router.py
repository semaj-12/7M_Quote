from __future__ import annotations
from typing import List, Dict, Any

from .types import DocumentInfo, PageImage, Region, BBox, RegionType
from .providers import o4_mini_provider


def classify_document(doc_path: str, *, job_context: Dict[str, Any] | None = None) -> DocumentInfo:
    """
    For now, assume 'blueprint'. Later you can plug in a doc classifier.
    You can also reuse your V1 logic if you have it.
    """
    # TODO: if you have a real classifier, call it here.
    # And load page images the same way V1 does.
    pages: List[PageImage] = []  # fill using your existing PDF→image code
    return DocumentInfo(doc_path=doc_path, doc_type="blueprint", pages=pages)


def detect_regions(
    doc_info: DocumentInfo,
    *,
    o4_first_pass_results: List[Dict[str, Any]],
) -> List[Region]:
    """
    Turn o4-mini JSON into Region objects. Fallback could be heuristic.
    """
    regions: List[Region] = []
    for page, o4_result in zip(doc_info.pages, o4_first_pass_results):
        page_regions = o4_result.get("regions", [])
        for r in page_regions:
            r_type = r.get("type")
            if r_type not in {"title_block", "bom_table", "weld_cluster", "dimensions", "notes"}:
                continue
            bbox = r.get("bbox") or [0, 0, 1, 1]
            region = Region(
                doc_path=doc_info.doc_path,
                page_index=page.page_index,
                bbox=(bbox[0], bbox[1], bbox[2], bbox[3]),
                region_type=r_type,  # type: ignore[arg-type]
                metadata=r.get("metadata", {}),
            )
            regions.append(region)
    return regions
