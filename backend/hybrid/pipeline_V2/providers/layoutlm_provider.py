from __future__ import annotations
from typing import Dict, Any, List

from ..types import Region, ProviderResult, BomRow

try:
    from backend.hybrid import layoutlm_infer, textract_infer
except ImportError:
    layoutlm_infer = None  # type: ignore[assignment]
    textract_infer = None  # type: ignore[assignment]

NAME = "layoutlm"


def parse_region(region: Region, context: Dict[str, Any] | None = None) -> ProviderResult:
    if layoutlm_infer is None:
        return ProviderResult(provider=NAME, region=region)

    words = textract_infer.extract_words(region.doc_path) if textract_infer and hasattr(textract_infer, "extract_words") else []

    tokens: List[layoutlm_infer.OCRToken] = []
    for w in words:
        text = (w.get("text") or "") if isinstance(w, dict) else ""
        bbox = w.get("bbox") if isinstance(w, dict) else None
        if not bbox:
            continue
        left, top, width, height = bbox
        tokens.append(
            layoutlm_infer.OCRToken(
                text=text,
                bbox=(
                    int(left * 1000),
                    int(top * 1000),
                    int((left + width) * 1000),
                    int((top + height) * 1000),
                ),
            )
        )

    try:
        adapter = layoutlm_infer.LayoutLMv3Adapter()
    except Exception as exc:  # checkpoint not configured
        return ProviderResult(
            provider=NAME,
            region=region,
            raw={"error": str(exc), "words": words},
        )

    page_size = None
    if isinstance(context, dict):
        page_size = context.get("page_size")

    try:
        llm_result: Dict[str, Any] = adapter.predict_from_ocr(tokens, page_size or (1000, 1000)) if tokens else {}
    except Exception as exc:
        llm_result = {"error": str(exc)}
    bom_rows: List[BomRow] = []

    return ProviderResult(
        provider=NAME,
        region=region,
        bom_rows=bom_rows,
        raw=llm_result,
    )
