import re
from typing import List, Dict, Any, Optional
import os
import boto3
import fitz  # PyMuPDF
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Donut Parser (Textract + Heuristics)", version="1.1.0")

REGION = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-west-1"

s3  = boto3.client("s3",       region_name=REGION)
tex = boto3.client("textract", region_name=REGION)


# ----------------------------- Models -----------------------------

class AnalyzeReq(BaseModel):
    bucket: str
    key: str
    max_pages: Optional[int] = 3
    dpi: Optional[int] = 220


class AnalyzeResp(BaseModel):
    kv: Dict[str, str]
    items: List[Dict[str, Any]]
    totals: Dict[str, Any]
    parts: List[Dict[str, Any]]  # NEW: structured parts w/ features for labor


# ----------------------------- Utils ------------------------------

def render_pages(pdf_bytes: bytes, max_pages: int = 3, dpi: int = 220) -> List[bytes]:
    """Render first N pages as PNG byte arrays."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    images: List[bytes] = []
    zoom = (dpi or 220) / 72.0
    mat = fitz.Matrix(zoom, zoom)
    for i, page in enumerate(doc):
        if i >= (max_pages or 3):
            break
        pix = page.get_pixmap(matrix=mat, alpha=False)
        images.append(pix.tobytes("png"))
    doc.close()
    return images


def build_block_map(blocks: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {b["Id"]: b for b in blocks if "Id" in b}


def text_from_children(block_map: Dict[str, Dict[str, Any]], block: Dict[str, Any]) -> str:
    out: List[str] = []
    for rel in block.get("Relationships", []):
        if rel.get("Type") == "CHILD":
            for cid in rel.get("Ids", []):
                c = block_map.get(cid)
                if not c:
                    continue
                if c.get("BlockType") in ("WORD", "LINE"):
                    t = c.get("Text")
                    if t:
                        out.append(t)
    return " ".join(out).strip()


def parse_forms_kv(blocks: List[Dict[str, Any]]) -> Dict[str, str]:
    block_map = build_block_map(blocks)
    keys = {}
    vals = {}
    for b in blocks:
        if b.get("BlockType") == "KEY_VALUE_SET":
            types = b.get("EntityTypes", [])
            if "KEY" in types:
                keys[b["Id"]] = b
            elif "VALUE" in types:
                vals[b["Id"]] = b
    kv: Dict[str, str] = {}
    for k_id, k in keys.items():
        ktxt = text_from_children(block_map, k)
        vtxt = ""
        for rel in k.get("Relationships", []):
            if rel.get("Type") == "VALUE":
                for vid in rel.get("Ids", []):
                    v = vals.get(vid)
                    if v:
                        vtxt = text_from_children(block_map, v)
                        break
        k_norm = re.sub(r"\s+", " ", ktxt).strip(" :")
        if k_norm:
            kv[k_norm] = vtxt.strip()
    return kv


def collect_lines(blocks: List[Dict[str, Any]]) -> List[str]:
    return [
        b.get("Text", "")
        for b in blocks
        if b.get("BlockType") == "LINE" and b.get("Text")
    ]


def parse_tables(blocks: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """Return list of tables; each table is list of row-cells dicts {row, col, text}."""
    block_map = build_block_map(blocks)
    tables = []
    for b in blocks:
        if b.get("BlockType") != "TABLE":
            continue
        cells = []
        for rel in b.get("Relationships", []):
            if rel.get("Type") == "CHILD":
                for cid in rel.get("Ids", []):
                    cb = block_map.get(cid)
                    if cb and cb.get("BlockType") == "CELL":
                        cells.append({
                            "row": cb.get("RowIndex", 0),
                            "col": cb.get("ColumnIndex", 0),
                            "text": text_from_children(block_map, cb),
                        })
        if not cells:
            continue
        by_row: Dict[int, List[Dict[str, Any]]] = {}
        for c in cells:
            by_row.setdefault(c["row"], []).append(c)
        rows = []
        for r in sorted(by_row.keys()):
            rows.append(sorted(by_row[r], key=lambda x: x["col"]))
        tables.append(rows)
    return tables


def guess_bom_items(tables: List[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Map common BOM headers into simple items."""
    items: List[Dict[str, Any]] = []

    def norm(s: str) -> str:
        return re.sub(r"\s+", " ", s or "").strip().upper()

    for tbl in tables:
        if not tbl:
            continue
        header = [norm(c["text"]) for c in tbl[0]]
        if not header:
            continue
        idx_item = next((i for i, h in enumerate(header) if re.search(r"\b(ITEM|NO\.?|PART)\b", h)), None)
        idx_qty  = next((i for i, h in enumerate(header) if re.search(r"\bQTY\b", h)), None)
        idx_desc = next((i for i, h in enumerate(header) if re.search(r"\b(DESC(RIPTION)?|PART\s*NO\.?|DESCRIPTION)\b", h)), None)
        idx_mat  = next((i for i, h in enumerate(header) if re.search(r"\b(MAT(ERI(AL)?)?|MATL|MATERIAL)\b", h)), None)
        idx_unit = next((i for i, h in enumerate(header) if re.search(r"\b(UNIT|UOM)\b", h)), None)

        if idx_qty is None or (idx_item is None and idx_desc is None):
            continue

        for row in tbl[1:]:
            cols = [c["text"].strip() for c in row]
            def get(i): return cols[i] if (i is not None and i < len(cols)) else ""
            qty_raw = get(idx_qty)
            qty = None
            m = re.search(r"[-+]?\d*\.?\d+", qty_raw or "")
            if m:
                try:
                    qty = int(float(m.group(0)))
                except Exception:
                    pass
            item = {
                "description": get(idx_desc) or get(idx_item) or "",
                "qty": qty,
                "unit": get(idx_unit) or None,
                "material": get(idx_mat) or None,
            }
            if any(v for v in item.values() if v not in (None, "")):
                items.append(item)

    return items


