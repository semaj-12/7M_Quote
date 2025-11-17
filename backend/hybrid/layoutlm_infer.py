# hybrid/layoutlm_infer.py
import logging
import os
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import torch
from PIL import Image
from transformers import LayoutLMv3ForTokenClassification, LayoutLMv3Processor

try:  # Local import is optional for unit tests that stub Textract heuristics.
    from .textract_infer import extract_words
except Exception:  # pragma: no cover - defensive; tests stub the helper.
    extract_words = None

logger = logging.getLogger("hybrid.layoutlm")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Env var so this is portable across machines
DEFAULT_LLMV3_DIR = os.environ.get(
    "HYBRID_LLMV3_DIR",
    "/home/sagemaker-user/7m/outputs/layoutlmv3"  # <-- fallback; okay on your box
)

# ---- Your 6-field schema (same as reconcile expects)
SchemaKeys = [
    "weld_symbols_present",
    "weld_symbols_count",
    "dim_values_count",
    "bom_tag_count",
    "bom_material_count",
    "bom_qty_count",
]

# Tags your model learned (adjust if your label set differs)
# We will count primarily by the number of B- tags to avoid double-counting I- spans.
WELD_TAGS_B = {"B-WELD_SYMBOL"}
WELD_TAGS_I = {"I-WELD_SYMBOL"}
DIM_TAGS_B  = {"B-DIM_VALUE"}
DIM_TAGS_I  = {"I-DIM_VALUE"}
BOM_TAG_B   = {"B-BOM_HEADER_TAG"}
BOM_TAG_I   = {"I-BOM_HEADER_TAG"}
BOM_MAT_B   = {"B-BOM_HEADER_MATERIAL"}
BOM_MAT_I   = {"I-BOM_HEADER_MATERIAL"}
BOM_QTY_B   = {"B-BOM_HEADER_QTY"}
BOM_QTY_I   = {"I-BOM_HEADER_QTY"}

# Optional: if you used different names, override here
LABEL_ALIASES = {
    # "B-WELD": "B-WELD_SYMBOL",
}

@dataclass
class OCRToken:
    text: str
    bbox: Tuple[int, int, int, int]  # absolute pixel box: (x0, y0, x1, y1)


def _normalize_box(bbox: Tuple[int, int, int, int], page_w: int, page_h: int) -> List[int]:
    """
    LayoutLMv3 expects 0..1000 normalized coords.
    """
    x0, y0, x1, y1 = bbox
    def clamp(v, lo, hi): return max(lo, min(hi, v))
    x0 = int(1000 * x0 / max(1, page_w))
    y0 = int(1000 * y0 / max(1, page_h))
    x1 = int(1000 * x1 / max(1, page_w))
    y1 = int(1000 * y1 / max(1, page_h))
    return [clamp(x0, 0, 1000), clamp(y0, 0, 1000), clamp(x1, 0, 1000), clamp(y1, 0, 1000)]


