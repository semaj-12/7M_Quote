from __future__ import annotations
from typing import List, Dict, Any

from ..types import (
    DocumentInfo,
    BomRow,
    WeldSymbol,
    DimensionEntity,
    SheetMetadata,
    NoteEntity,
)


def build_blueprint(
    doc_info: DocumentInfo,
    bom_rows: List[BomRow],
    welds: List[WeldSymbol],
    dimensions: List[DimensionEntity],
    metadata: SheetMetadata | None,
    notes: List[NoteEntity] | None = None,
) -> Dict[str, Any]:
    """
    Simple 1-sheet blueprint assembly. Later you can fan out to multiple sheets.
    """
    sheet_metadata = {
        "sheet_number": metadata.sheet_number if metadata else None,
        "sheet_title": metadata.sheet_title if metadata else None,
        "revision": metadata.revision if metadata else None,
        "date": metadata.date if metadata else None,
        "scale": metadata.scale if metadata else None,
        "drawn_by": metadata.drawn_by if metadata else None,
        "checked_by": metadata.checked_by if metadata else None,
    }

    bom_json = []
    for r in bom_rows:
        bom_json.append(
            {
                "mark": r.mark,
                "description": r.description,
                "profile": r.profile,
                "material": r.material,
                "length_in": r.length_in,
                "quantity": r.quantity,
                "weight_per_ft_lb": r.weight_per_ft_lb,
                "total_weight_lb": r.total_weight_lb,
                "notes": r.notes,
            }
        )

    welds_json = []
    for w in welds:
        welds_json.append(
            {
                "id": w.id,
                "type": w.type,
                "size_in": w.size_in,
                "length_in": w.length_in,
                "all_around": w.all_around,
                "both_sides": w.both_sides,
                "reference": w.reference,
                "location": w.location,
            }
        )

    dims_json = []
    for d in dimensions:
        dims_json.append(
            {
                "id": d.id,
                "value_in": d.value_in,
                "unit": d.unit,
                "tolerance_in": d.tolerance_in,
                "location": d.location,
            }
        )

    notes_json = []
    if notes:
        for n in notes:
            notes_json.append(
                {
                    "id": n.id,
                    "text": n.text,
                    "location": n.location,
                }
            )

    blueprint = {
        "version": "blueprint_v2",
        "doc_id": doc_info.doc_path,
        "source": {
            "filename": doc_info.doc_path,
        },
        "sheets": [
            {
                "sheet_id": "S1",
                "page_index": 0,
                "metadata": sheet_metadata,
                "bom_rows": bom_json,
                "weld_symbols": welds_json,
                "dimensions": dims_json,
                "notes": notes_json,
            }
        ],
    }
    return blueprint