def pick_title_block(all_kv: Dict[str, str]) -> Dict[str, str]:
    """Normalize likely title block fields from KV."""
    kv_norm = {re.sub(r"\s+", " ", k).strip(" :").upper(): v for k, v in all_kv.items()}
    out: Dict[str, str] = {}
    def get_any(*keys):
        for k in keys:
            v = kv_norm.get(k)
            if v:
                return v
        return ""
    out["Revision"] = get_any("REV", "REVISION", "REV LEVEL")
    out["Scale"]    = get_any("SCALE")
    out["Drawing"]  = get_any("DWG", "DWG NO", "DRAWING", "DRAWING NO", "PART NUMBER", "PART NO")
    out["Sheet"]    = get_any("SHEET", "SHEET NO", "SHT", "SHT NO")
    out["Date"]     = get_any("DATE", "ISSUE DATE")
    return out


# --------------------- Labor Feature Extraction ---------------------

_re_part_no  = re.compile(r"\bPART\s*NO:\s*([A-Z0-9.\-]+)\b", re.I)
_re_qty      = re.compile(r"\bQTY:\s*([A-Z0-9\s/]+)", re.I)           # e.g., "2 PER UNIT" -> 2
_re_finish   = re.compile(r"\bFINISH:\s*([^\n]+)", re.I)
_re_gauge    = re.compile(r"\b(\d{1,2})\s*GAUGE\b", re.I)
_re_material = re.compile(r"\b(A36\s*PLATE|A500\s*TUBE|STAINLESS\s*STEEL|STEEL|ALUMINUM)\b", re.I)

_re_csk      = re.compile(r"\bCOUNTERSUNK\s+HOLES?\s*(?:FOR\s+([#\d\-/\"]+))?", re.I)
_re_tap      = re.compile(r"\bTAPPED\s+HOLES?\b.*?([#\d\-/\"]+)?", re.I)
_re_weld     = re.compile(r"\b(WELDED\s+JOINTS|SPOT\s+WELD)\b", re.I)
_re_radius   = re.compile(r"\bFORMED\s+RADIUS\s+BENDS?\b", re.I)

