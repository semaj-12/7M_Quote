# backend/hybrid/textract_infer.py
import io
import logging
import os
import re
from typing import Dict, List, Optional

import boto3
import botocore
from PIL import Image

logger = logging.getLogger("hybrid.textract")
logger.setLevel(logging.INFO)

def _to_safe_jpeg_bytes(path: str, max_side: int = 3000, quality: int = 85) -> bytes:
    im = Image.open(path).convert("RGB")
    w, h = im.size
    # shrink if huge (Textract + large PNGs can silently underperform)
    scale = min(1.0, max_side / max(w, h))
    if scale < 1.0:
        im = im.resize((int(w*scale), int(h*scale)))
        logger.info(f"[Textract] Downscaled {path} from {w}x{h} -> {im.size[0]}x{im.size[1]}")
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()

def extract_words(image_path: str) -> List[Dict]:
    """
    Returns a list of {'text': str, 'bbox': (x0,y0,x1,y1)} using AWS Textract.
    We resize + JPEG-reencode first to avoid PNG monster images that cause 0-word results.
    """
    # quick guard
    if not os.path.exists(image_path):
        logger.warning(f"[Textract] Missing path: {image_path}")
        return []

    payload = _to_safe_jpeg_bytes(image_path)

    tex = boto3.client("textract")
    try:
        resp = tex.detect_document_text(Document={"Bytes": payload})
        blocks = resp.get("Blocks", [])
        words = []
        for b in blocks:
            if b.get("BlockType") == "WORD" and "Text" in b:
                bb = b.get("Geometry", {}).get("BoundingBox", {})
                # normalized bbox (0..1). Keep it; adapters can map later.
                words.append({
                    "text": b["Text"],
                    "bbox": (bb.get("Left",0.0), bb.get("Top",0.0),
                             bb.get("Width",0.0), bb.get("Height",0.0))
                })
        logger.info(f"[Textract] {len(words)} words from {os.path.basename(image_path)} (blocks={len(blocks)})")
        if not words:
            logger.info(f"[Textract] No words found; try different max_side or check IAM/region.")
        return words
    except botocore.exceptions.ClientError as e:
        err = e.response.get("Error", {})
        logger.error(f"[Textract] ClientError: {err}")
        return []
    except Exception as e:
        logger.exception(f"[Textract] Unexpected error: {e}")
        return []


def analyze_tables_from_image(image_path: str) -> List[List[List[str]]]:
    """Return Textract tables as a list of rows/columns (strings)."""

    if not os.path.exists(image_path):
        logger.warning(f"[Textract] Missing path for tables: {image_path}")
        return []

    payload = _to_safe_jpeg_bytes(image_path)
    tex = boto3.client("textract")

    try:
        resp = tex.analyze_document(
            Document={"Bytes": payload},
            FeatureTypes=["TABLES"],
        )
    except botocore.exceptions.BotoCoreError as e:
        logger.error(f"[Textract] BotoCoreError during table analysis: {e}")
        return []
    except botocore.exceptions.ClientError as e:
        err = e.response.get("Error", {})
        logger.error(f"[Textract] ClientError during table analysis: {err}")
        return []
    except Exception as e:
        logger.exception(f"[Textract] Unexpected table error: {e}")
        return []

    blocks = resp.get("Blocks", [])
    if not blocks:
        return []

    block_map = {b.get("Id"): b for b in blocks if b.get("Id")}
    tables: List[List[List[str]]] = []

    for block in blocks:
        if block.get("BlockType") != "TABLE":
            continue

        cells: List[tuple[int, int, str]] = []
        for rel in block.get("Relationships", []):
            if rel.get("Type") != "CHILD":
                continue
            for cid in rel.get("Ids", []):
                cell = block_map.get(cid)
                if not cell or cell.get("BlockType") != "CELL":
                    continue
                row = int(cell.get("RowIndex", 1))
                col = int(cell.get("ColumnIndex", 1))
                text_parts: List[str] = []
                for cell_rel in cell.get("Relationships", []):
                    if cell_rel.get("Type") != "CHILD":
                        continue
                    for wid in cell_rel.get("Ids", []):
                        word = block_map.get(wid)
                        if not word:
                            continue
                        if word.get("BlockType") == "WORD":
                            text_parts.append(word.get("Text", ""))
                        elif word.get("BlockType") == "SELECTION_ELEMENT":
                            if word.get("SelectionStatus") == "SELECTED":
                                text_parts.append("☑")
                text = " ".join(part for part in text_parts if part).strip()
                cells.append((row, col, text))

        if not cells:
            tables.append([])
            continue

        max_row = max(r for r, _, _ in cells)
        max_col = max(c for _, c, _ in cells)
        table = [["" for _ in range(max_col)] for _ in range(max_row)]
        for row, col, text in cells:
            if 1 <= row <= max_row and 1 <= col <= max_col:
                table[row - 1][col - 1] = text
        tables.append(table)

    return tables


