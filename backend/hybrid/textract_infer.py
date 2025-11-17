# backend/hybrid/textract_infer.py
import io, os, logging
from typing import List, Dict
from PIL import Image
import boto3, botocore

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
    """
    Run Textract TABLES on the image and return a list of tables, each as rows of strings.
    Shape: List[table][row][col] -> cell_text
    """
    if not os.path.exists(image_path):
        logger.warning(f"[Textract] Missing path for table analysis: {image_path}")
        return []

    payload = _to_safe_jpeg_bytes(image_path)
    tex = boto3.client("textract")

    try:
        resp = tex.analyze_document(Document={"Bytes": payload}, FeatureTypes=["TABLES"])
    except botocore.exceptions.ClientError as e:
        logger.error("[Textract] TABLES ClientError: %s", e.response.get("Error", {}))
        return []
    except Exception as e:
        logger.exception("[Textract] TABLES unexpected error: %s", e)
        return []

    blocks = resp.get("Blocks", [])
    block_map = {b.get("Id"): b for b in blocks if b.get("Id")}
    tables: List[List[List[str]]] = []

    for tbl in blocks:
        if tbl.get("BlockType") != "TABLE":
            continue

        rows: List[List[str]] = []
        for rel in tbl.get("Relationships", []) or []:
            if rel.get("Type") != "CHILD":
                continue
            for cell_id in rel.get("Ids", []) or []:
                cell = block_map.get(cell_id)
                if not cell or cell.get("BlockType") != "CELL":
                    continue

                row_idx = int(cell.get("RowIndex", 1)) - 1
                col_idx = int(cell.get("ColumnIndex", 1)) - 1

                text_parts: List[str] = []
                for c_rel in cell.get("Relationships", []) or []:
                    if c_rel.get("Type") != "CHILD":
                        continue
                    for word_id in c_rel.get("Ids", []) or []:
                        word = block_map.get(word_id)
                        if word and word.get("BlockType") == "WORD" and word.get("Text"):
                            text_parts.append(word["Text"])

                while len(rows) <= row_idx:
                    rows.append([])
                while len(rows[row_idx]) <= col_idx:
                    rows[row_idx].append("")

                rows[row_idx][col_idx] = " ".join(text_parts).strip()

        if rows:
            tables.append(rows)

    return tables