class LayoutLMv3Adapter:
    """
    Thin inference wrapper that:
      1) Loads your token-classification checkpoint
      2) Accepts OCR tokens + page size
      3) Runs labeling
      4) Maps labels -> your 6-field counts
    """
    def __init__(self, checkpoint_dir: Optional[str] = None, device: Optional[str] = None):
        self.checkpoint_dir = checkpoint_dir or DEFAULT_LLMV3_DIR
        if not os.path.isdir(self.checkpoint_dir):
            raise FileNotFoundError(f"LayoutLMv3 checkpoint not found: {self.checkpoint_dir}")

        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.processor = LayoutLMv3Processor.from_pretrained(self.checkpoint_dir)
        self.model = LayoutLMv3ForTokenClassification.from_pretrained(self.checkpoint_dir)
        self.model.to(self.device)
        self.model.eval()

        # id2label from config drives mapping
        self.id2label = self.model.config.id2label
        # Apply any aliases for robustness
        self.id2label = {k: LABEL_ALIASES.get(v, v) for k, v in self.id2label.items()}

    def predict_from_ocr(
        self,
        tokens: List[OCRToken],
        page_size: Tuple[int, int],
        max_tokens: int = 512,
        conf_min: float = 0.50
    ) -> Dict[str, int | bool]:
        """
        tokens: list of OCRToken (text + absolute pixel bbox)
        page_size: (W,H) in pixels
        Returns a partial or full dict; missing fields omitted if model uncertain.
        """
        if not tokens:
            return {}

        # Prepare model inputs
        words = [t.text for t in tokens][:max_tokens]
        boxes = [_normalize_box(t.bbox, page_size[0], page_size[1]) for t in tokens][:max_tokens]

        enc = self.processor(
            text=words,
            boxes=boxes,
            word_labels=None,     # inference
            truncation=True,
            padding="max_length",
            return_tensors="pt"
        )
        enc = {k: v.to(self.device) for k, v in enc.items()}

        with torch.no_grad():
            out = self.model(**enc)
            logits = out.logits  # [1, seq, num_labels]
            probs = torch.softmax(logits, dim=-1)
            conf, pred = torch.max(probs, dim=-1)   # [1, seq], [1, seq]

        pred = pred[0].tolist()
        conf = conf[0].tolist()

        # Map token labels -> strings (skip PAD area)
        # Note: processor pads to model max length; we only trust up to len(words)
        labels = [self.id2label[i] for i in pred[:len(words)]]
        token_confs = conf[:len(words)]

        # Core: count spans by B- tags when confidence >= conf_min
        def count_spans(b_set, i_set) -> int:
            span_count = 0
            in_span = False
            for lab, p in zip(labels, token_confs):
                if lab in b_set and p >= conf_min:
                    span_count += 1
                    in_span = True
                elif lab in i_set and p >= conf_min and in_span:
                    # continue same span
                    pass
                else:
                    in_span = False
            return span_count

        out_dict: Dict[str, int | bool] = {}

        weld_cnt = count_spans(WELD_TAGS_B, WELD_TAGS_I)
        dim_cnt  = count_spans(DIM_TAGS_B,  DIM_TAGS_I)
        bomtag   = count_spans(BOM_TAG_B,   BOM_TAG_I)
        bommat   = count_spans(BOM_MAT_B,   BOM_MAT_I)
        bomqty   = count_spans(BOM_QTY_B,   BOM_QTY_I)

        # Only set keys that look sane (>=0). Reconciler will fill defaults.
        # You can add tiny heuristics here if needed (e.g., clamp absurd values)
        out_dict["weld_symbols_count"] = int(weld_cnt)
        out_dict["weld_symbols_present"] = bool(weld_cnt > 0)
        out_dict["dim_values_count"] = int(dim_cnt)
        out_dict["bom_tag_count"] = int(bomtag)
        out_dict["bom_material_count"] = int(bommat)
        out_dict["bom_qty_count"] = int(bomqty)

        return out_dict

    # Optional convenience if you have Textract JSON handy
    def predict_from_textract(self, textract_page: Dict) -> Dict[str, int | bool]:
        """
        Accepts a single-page Textract JSON obj (BLOCKS with WORD & PAGE sizes).
        Extract words + boxes and call predict_from_ocr.
        """
        blocks = textract_page.get("Blocks", [])
        page_w = page_h = None
        words: List[OCRToken] = []

        for b in blocks:
            if b.get("BlockType") == "PAGE":
                bb = b.get("Geometry", {}).get("BoundingBox", {})
                # PAGE block doesn't carry pixel size; caller should pass known size or we fallback to 1000x1000
                # If you stored it elsewhere, wire it in.
                page_w = page_w or 1000
                page_h = page_h or 1000
            if b.get("BlockType") == "WORD":
                text = b.get("Text") or ""
                g = b.get("Geometry", {})
                bb = g.get("BoundingBox", {})
                # Textract bounding boxes are relative [0,1]
                x0 = int((bb.get("Left", 0.0)) * (page_w or 1000))
                y0 = int((bb.get("Top", 0.0)) * (page_h or 1000))
                x1 = x0 + int((bb.get("Width", 0.0)) * (page_w or 1000))
                y1 = y0 + int((bb.get("Height", 0.0)) * (page_h or 1000))
                words.append(OCRToken(text=text, bbox=(x0, y0, x1, y1)))

        return self.predict_from_ocr(words, (page_w or 1000, page_h or 1000))


