import os
import io
import re
import json
from typing import List, Dict, Any, Optional

import boto3
import fitz  # PyMuPDF
from fastapi import FastAPI, Body, HTTPException

app = FastAPI(title="donut/layoutlmv3 microservice (phase-1 rules)")

REGION = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-west-1"
s3 = boto3.client("s3", region_name=REGION)

# --- helpers -----------------------------------------------------------------

FRACT = re.compile(r"(?P<n>\d+)\s*/\s*(?P<d>\d+)")

def _to_float_fraction(s: str) -> float:
    """
    Convert tokens like '11 27/32', '27/32', '1-1/2', '1 1/2' to float inches.
    """
    s = s.strip().replace("–", "-").replace("—", "-")
    s = s.replace("″", '"').replace("’", "'").replace("”", '"')
    # 1-1/2 -> 1 1/2
    s = s.replace("-", " ")

    total = 0.0
    for tok in s.split():
        if "/" in tok:
            m = FRACT.fullmatch(tok)
            if m:
                total += float(m.group("n")) / float(m.group("d"))
        else:
            try:
                total += float(tok)
            except:
                pass
    return total

def parse_inches(token: str) -> Optional[float]:
    """
    Parse '8\' 11 27/32"' or '8\'' or '11 27/32"' or '1/4"' into inches.
    """
    t = token.strip().replace("″", '"').replace("’", "'").replace("”", '"')
    ft_in = re.findall(r"(\d+)\s*'\s*([\d\s/.-]+)?\"?", t)
    if ft_in:
        ft = float(ft_in[0][0])
        rest = ft_in[0][1] or "0"
        return ft * 12.0 + _to_float_fraction(rest)

    # pure inches with optional fraction
    inch = re.findall(r"([\d\s/.-]+)\s*\"", t)
    if inch:
        return _to_float_fraction(inch[0])

    # lone fraction like 1/4 (assume inches)
    if FRACT.search(t):
        return _to_float_fraction(t)

    # bare number (assume inches)
    try:
        return float(t)
    except:
        return None

GAUGE_TO_IN = {
    # common stainless sheet gauge (approx)
    # 16ga ≈ 0.0598", 14ga ≈ 0.0747", 18ga ≈ 0.0478"
    18: 0.0478,
    16: 0.0598,
    14: 0.0747,
}

DENSITY = {
    "steel": 0.283,      # lb/in^3
    "stainless": 0.289,  # lb/in^3
    "aluminum": 0.098,   # lb/in^3
}

def mat_from_text(s: str) -> Optional[str]:
    s = s.lower()
    if "stainless" in s or "ss" in s:
        return "stainless"
    if "aluminum" in s or "aluminium" in s or "6061" in s or "5052" in s:
        return "aluminum"
    if "a36" in s or "steel" in s or "a500" in s:
        return "steel"
    return None

TUBE_RECT_RE = re.compile(
    r'(?P<w>[\d\s/.-]+)"\s*[x×]\s*(?P<h>[\d\s/.-]+)"\s*[x×]\s*(?P<t>[\d\s/.-]+)"\s*(?:thk|wall)?',
    re.IGNORECASE,
)

PLATE_THK_RE = re.compile(r'(?P<t>[\d\s/.-]+)"\s*(?:thk|thick)', re.IGNORECASE)
GAUGE_SS_RE  = re.compile(r'(?P<g>\d+)\s*ga(?:uge)?\s+stainless', re.IGNORECASE)

