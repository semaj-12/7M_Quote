# ml_service/app/providers/layoutlmv3.py
from typing import Dict, Any

def run_layoutlmv3(page_path: str, ocr: Dict[str, Any]) -> Dict[str, Any]:
    """
    TODO: replace with real inference. Return per-entity values + confidence.
    Example:
      {
        "project_name": {"value": "ACME HOSPITAL", "confidence": 0.92},
        "sheet_number": {"value": "A2.01", "confidence": 0.88},
        ...
      }
    """
    return {}
