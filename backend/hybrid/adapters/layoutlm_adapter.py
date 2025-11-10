# backend/hybrid/adapters/layoutlm_adapter.py
import os
import io
import re
import json
import logging
from typing import Dict, List

from PIL import Image

import torch
from transformers import AutoProcessor, AutoConfig, LayoutLMv3ForTokenClassification

# Local Textract helpers (required)
from ..textract_infer import extract_words, analyze_tables_from_image

logger = logging.getLogger("hybrid.layoutlm_adapter")
logger.setLevel(logging.INFO)

HF_DIR_ENV = "HYBRID_LAYOUTLM_DIR"

# --------- Utility: safe image shrink to JPEG bytes (for consistent OCR scale if needed) ----------
def _shrink_to_jpeg_bytes(path: str, max_side: int = 3000, quality: int = 85) -> bytes:
    im = Image.open(path).convert("RGB")
    w, h = im.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1.0:
        im = im.resize((int(w * scale), int(h * scale)))
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


# Normalize common unicode digits (e.g., sub/superscripts) into plain ASCII
def _normalize_digits(s: str) -> str:
    # Replace common unicode numerals/subscripts/superscripts with ASCII
    trans = str.maketrans({
        "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
        "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
        "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
        "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    })
    return s.translate(trans)


# Load LayoutLMv3 once per process
_MODEL = None
_PROCESSOR = None


def _load_model_if_available():
    global _MODEL, _PROCESSOR
    if _MODEL is not None and _PROCESSOR is not None:
        return True

    ckpt = os.environ.get(HF_DIR_ENV, "").strip()
    if not ckpt or not os.path.isdir(ckpt):
        logger.info("[LayoutLMv3] No checkpoint directory set; running Textract-only mode.")
        return False

    # Must have these files to consider it a proper HF checkpoint
    needed = ["config.json", "model.safetensors", "tokenizer.json"]
    missing = [f for f in needed if not os.path.isfile(os.path.join(ckpt, f))]
    if missing:
        logger.info("[LayoutLMv3] Checkpoint is missing files %s; running Textract-only mode.", missing)
        return False

    try:
        cfg = AutoConfig.from_pretrained(ckpt)
        proc = AutoProcessor.from_pretrained(ckpt)
        model = LayoutLMv3ForTokenClassification.from_pretrained(ckpt)
        model.eval()
        if torch.cuda.is_available():
            model.to("cuda")
        _MODEL = model
        _PROCESSOR = proc
        logger.info("[OK] LayoutLMv3 loaded from: %s | num_labels=%s", ckpt, getattr(cfg, "num_labels", None))
        return True
    except Exception:
        logger.exception("[LayoutLMv3] Failed to load model; running Textract-only mode.")
        return False


def _count_dimensions(words: List[Dict]) -> int:
    """
    Count plausible dimension strings only (not all numbers).
    Supports: 12, 12.5, 12", 12 mm, Ø12.5, 12 ± 1, etc.
    Extendable for architectural feet-inch later.
    """
    DIM_PATTERNS = [
        r'\b\d{1,3}(?:\.\d+)?\s?(?:mm|cm|in|")\b',   # 12, 12.5, 12", 12 mm
        r'[Ø⌀∅φ]\s?\d{1,3}(?:\.\d+)?',              # Ø12, ⌀ 12.5
        r'\b\d{1,3}\s?±\s?\d+(?:\.\d+)?',            # 12 ± 1
    ]
    dim_rx = re.compile("|".join(DIM_PATTERNS), re.IGNORECASE)
    hits = 0
    for w in words:
        t = _normalize_digits((w.get("text") or "")).strip()
        if not t:
            continue
        if dim_rx.search(t):
            hits += 1
    # Clamp to avoid runaway counts on noisy OCR
    return min(hits, 50)


def _count_welds(words: List[Dict]) -> (bool, int):
    """
    Very lightweight heuristic for weld presence/count.
    Later we can replace with an icon/text classifier.
    """
    WELD_TOKS = {"WELD", "FIL", "CJP", "PJP", "SEAM"}
    count = 0
    for w in words:
        t = _normalize_digits((w.get("text") or "")).upper()
        if not t:
            continue
        if ("WELD" in t) or (t in WELD_TOKS) or (t in {"△", "▲"}):
            count += 1
    return (count > 0), count


def _bom_from_tables(image_path: str) -> Dict[str, int]:
    """
    Use Textract TABLES to compute:
      - bom_tag_count (# of item rows)
      - bom_material_count (# of non-empty 'material' cells)
      - bom_qty_count (sum of ints in 'qty' column)
    """
    tables = analyze_tables_from_image(image_path)
    if not tables:
        return {"bom_tag_count": 0, "bom_material_count": 0, "bom_qty_count": 0}

    def header_idx(row):
        idx = { (row[i] or "").strip().lower(): i for i in range(len(row)) }
        def find(*cands):
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

    bom_tag_count = 0
    bom_material_count = 0
    bom_qty_count = 0

    for tbl in tables:
        if not tbl:
            continue
        head = [ (c or "").strip() for c in tbl[0] ]
        idxs = header_idx(head)
        # treat as BOM if it has ITEM and either QTY or MATERIAL
        if idxs["item"] is None or (idxs["qty"] is None and idxs["material"] is None):
            continue

        rows = tbl[1:]
        # tag rows
        if idxs["item"] is not None:
            bom_tag_count += sum(1 for r in rows if idxs["item"] < len(r) and r[idxs["item"]].strip())

        # material cells
        if idxs["material"] is not None:
            bom_material_count += sum(1 for r in rows if idxs["material"] < len(r) and r[idxs["material"]].strip())

        # sum integer qty
        if idxs["qty"] is not None:
            for r in rows:
                if idxs["qty"] >= len(r):
                    continue
                qtxt = _normalize_digits((r[idxs["qty"]] or "").strip())
                m = re.match(r'^\d{1,5}$', qtxt)
                if m:
                    bom_qty_count += int(m.group())

    return {
        "bom_tag_count": int(bom_tag_count),
        "bom_material_count": int(bom_material_count),
        "bom_qty_count": int(bom_qty_count),
    }


def predict_page(image_path: str) -> Dict[str, int]:
    """
    Return schema-aligned counts using Textract (and optionally LayoutLMv3, loaded if present).
    NOTE: Current implementation uses Textract words + TABLES; the LayoutLMv3 model is loaded
    (to prove availability) but not required for these aggregate counts.
    """
    # Always attempt to load model (once). If missing, we still proceed with Textract-only.
    _load_model_if_available()

    # Get OCR words
    words = extract_words(image_path)  # [{text, bbox, conf, ...}]
    # Dimensions
    dim_values_count = _count_dimensions(words)
    # Welds
    weld_present, weld_count = _count_welds(words)
    # BOM
    bom = _bom_from_tables(image_path)

    return {
        "weld_symbols_present": bool(weld_present),
        "weld_symbols_count": int(weld_count),
        "dim_values_count": int(dim_values_count),
        "bom_tag_count": bom["bom_tag_count"],
        "bom_material_count": bom["bom_material_count"],
        "bom_qty_count": bom["bom_qty_count"],
    }