def extract_parts_from_text(doc_text: str) -> List[Dict[str, Any]]:
    """
    Heuristic extraction:
      - Rect tube like: 1" x 3" x 1/8" THK   (+ material A500)
      - Plate like: 1/4" THK A36 PLATE
      - Stainless gauge like: 16 GAUGE STAINLESS (#4 finish)
      - Lengths: find near-by X' Y" tokens; fallback to unknown
    """
    parts: List[Dict[str, Any]] = []

    # Normalize whitespace/newlines a bit
    txt = re.sub(r"[ \t]+", " ", doc_text)
    txt = txt.replace("\r", "\n")
    lines = [l.strip() for l in txt.split("\n") if l.strip()]

    # collect candidate material lines to propagate material type
    mat_hint = None
    for i, line in enumerate(lines):
        low = line.lower()

        # Update material hint
        mhint = mat_from_text(low)
        if "a500" in low:
            mat_hint = "steel"
            grade = "A500"
        elif "a36 plate" in low:
            mat_hint = "steel"
            grade = "A36"
        elif "stainless" in low or "ss" in low:
            mat_hint = "stainless"
            grade = None
        elif mhint:
            mat_hint = mhint
            grade = None

        # Rect tube
        m = TUBE_RECT_RE.search(line)
        if m:
            w = parse_inches(m.group("w")) or 0
            h = parse_inches(m.group("h")) or 0
            t = parse_inches(m.group("t")) or 0
            if w and h and t:
                # try to find a length on same or next line
                neigh = " ".join(lines[i:i+2])
                lm = re.search(r"(\d+'\s*[\d\s/.-]*\"?)", neigh)
                length_in = parse_inches(lm.group(1)) if lm else None

                parts.append({
                    "shape": "tube_rect",
                    "material": mat_hint or "steel",
                    "grade": "A500" if "a500" in low else None,
                    "thicknessIn": round(t, 5),
                    "widthIn": round(w, 5),
                    "heightIn": round(h, 5),
                    "lengthIn": round(length_in, 5) if length_in else None,
                    "features": {},
                })
                continue

        # Plate thickness + A36 plate
        p = PLATE_THK_RE.search(line)
        if p and "plate" in low:
            thk = parse_inches(p.group("t")) or 0
            # try to find a rectangular area on same/next line: WxL inches
            neigh = " ".join(lines[i:i+2])
            wh = re.findall(r'([\d\s/.-]+)"\s*[x×]\s*([\d\s/.-]+)"', neigh, re.IGNORECASE)
            w = h = None
            if wh:
                w = parse_inches(wh[0][0])
                h = parse_inches(wh[0][1])
            parts.append({
                "shape": "plate",
                "material": "steel",
                "grade": "A36",
                "thicknessIn": round(thk,5),
                "widthIn": round(w,5) if w else None,
                "lengthIn": round(h,5) if h else None,
                "features": {},
            })
            continue

        # Stainless gauge
        g = GAUGE_SS_RE.search(line)
        if g:
            gauge = int(g.group("g"))
            thk = GAUGE_TO_IN.get(gauge, None)
            parts.append({
                "shape": "sheet",
                "material": "stainless",
                "grade": None,
                "thicknessIn": thk,
                "features": {"finish": "#4"},
            })
            continue

    return parts

# --- api ---------------------------------------------------------------------

@app.post("/analyze")
def analyze(payload: Dict[str, Any] = Body(...)):
    """
    Body: { bucket, key, max_pages?, dpi? }
    Returns: { kv, items, parts, totals }
    """
    bucket = payload.get("bucket")
    key    = payload.get("key")
    if not bucket or not key:
        raise HTTPException(status_code=400, detail="bucket and key required")

    # fetch pdf
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        data: bytes = obj["Body"].read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"S3 get_object failed: {e}")

    # extract raw text with PyMuPDF
    doc = fitz.open(stream=data, filetype="pdf")
    pages_text: List[str] = []
    for i, page in enumerate(doc):
        pages_text.append(page.get_text("text"))

    full_text = "\n".join(pages_text)

    # materials hits (for debugging / UI)
    hits = []
    for line in full_text.splitlines():
        if any(k in line.upper() for k in ["A36", "A500", "STAINLESS", "SS", "GAUGE", "THK", "PLATE", "TUBE"]):
            hits.append(line.strip())

    parts = extract_parts_from_text(full_text)

    kv = {
        "PagesSeen": str(len(pages_text)),
    }

    return {
        "kv": kv,
        "items": [],     # legacy list not used for costing anymore
        "parts": parts,  # the good stuff
        "totals": {},
        "materialsTextHits": hits[:200],  # cap for sanity
    }