def parse_part_from_text(text: str) -> Dict[str, Any]:
    part: Dict[str, Any] = {
        "sheet": None,
        "partNo": None,
        "qty": None,
        "material": None,
        "gauge": None,
        "finish": None,
        "features": {
            "bends": {"count": 0, "hasRadiusBends": False},
            "holes": {"countersunk": [], "tapped": []},
            "weld": {"types": [], "lengthHintIn": None},
            "notes": []
        }
    }

    # Part No
    m = _re_part_no.search(text)
    if m:
        part["partNo"] = m.group(1).strip()

    # Quantity (normalize "2 PER UNIT" -> 2)
    m = _re_qty.search(text)
    if m:
        qraw = m.group(1)
        mm = re.search(r"\d+", qraw)
        if mm:
            part["qty"] = int(mm.group(0))

    # Finish, Gauge, Material
    m = _re_finish.search(text)
    if m:
        part["finish"] = m.group(1).strip()
    m = _re_gauge.search(text)
    if m:
        try:
            part["gauge"] = int(m.group(1))
        except Exception:
            pass
    m = _re_material.search(text)
    if m:
        part["material"] = m.group(1).strip().upper()

    # Features
    if _re_radius.search(text):
        part["features"]["bends"]["hasRadiusBends"] = True
        # crude count heuristic: count "R" patterns near quotes (R1/4", R.125")
        rcount = len(re.findall(r"\bR\s*[\d/.]+\"?", text, flags=re.I))
        part["features"]["bends"]["count"] = max(part["features"]["bends"]["count"], rcount if rcount else 1)

    for m in _re_csk.finditer(text):
        size = (m.group(1) or "").strip() or None
        part["features"]["holes"]["countersunk"].append({"size": size})

    for m in _re_tap.finditer(text):
        size = (m.group(1) or "").strip() or None
        part["features"]["holes"]["tapped"].append({"size": size})

    for m in _re_weld.finditer(text):
        part["features"]["weld"]["types"].append(m.group(1).upper())

    return part


def parts_from_lines(lines: List[str]) -> List[Dict[str, Any]]:
    # For phase-1, treat each page as a single part block. Concatenate lines and parse.
    text = "\n".join(lines)
    p = parse_part_from_text(text)

    # Try to lift a sheet ID as fallback partNo if missing:
    if not p.get("partNo"):
        # common sheet codes (MT-####… etc.)
        m = re.search(r"\b([A-Z]{1,3}-\d{2,4}[A-Z0-9.\-]*)\b", text)
        if m:
            p["partNo"] = m.group(1)
    # If still missing, skip creating a noisy part
    if not (p.get("partNo") or p.get("qty") or p.get("material") or p.get("finish")):
        return []
    return [p]


# ------------------------------ Routes ------------------------------

@app.get("/ping")
def ping():
    return {"ok": True}


@app.post("/analyze", response_model=AnalyzeResp)
def analyze(req: AnalyzeReq):
    # 1) Fetch PDF
    try:
        obj = s3.get_object(Bucket=req.bucket, Key=req.key)
        pdf_bytes = obj["Body"].read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"S3 get_object failed: {e}")

    # 2) Render N pages
    try:
        imgs = render_pages(pdf_bytes, max_pages=req.max_pages or 3, dpi=req.dpi or 220)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Render failed: {e}")

    merged_kv: Dict[str, str] = {}
    items_all: List[Dict[str, Any]] = []
    parts_all: List[Dict[str, Any]] = []
    pages_seen = 0

    for img in imgs:
        try:
            out = tex.analyze_document(
                Document={"Bytes": img},
                FeatureTypes=["TABLES", "FORMS"],
            )
        except Exception:
            continue

        blocks = out.get("Blocks", []) or []
        pages_seen += 1

        # Forms → KV merge
        kv = parse_forms_kv(blocks)
        for k, v in kv.items():
            if k not in merged_kv or not merged_kv[k]:
                merged_kv[k] = v

        # Tables → items (generic)
        tables = parse_tables(blocks)
        items_all.extend(guess_bom_items(tables))

        # Lines → parts with labor features
        lines = collect_lines(blocks)
        parts = parts_from_lines(lines)
        parts_all.extend(parts)

    # Title block normalization
    tb = pick_title_block(merged_kv)

    kv_out = {
        "Revision": tb.get("Revision", ""),
        "Scale": tb.get("Scale", ""),
        "Drawing": tb.get("Drawing", ""),
        "Sheet": tb.get("Sheet", ""),
        "Date": tb.get("Date", ""),
        "PagesSeen": str(pages_seen),
    }

    return AnalyzeResp(
        kv=kv_out,
        items=items_all,
        totals={},
        parts=parts_all,
    )
