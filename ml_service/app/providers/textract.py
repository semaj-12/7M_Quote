# ml_service/app/providers/textract.py
from typing import Dict, Any

def run_textract(page_path: str) -> Dict[str, Any]:
    """
    TODO: replace with real Textract. For now we mimic structure.
    Return:
      {
        "words": [{"text": "A2.01", "conf": 0.98, "bbox": [x0,y0,x1,y1]}, ...],
        "tables": [ { "cells": [...], "conf": 0.9 }, ... ]
      }
    """
    return {"words": [], "tables": []}
