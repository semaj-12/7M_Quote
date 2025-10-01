#!/usr/bin/env python3
"""
Convert Label Studio image annotations into Donut-style JSONL,
and enrich with OCR words from AWS Textract (synchronous DetectDocumentText).

Usage (PowerShell):
python tools\ls_to_donut_jsonl_textract.py `
  --ls-json C:\7M_ls_exports\first_ls_iteration.json `
  --images-root "C:\7M-images" `
  --out-dir "C:\7M-donut" `
  --aws-region us-west-2
"""

import argparse
import io
import json
import os
import re
from typing import Dict, List, Tuple

import boto3
from botocore.exceptions import ClientError
from PIL import Image

# ---------------------------
# Helpers
# ---------------------------

def load_image_bytes_for_textract(image_path: str, max_side: int = 10000, jpeg_quality: int = 90) -> Tuple[bytes, Tuple[int, int]]:
    """Open image, convert to RGB, downscale longest side to <= max_side, return JPEG bytes and (w,h)."""
    im = Image.open(image_path)
    # handle multi-frame images just in case
    if hasattr(im, "n_frames") and im.n_frames > 1:
        im.seek(0)
    if im.mode != "RGB":
        im = im.convert("RGB")
    w, h = im.size
    m = max(w, h)
    if m > max_side:
        scale = float(max_side) / float(m)
        im = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        w, h = im.size
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
    return buf.getvalue(), (w, h)

def ls_image_relpath(ls_image_field: str) -> str:
    """
    LS local-file path looks like: /data/local-files/?d=data/images/Folder/file_p0001.png
    We want the relative part after '?d=data/images/'.
    """
    if not ls_image_field:
        return ""
    # Try to extract after '?d='
    m = re.search(r"\?d=([^\"']+)$", ls_image_field)
    if m:
        rel = m.group(1)
        # LS usually uses forward slashes; keep as-is, we'll os.path.join later
        # Also strip any leading 'data/images/' if present redundantly
        if rel.startswith("data/images/"):
            rel = rel[len("data/images/"):]
        return rel
    # Fallback: if it's a straight path under /data/images/
    if "data/images/" in ls_image_field:
        return ls_image_field.split("data/images/", 1)[1]
    return ls_image_field.lstrip("/")

def textract_words(tex_client, image_path: str) -> List[Tuple[str, List[int]]]:
    """
    Run Textract DetectDocumentText and return list of (text, [x1,y1,x2,y2]) in pixel coords.
    """
    img_bytes, (W, H) = load_image_bytes_for_textract(image_path, max_side=10000, jpeg_quality=90)
    try:
        resp = tex_client.detect_document_text(Document={"Bytes": img_bytes})
    except ClientError as e:
        raise RuntimeError(f"Textract failed on {image_path}: {e}")

    words = []
    for block in resp.get("Blocks", []):
        if block.get("BlockType") == "WORD" and "Text" in block:
            bb = block.get("Geometry", {}).get("BoundingBox", {})
            # Textract bbox is relative [0..1]
            left = float(bb.get("Left", 0.0)) * W
            top = float(bb.get("Top", 0.0)) * H
            width = float(bb.get("Width", 0.0)) * W
            height = float(bb.get("Height", 0.0)) * H
            x1 = max(0, int(round(left)))
            y1 = max(0, int(round(top)))
            x2 = min(W, int(round(left + width)))
            y2 = min(H, int(round(top + height)))
            text = block["Text"].strip()
            if text:
                words.append((text, [x1, y1, x2, y2]))
    return words

def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)

# ---------------------------
# Conversion
# ---------------------------

def to_donut_item(image_path: str,
                  words: List[Tuple[str, List[int]]],
                  labels: List[Dict]) -> Dict:
    """
    Produce a Donut JSONL sample. Donut is flexible; for MVP we include:
    - image: absolute path
    - ground_truth:
        - fields: dict of labeled regions by label name with list of boxes (pixel coords)
        - ocr_words: list of [text, x1, y1, x2, y2]
    """
    # Collect labeled boxes per class
    fields: Dict[str, List[List[int]]] = {}
    for lb in labels:
        name = lb["label"]
        x1, y1, x2, y2 = lb["box"]
        fields.setdefault(name, []).append([x1, y1, x2, y2])

    ocr_words = []
    for t, box in words:
        ocr_words.append([t, *box])

    return {
        "image": image_path,
        "ground_truth": {
            "fields": fields,
            "ocr_words": ocr_words
        }
    }

