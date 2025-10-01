from fastapi import FastAPI, Body
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from transformers import DonutProcessor, VisionEncoderDecoderModel
import torch

app = FastAPI()

# Load Donut (replace with your finetuned ckpt when ready)
DONUT_CKPT = "naver-clova-ix/donut-base"
processor = DonutProcessor.from_pretrained(DONUT_CKPT)
model = VisionEncoderDecoderModel.from_pretrained(DONUT_CKPT)
model.eval()

class TextractPage(BaseModel):
  kv: Optional[Dict[str, str]] = None
  tables: Optional[List[List[List[str]]]] = None

class ParseRequest(BaseModel):
  textract: Dict[str, Any]

@app.post("/parse")
def parse(req: ParseRequest):
  """
  Minimal stub:
  - Use Textract KV/TABLES to prefill fields
  - Optionally run Donut on page images (add image handling later)
  """
  pages = req.textract.get("pages", [])
  title_block = {}
  bom = []

  # Heuristic seed from KV/tables
  for p in pages:
    kv = p.get("kv") or {}
    # Simple title-block keys (normalize your keys better in production)
    for k, v in kv.items():
      kl = k.lower()
      if "project" in kl and "name" in kl:
        title_block["project_name"] = v
      if "sheet" in kl and "no" in kl:
        title_block["sheet_number"] = v
      if "rev" in kl:
        title_block["revision"] = v
      if "date" in kl and "issue" not in kl:
        title_block["date"] = v

    for table in p.get("tables") or []:
      # naive: first row header, rest rows as items
      if not table or len(table) < 2: 
        continue
      headers = [h.strip().lower() for h in table[0]]
      for row in table[1:]:
        item = dict(zip(headers, row))
        bom.append({
          "tag": item.get("tag") or item.get("item") or None,
          "material": item.get("material") or None,
          "qty": safe_int(item.get("qty") or item.get("quantity")),
          "dimensions": {
            "length": item.get("length") or item.get("len") or "",
            "width": item.get("width") or "",
            "thickness": item.get("thickness") or item.get("gauge") or "",
          }
        })

  return {"title_block": title_block, "bom": bom, "warnings": []}

def safe_int(x):
  try:
    return int(str(x).split()[0].replace(",", ""))
  except:
    return None
