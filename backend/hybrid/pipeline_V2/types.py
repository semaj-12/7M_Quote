from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Literal, List, Dict, Optional, Tuple


BBox = Tuple[float, float, float, float]  # x1, y1, x2, y2 in normalized coords 0–1


@dataclass
class PageImage:
    page_index: int
    image_path: str | None = None
    image_bytes: bytes | None = None  # optional; load lazily if needed


@dataclass
class DocumentInfo:
    doc_path: str
    doc_type: Literal["blueprint", "invoice", "po", "unknown"] = "blueprint"
    pages: List[PageImage] = field(default_factory=list)


RegionType = Literal[
    "title_block",
    "bom_table",
    "weld_cluster",
    "dimensions",
    "notes",
]


@dataclass
class Region:
    doc_path: str
    page_index: int
    bbox: BBox
    region_type: RegionType
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SheetMetadata:
    sheet_number: str | None = None
    sheet_title: str | None = None
    revision: str | None = None
    date: str | None = None
    scale: str | None = None
    drawn_by: str | None = None
    checked_by: str | None = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class BomRow:
    mark: str | None = None
    description: str | None = None
    profile: str | None = None
    material: str | None = None
    length_in: float | None = None
    quantity: float | None = None
    weight_per_ft_lb: float | None = None
    total_weight_lb: float | None = None
    notes: str | None = None
    region_ref: Region | None = None
    provider: str | None = None
    confidence: float | None = None


@dataclass
class WeldSymbol:
    id: str | None = None
    type: str | None = None
    size_in: float | None = None
    length_in: float | None = None
    all_around: bool | None = None
    both_sides: bool | None = None
    reference: str | None = None
    location: Dict[str, Any] | None = None
    provider: str | None = None
    confidence: float | None = None


@dataclass
class DimensionEntity:
    id: str | None = None
    value_in: float | None = None
    unit: str | None = "inch"
    tolerance_in: float | None = None
    location: Dict[str, Any] | None = None
    provider: str | None = None
    confidence: float | None = None


@dataclass
class NoteEntity:
    id: str | None = None
    text: str | None = None
    location: Dict[str, Any] | None = None
    provider: str | None = None
    confidence: float | None = None


@dataclass
class ProviderResult:
    provider: str
    region: Region | None
    bom_rows: List[BomRow] = field(default_factory=list)
    welds: List[WeldSymbol] = field(default_factory=list)
    dimensions: List[DimensionEntity] = field(default_factory=list)
    metadata: SheetMetadata | None = None
    notes: List[NoteEntity] = field(default_factory=list)
    raw: Dict[str, Any] = field(default_factory=dict)