def rect_to_pixel_box(val: Dict, ow: int, oh: int) -> List[int]:
    """
    Label Studio rectangle values are in percentages (0-100).
    value = {x, y, width, height} as percent of image.
    Convert to [x1,y1,x2,y2] in integer pixels within image bounds.
    """
    x = float(val["x"]) / 100.0 * ow
    y = float(val["y"]) / 100.0 * oh
    w = float(val["width"]) / 100.0 * ow
    h = float(val["height"]) / 100.0 * oh
    x1 = max(0, int(round(x)))
    y1 = max(0, int(round(y)))
    x2 = min(ow, int(round(x + w)))
    y2 = min(oh, int(round(y + h)))
    return [x1, y1, x2, y2]

def gather_labels_from_annotation(annotation_result: List[Dict]) -> List[Dict]:
    """
    From LS 'result' array, gather rectangle labels with pixel boxes.
    Each item: {"label": <str>, "box": [x1,y1,x2,y2]}
    """
    items: List[Dict] = []
    for r in annotation_result:
        if r.get("type") != "rectanglelabels":
            continue
        ow = int(r.get("original_width", 0))
        oh = int(r.get("original_height", 0))
        rect = r.get("value", {})
        names = r.get("value", {}).get("rectanglelabels", [])
        if not names or ow <= 0 or oh <= 0:
            continue
        box = rect_to_pixel_box(rect, ow, oh)
        items.append({"label": names[0], "box": box})
    return items

# ---------------------------
# Main
# ---------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ls-json", required=True, help="Path to Label Studio export JSON")
    ap.add_argument("--images-root", required=True, help="Root folder where images are stored")
    ap.add_argument("--out-dir", required=True, help="Output directory for Donut JSONL")
    ap.add_argument("--aws-region", required=True, help="AWS region, e.g. us-west-2")
    ap.add_argument("--val-ratio", type=float, default=0.1, help="Validation split ratio (default 0.1)")
    args = ap.parse_args()

    ensure_dir(args.out_dir)
    train_path = os.path.join(args.out_dir, "train.jsonl")
    val_path = os.path.join(args.out_dir, "val.jsonl")

    with open(args.ls_json, "r", encoding="utf-8") as f:
        tasks = json.load(f)

    tex = boto3.client("textract", region_name=args.aws_region)

    samples: List[Dict] = []
    for task in tasks:
        data = task.get("data", {})
        ls_img = data.get("image", "")
        rel = ls_image_relpath(ls_img)
        if not rel:
            continue
        img_path = os.path.join(args.images_root, rel)
        if not os.path.isfile(img_path):
            # try replacing URL escapes
            img_path_try = os.path.join(args.images_root, rel.replace("%20", " "))
            if os.path.isfile(img_path_try):
                img_path = img_path_try
            else:
                print(f"[WARN] Missing image file: {img_path}")
                continue

        anns = task.get("annotations", [])
        if not anns:
            continue
        ann = anns[0]  # take first completed annotation
        labels = gather_labels_from_annotation(ann.get("result", []))

        # OCR words via Textract
        words = textract_words(tex, img_path)

        sample = to_donut_item(os.path.abspath(img_path), words, labels)
        samples.append(sample)

    # Split into train/val
    n = len(samples)
    n_val = max(1, int(round(n * args.val_ratio))) if n > 1 else 0
    val_items = samples[:n_val]
    train_items = samples[n_val:]

    with open(train_path, "w", encoding="utf-8") as f:
        for s in train_items:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    with open(val_path, "w", encoding="utf-8") as f:
        for s in val_items:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")

    print(f"Saved: {train_path} ({len(train_items)})")
    print(f"Saved: {val_path} ({len(val_items)})")

if __name__ == "__main__":
    main()
