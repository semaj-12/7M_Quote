from __future__ import annotations
from typing import List, Dict, Any
from pathlib import Path
from io import BytesIO

from pdf2image import convert_from_path
from PIL import Image

from .types import DocumentInfo, PageImage, Region, BBox, RegionType
from .providers import o4_mini_provider


def classify_document(doc_path: str, *, job_context: Dict[str, Any] | None = None) -> DocumentInfo:
    """
    For now, assume 'blueprint'. Later you can plug in a doc classifier.
    You can also reuse your V1 logic if you have it.
    """
    job_context = job_context or {}
    src_path = Path(doc_path)
    if not src_path.exists():
        raise FileNotFoundError(f"Document not found: {doc_path}")

    # TODO: plug in a real classifier if you add more doc types
    doc_type = job_context.get("doc_type") or "blueprint"

    if src_path.suffix.lower() == ".pdf":
        pages = _load_pdf_pages(src_path, job_context=job_context)
    else:
        pages = [_load_single_image(src_path)]

    return DocumentInfo(doc_path=doc_path, doc_type=doc_type, pages=pages)


def _load_single_image(path: Path, page_index: int = 0) -> PageImage:
    """
    Load a single image file into bytes (converted to PNG) for downstream providers.
    """
    img = Image.open(path)
    with BytesIO() as buf:
        img.save(buf, format="PNG")
        data = buf.getvalue()
    return PageImage(page_index=page_index, image_path=str(path), image_bytes=data)


def _load_pdf_pages(pdf_path: Path, *, job_context: Dict[str, Any]) -> List[PageImage]:
    """
    Convert a PDF into per-page PNG bytes, mirroring the V1/SageMaker flow.
    """
    dpi = int(job_context.get("pdf_dpi", 300))
    fmt = job_context.get("pdf_image_format", "png")
    tmp_root = Path(job_context.get("work_dir", "/tmp/hybrid_v2"))
    out_dir = tmp_root / pdf_path.stem
    out_dir.mkdir(parents=True, exist_ok=True)

    pil_pages = convert_from_path(
        str(pdf_path),
        dpi=dpi,
        fmt=fmt,
        output_folder=str(out_dir),
        paths_only=False,
    )

    pages: List[PageImage] = []
    for idx, pil_img in enumerate(pil_pages):
        with BytesIO() as buf:
            pil_img.save(buf, format=fmt.upper())
            data = buf.getvalue()
        out_path = out_dir / f"{pdf_path.stem}_p{idx+1:04d}.{fmt.lower()}"
        pil_img.save(out_path)
        pages.append(
            PageImage(
                page_index=idx,
                image_path=str(out_path),
                image_bytes=data,
            )
        )

    return pages


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