_LAYOUTLM_SINGLETON: Optional[LayoutLMv3Adapter] = None
_LAYOUTLM_LOAD_FAILED = False


def _empty_counts() -> Dict[str, int | bool]:
    return {
        "weld_symbols_present": False,
        "weld_symbols_count": 0,
        "dim_values_count": 0,
        "bom_tag_count": 0,
        "bom_material_count": 0,
        "bom_qty_count": 0,
    }


def _ensure_adapter() -> Optional[LayoutLMv3Adapter]:
    global _LAYOUTLM_SINGLETON, _LAYOUTLM_LOAD_FAILED
    if _LAYOUTLM_SINGLETON is not None:
        return _LAYOUTLM_SINGLETON
    if _LAYOUTLM_LOAD_FAILED:
        return None
    try:
        _LAYOUTLM_SINGLETON = LayoutLMv3Adapter()
    except Exception as exc:  # pragma: no cover - depends on model availability
        _LAYOUTLM_LOAD_FAILED = True
        logger.warning("LayoutLMv3 unavailable (%s); returning conservative defaults.", exc)
        return None
    return _LAYOUTLM_SINGLETON


def _textract_words_to_tokens(words: List[Dict], page_size: Tuple[int, int]) -> List[OCRToken]:
    tokens: List[OCRToken] = []
    width, height = page_size
    for w in words:
        text = (w or {}).get("text") or (w or {}).get("Text") or ""
        bbox = (w or {}).get("bbox")
        if not text or bbox is None:
            continue
        if len(bbox) == 4:
            x0, y0, x1, y1 = bbox
        else:
            continue
        # Textract words return (left, top, width, height) in relative coords.
        if 0.0 <= x0 <= 1.0 and 0.0 <= y0 <= 1.0 and 0.0 <= x1 <= 1.5 and 0.0 <= y1 <= 1.5:
            left, top, w_rel, h_rel = x0, y0, x1, y1
            x0 = int(left * width)
            y0 = int(top * height)
            x1 = x0 + int(w_rel * width)
            y1 = y0 + int(h_rel * height)
        tokens.append(OCRToken(text=text, bbox=(int(x0), int(y0), int(x1), int(y1))))
    return tokens


def _coerce_counts(raw: Dict[str, int | bool]) -> Dict[str, int | bool]:
    counts = _empty_counts()
    for key in counts:
        if key not in raw:
            continue
        if key == "weld_symbols_present":
            counts[key] = bool(raw.get(key))
        else:
            try:
                counts[key] = max(0, int(raw.get(key, 0)))
            except Exception:
                counts[key] = 0
    return counts


def predict_counts_with_layoutlm(image_path: str) -> Dict[str, int | bool]:
    """Run LayoutLMv3 on Textract tokens if the checkpoint is available.

    When the fine-tuned checkpoint is absent (common in CI), we return
    conservative defaults instead of raising so the hybrid pipeline continues
    to function for smoke tests.
    """

    adapter = _ensure_adapter()
    if adapter is None:
        return _empty_counts()

    try:
        with Image.open(image_path) as im:
            page_size = im.size
    except Exception:
        page_size = (1000, 1000)

    textract_words: List[Dict] = []
    if extract_words is not None:
        try:
            textract_words = extract_words(image_path)
        except Exception:  # pragma: no cover - network dependent
            logger.warning("Textract words unavailable; LayoutLM defaults to empty tokens.")
            textract_words = []

    tokens = _textract_words_to_tokens(textract_words, page_size) if textract_words else []
    if not tokens:
        return _empty_counts()

    try:
        preds = adapter.predict_from_ocr(tokens, page_size)
    except Exception as exc:  # pragma: no cover - model/runtime dependent
        logger.warning("LayoutLM inference failed (%s); returning defaults.", exc)
        return _empty_counts()

    return _coerce_counts(preds)
