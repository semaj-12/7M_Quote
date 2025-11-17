from __future__ import annotations
from typing import Dict, Any, List, Callable, Tuple

from ..types import Region, ProviderResult, BomRow, DimensionEntity, SheetMetadata

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

    try:
        textract_words = textract_infer.extract_words(doc_path) if hasattr(textract_infer, "extract_words") else []
    except Exception:
        textract_words = []

    bom_rows: List[BomRow] = []
    dims: List[DimensionEntity] = []
    metadata: SheetMetadata | None = None

    table_fn: Callable[..., Any] | None = getattr(textract_infer, "analyze_tables_from_image", None)
    if callable(table_fn):
        try:
            tables = table_fn(doc_path) or []
            bom_rows.extend(_tables_to_bom_rows(tables, region))
        except Exception:
            pass

    if region.region_type == "dimensions":
        dims.extend(_words_to_dimensions(textract_words, region))

    if region.region_type == "title_block":
        metadata = _metadata_from_words(textract_words)

    textract_result: Dict[str, Any] = {
        "words": textract_words,
    }

    return ProviderResult(
        provider=NAME,
        region=region,
        bom_rows=bom_rows,
        dimensions=dims,
        metadata=metadata,
        raw=textract_result,
    )


def _tables_to_bom_rows(tables: List[List[List[str]]], region: Region) -> List[BomRow]:
    def header_idx(row: List[str]) -> Dict[str, int | None]:
        idx = {(row[i] or "").strip().lower(): i for i in range(len(row))}

        def find(*cands: str) -> int | None:
            for key, i in idx.items():
                for c in cands:
                    if c in key:
                        return i
            return None

        return {
            "item": find("item", "tag", "part no"),
            "qty": find("qty", "quantity"),
            "material": find("material", "matl"),
            "desc": find("desc", "description"),
        }

    rows: List[BomRow] = []
    for tbl in tables:
        if not tbl:
            continue
        head = [(c or "").strip() for c in tbl[0]]
        idxs = header_idx(head)
        if idxs["item"] is None:
            continue

        for r in tbl[1:]:
            if idxs["item"] >= len(r) or not r[idxs["item"]].strip():
                continue
            qty_val = None
            try:
                if idxs["qty"] is not None and idxs["qty"] < len(r):
                    qty_val = float(r[idxs["qty"]]) if r[idxs["qty"]] else None
            except Exception:
                qty_val = None

            rows.append(
                BomRow(
                    mark=r[idxs["item"]].strip(),
                    description=(r[idxs["desc"]].strip() if idxs["desc"] is not None and idxs["desc"] < len(r) else None),
                    material=(r[idxs["material"]].strip() if idxs["material"] is not None and idxs["material"] < len(r) else None),
                    quantity=qty_val,
                    region_ref=region,
                    provider=NAME,
                    confidence=0.6,
                )
            )
    return rows


def _words_to_dimensions(words: List[Dict[str, Any]], region: Region) -> List[DimensionEntity]:
    dims: List[DimensionEntity] = []
    for w in words:
        text = (w.get("text") or "").strip() if isinstance(w, dict) else ""
        bbox: Tuple[float, float, float, float] | None = w.get("bbox") if isinstance(w, dict) else None
        val = None
        try:
            val = float(text.replace('"', ""))
        except Exception:
            val = None
        dims.append(
            DimensionEntity(
                value_in=val,
                unit="inch",
                location={"page_index": region.page_index, "bbox": bbox},
                provider=NAME,
                confidence=0.5,
            )
        )
    return dims


def _metadata_from_words(words: List[Dict[str, Any]]) -> SheetMetadata:
    first_lines = [w.get("text") for w in (words or []) if isinstance(w, dict) and w.get("text")]
    snippet = " ".join(first_lines[:12])
    return SheetMetadata(extra={"textract_preview": snippet})