def _normalize_digits(s: str) -> str:
    trans = str.maketrans({
        "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
        "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
        "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
        "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    })
    return s.translate(trans)


def _count_dimensions(words: List[Dict]) -> int:
    dim_patterns = [
        r"\b\d{1,3}(?:\.\d+)?\s?(?:mm|cm|in|\")\b",
        r"[Ø⌀∅φ]\s?\d{1,3}(?:\.\d+)?",
        r"\b\d{1,3}\s?±\s?\d+(?:\.\d+)?",
    ]
    dim_rx = re.compile("|".join(dim_patterns), re.IGNORECASE)
    hits = 0
    for w in words:
        text = _normalize_digits((w.get("text") or "")).strip()
        if text and dim_rx.search(text):
            hits += 1
    return min(hits, 50)


def _count_welds(words: List[Dict]) -> tuple[bool, int]:
    weld_tokens = {"WELD", "FIL", "CJP", "PJP", "SEAM"}
    count = 0
    for w in words:
        text = _normalize_digits((w.get("text") or "")).upper()
        if not text:
            continue
        if ("WELD" in text) or (text in weld_tokens) or (text in {"△", "▲"}):
            count += 1
    return (count > 0), count


def _bom_from_tables(image_path: str) -> Dict[str, int]:
    tables = analyze_tables_from_image(image_path)
    if not tables:
        return {"bom_tag_count": 0, "bom_material_count": 0, "bom_qty_count": 0}

    def header_idx(row: List[str]) -> Dict[str, Optional[int]]:
        idx = {(row[i] or "").strip().lower(): i for i in range(len(row))}

        def find(*cands: str) -> Optional[int]:
            for key, pos in idx.items():
                for cand in cands:
                    if cand in key:
                        return pos
            return None

        return {
            "item": find("item", "tag", "part no"),
            "qty": find("qty", "quantity"),
            "material": find("material", "matl"),
        }

    bom_tag_count = 0
    bom_material_count = 0
    bom_qty_count = 0

    for tbl in tables:
        if not tbl:
            continue
        head = [(c or "").strip() for c in tbl[0]] if tbl else []
        idxs = header_idx(head)
        if idxs["item"] is None or (idxs["qty"] is None and idxs["material"] is None):
            continue

        rows = tbl[1:]
        if idxs["item"] is not None:
            bom_tag_count += sum(1 for r in rows if idxs["item"] < len(r) and r[idxs["item"]].strip())
        if idxs["material"] is not None:
            bom_material_count += sum(1 for r in rows if idxs["material"] < len(r) and r[idxs["material"]].strip())
        if idxs["qty"] is not None:
            for r in rows:
                if idxs["qty"] >= len(r):
                    continue
                text = _normalize_digits((r[idxs["qty"]] or "").strip())
                match = re.match(r"^\d{1,5}$", text)
                if match:
                    bom_qty_count += int(match.group())

    return {
        "bom_tag_count": int(bom_tag_count),
        "bom_material_count": int(bom_material_count),
        "bom_qty_count": int(bom_qty_count),
    }


def predict_counts_with_textract(image_path: str) -> Dict[str, int | bool]:
    """Lightweight Textract-only baseline used in the hybrid pipeline."""

    words = extract_words(image_path)
    weld_present, weld_count = _count_welds(words)
    dim_count = _count_dimensions(words)
    bom_counts = _bom_from_tables(image_path)

    return {
        "weld_symbols_present": bool(weld_present),
        "weld_symbols_count": int(max(0, weld_count)),
        "dim_values_count": int(max(0, dim_count)),
        "bom_tag_count": int(max(0, bom_counts.get("bom_tag_count", 0))),
        "bom_material_count": int(max(0, bom_counts.get("bom_material_count", 0))),
        "bom_qty_count": int(max(0, bom_counts.get("bom_qty_count", 0))),
    }
