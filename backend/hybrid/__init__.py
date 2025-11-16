# hybrid/__init__.py
from .pipeline_V2 import run_blueprint_pipeline_v2
try:
    from .schemas import HYBRID_SCHEMA, SCHEMA_KEYS  # optional
except Exception:
    HYBRID_SCHEMA = None
    SCHEMA_KEYS = [
        "weld_symbols_present",
        "weld_symbols_count",
        "dim_values_count",
        "bom_tag_count",
        "bom_material_count",
        "bom_qty_count",
    ]


try:
    from .donut_infer import DonutCountsAdapter  # your Donut adapter class name
except Exception:
    DonutCountsAdapter = None

try:
    from .layoutlm_infer import LayoutLMv3Adapter, OCRToken as LLM_OCRToken
except Exception:
    LayoutLMv3Adapter = None
    LLM_OCRToken = None

# Textract OCR shim
try:
    from .textract_infer import TextractOCRProvider, OCRToken as TextractOCRToken
except Exception:
    TextractOCRProvider = None
    TextractOCRToken = None

# Reconciler & OpenAI validator
try:
    from .reconcile import reconcile_counts
except Exception:
    reconcile_counts = None

try:
    from .openai_validator import validate_counts_with_openai
except Exception:
    validate_counts_with_openai = None

__all__ = [
    "HYBRID_SCHEMA", "SCHEMA_KEYS",
    "DonutCountsAdapter",
    "LayoutLMv3Adapter", "LLM_OCRToken",
    "TextractOCRProvider", "TextractOCRToken",
    "reconcile_counts",
    "validate_counts_with_openai",
    "run_blueprint_pipeline_v2",
]
