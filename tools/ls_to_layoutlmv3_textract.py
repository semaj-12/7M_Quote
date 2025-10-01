#!/usr/bin/env python3
"""
Convert Label Studio image annotations into a LayoutLMv3-style NER dataset,
enriched with words from AWS Textract (synchronous DetectDocumentText).

We emit two JSON files:
  - train.json
  - val.json

Each sample has:
{
  "image": "<abs path>",
  "words": ["...", "...", ...],
  "boxes": [[x1,y1,x2,y2], ...],   # one per word
  "ner_tags": ["O" | "B-<LABEL>" | "I-<LABEL>", ...]
}

Usage (PowerShell):
python tools\ls_to_layoutlmv3_textract.py `
  --ls-json C:\7M_ls_exports\first_ls_iteration.json `
  --images-root "C:\7M-images" `
  --out-dir "C:\7M-ner" `
  --aws-region us-west-2
"""

import argparse
import io
import json
import os
import re
from typing import Dict, List, Tuple, Optional

import boto3
from botocore.exceptions import ClientError
from PIL import Image

# ---------------------------
# Helpers
# ---------------------------

def load_image_bytes_for_textract(image_path: str, max_side: int = 10000, jpeg_quality: int = 90) -> Tuple[bytes, Tuple[int, int]]:
    """Open image, convert to RGB, downscale longest side to <= max_side, return JPEG bytes and (w,h)."""
    im = Image.open(image_path)
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
    """Extract relative path from LS local-files URL."""
    if not ls_image_field:
        return ""
    m = re.search(r"\?d=([^\"']+)$", ls_image_field)
    if m:
        rel = m.group(1)
        if rel.startswith("data/images/"):
            rel = rel[len("data/images/"):]
        return rel
    if "data/images/" in ls_image_field:
        return ls_image_field.split("data/images/", 1)[1]
    return ls_image_field.lstrip("/")

def textract_words(tex_client, image_path: str) -> List[Tuple[str, List[int]]]:
    """Return [(text, [x1,y1,x2,y2]), ...] in pixels."""
    img_bytes, (W, H) = load_image_bytes_for_textract(image_path, max_side=10000, jpeg_quality=90)
    try:
        resp = tex_client.detect_document_text(Document={"Bytes": img_bytes})
    except ClientError as e:
        raise RuntimeError(f"Textract failed on {image_path}: {e}")

    words = []
    for block in resp.get("Blocks", []):
        if block.get("BlockType") == "WORD" and "Text" in block:
            bb = block.get("Geometry", {}).get("BoundingBox", {})
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
# Geometry/tagging
# ---------------------------

def rect_to_pixel_box(val: Dict, ow: int, oh: int) -> List[int]:
    """Convert LS percent rectangle to pixel [x1,y1,x2,y2]."""
    x = float(val["x"]) / 100.0 * ow
    y = float(val["y"]) / 100.0 * oh
    w = float(val["width"]) / 100.0 * ow
    h = float(val["height"]) / 100.0 * oh
    x1 = max(0, int(round(x)))
    y1 = max(0, int(round(y)))
    x2 = min(ow, int(round(x + w)))
    y2 = min(oh, int(round(y + h)))
    return [x1, y1, x2, y2]

def word_center(box: List[int]) -> Tuple[float, float]:
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)

def point_in_box(px: float, py: float, box: List[int]) -> bool:
    x1, y1, x2, y2 = box
    return (px >= x1) and (px <= x2) and (py >= y1) and (py <= y2)

def gather_labels_from_annotation(annotation_result: List[Dict]) -> List[Dict]:
    """
    Collect labeled rectangles: [{"label": <str>, "box": [x1,y1,x2,y2]}]
    """
    items: List[Dict] = []
    for r in annotation_result:
        if r.get("type") != "rectanglelabels":
            continue
        ow = int(r.get("original_width", 0))
        oh = int(r.get("original_height", 0))
        if ow <= 0 or oh <= 0:
            continue
        rect = r.get("value", {})
        names = rect.get("rectanglelabels", [])
        if not names:
            continue
        box = rect_to_pixel_box(rect, ow, oh)
        items.append({"label": names[0], "box": box})
    return items

def bio_tag_words(words: List[Tuple[str, List[int]]], regions: List[Dict]) -> List[str]:
    """
    Very simple BIO tagging: if a word center lies inside any region with label L,
    tag as B-L if previous tag != L, else I-L. Otherwise O.
    """
    tags: List[str] = []
    last_label: Optional[str] = None
    for text, box in words:
        cx, cy = word_center(box)
        this_label: Optional[str] = None
        for reg in regions:
            if point_in_box(cx, cy, reg["box"]):
                this_label = reg["label"]
                break
        if this_label is None:
            tags.append("O")
            last_label = None
        else:
            if last_label == this_label:
                tags.append(f"I-{this_label}")
            else:
                tags.append(f"B-{this_label}")
                last_label = this_label
    return tags

# ---------------------------
# Main
# ---------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ls-json", required=True, help="Path to Label Studio export JSON")
    ap.add_argument("--images-root", required=True, help="Root folder where images are stored")
    ap.add_argument("--out-dir", required=True, help="Output directory for LayoutLMv3 JSON")
    ap.add_argument("--aws-region", required=True, help="AWS region, e.g. us-west-2")
    ap.add_argument("--val-ratio", type=float, default=0.1, help="Validation split ratio (default 0.1)")
    args = ap.parse_args()

    ensure_dir(args.out_dir)
    train_path = os.path.join(args.out_dir, "train.json")
    val_path = os.path.join(args.out_dir, "val.json")

    with open(args.ls_json, "r", encoding="utf-8") as f:
        tasks = json.load(f)

    tex = boto3.client("textract", region_name=args.aws_region)

    samples = []
    for task in tasks:
        data = task.get("data", {})
        ls_img = data.get("image", "")
        rel = ls_image_relpath(ls_img)
        if not rel:
            continue
        img_path = os.path.join(args.images_root, rel)
        if not os.path.isfile(img_path):
            alt = os.path.join(args.images_root, rel.replace("%20", " "))
            if os.path.isfile(alt):
                img_path = alt
            else:
                print(f"[WARN] Missing image file: {img_path}")
                continue

        anns = task.get("annotations", [])
        if not anns:
            continue
        ann = anns[0]
        regions = gather_labels_from_annotation(ann.get("result", []))

        words_boxes = textract_words(tex, img_path)      # [(text, [x1,y1,x2,y2]), ...]
        words = [w for (w, _) in words_boxes]
        boxes = [b for (_, b) in words_boxes]
        ner_tags = bio_tag_words(words_boxes, regions)

        samples.append({
            "image": os.path.abspath(img_path),
            "words": words,
            "boxes": boxes,
            "ner_tags": ner_tags
        })

    # Split
    n = len(samples)
    n_val = max(1, int(round(n * args.val_ratio))) if n > 1 else 0
    val_items = samples[:n_val]
    train_items = samples[n_val:]

    with open(train_path, "w", encoding="utf-8") as f:
        json.dump(train_items, f, ensure_ascii=False, indent=2)
    with open(val_path, "w", encoding="utf-8") as f:
        json.dump(val_items, f, ensure_ascii=False, indent=2)

    print(f"Saved: {train_path} ({len(train_items)})")
    print(f"Saved: {val_path} ({len(val_items)})")

if __name__ == "__main__":
    main()
