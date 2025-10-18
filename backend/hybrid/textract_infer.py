# hybrid/textract_infer.py
from __future__ import annotations
import os
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional

try:
    import boto3
    _HAS_BOTO3 = True
except Exception:
    _HAS_BOTO3 = False

from PIL import Image

@dataclass
class OCRToken:
    text: str
    bbox: Tuple[int, int, int, int]  # absolute pixel box (x0,y0,x1,y1)

def _textract_client():
    if not _HAS_BOTO3:
        return None
    try:
        return boto3.client("textract")
    except Exception:
        return None

def _bbox_rel_to_abs(rel_bbox: Dict, page_w: int, page_h: int) -> Tuple[int,int,int,int]:
    # Textract gives relative [0,1] bbox: Left, Top, Width, Height
    x0 = int(rel_bbox.get("Left", 0.0)   * page_w)
    y0 = int(rel_bbox.get("Top", 0.0)    * page_h)
    x1 = x0 + int(rel_bbox.get("Width", 0.0)  * page_w)
    y1 = y0 + int(rel_bbox.get("Height", 0.0) * page_h)
    return (x0, y0, x1, y1)

def textract_words_from_image(image_path: str) -> Tuple[List[OCRToken], Tuple[int,int]]:
    """
    Calls Textract DetectDocumentText on a local PNG/JPG.
    Returns (tokens, (page_w, page_h)).
    If Textract isn't available, returns ([], (w,h)) so the pipeline can still run.
    """
    # Determine pixel dimensions from the image itself (helpful to restore absolute coords)
    with Image.open(image_path) as im:
        im = im.convert("RGB")
        page_w, page_h = im.size

    client = _textract_client()
    if client is None:
        # Fallback: no OCR tokens (pipeline can still proceed using other branches)
        return [], (page_w, page_h)

    # Read bytes
    with open(image_path, "rb") as f:
        img_bytes = f.read()

    try:
        resp = client.detect_document_text(Document={"Bytes": img_bytes})
    except Exception:
        # Graceful fallback if AWS creds/permissions aren’t ready
        return [], (page_w, page_h)

    tokens: List[OCRToken] = []
    for b in resp.get("Blocks", []):
        if b.get("BlockType") == "WORD" and b.get("Text"):
            bb_rel = b.get("Geometry", {}).get("BoundingBox", {})
            bbox = _bbox_rel_to_abs(bb_rel, page_w, page_h)
            tokens.append(OCRToken(text=b["Text"], bbox=bbox))

    return tokens, (page_w, page_h)

class TextractOCRProvider:
    """
    Thin helper usable by your pipeline.
    """
    def __init__(self):
        pass

    def from_image(self, image_path: str) -> Tuple[List[OCRToken], Tuple[int,int]]:
        return textract_words_from_image(image_path)
