# ml_service/app/providers/donut.py
from typing import Dict, Any

def run_donut(page_path: str) -> Dict[str, Any]:
    """
    TODO: replace with Donut inference.
    Should return page JSON like:
      {
        "title_block": {...},
        "bom_headers": ["tag","material","qty"],
        "bom": [],
        "dimensions": [{"text":"12'-6\"", "bbox":[...]}],
        "weld_symbols": [{"bbox":[...]}]
      }
    """
    return {}
