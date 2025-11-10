import os, io, json, uvicorn, traceback
from typing import Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from PIL import Image

from hybrid.adapters.donut_adapter import predict_page as donut_predict
from hybrid.adapters.layoutlm_adapter import predict_page as layout_predict
from hybrid.openai_validator_requests import validate_with_openai_requests

OPENAI_MODEL = os.getenv("HYBRID_OPENAI_MODEL", "gpt-4.1")

app = FastAPI(title="7M Hybrid Parser", version="0.1")

def run_pipeline(image: Image.Image, tmp_path: Optional[str] = None) -> Dict[str, Any]:
    donut_raw = None
    layout_out: Dict[str, Any] = {}
    errs = []

    # Optionally write to a temp file for adapters that expect a path
    if tmp_path:
        image.save(tmp_path)

    try:
        donut_raw = donut_predict(tmp_path or image)   # donut adapter supports path; pass path if required
    except Exception as e:
        errs.append(f"donut_err: {e.__class__.__name__}: {e}")

    try:
        layout_out = layout_predict(tmp_path or image) or {}
        layout_out = {
            "weld_symbols_present": bool(layout_out.get("weld_symbols_present", False)),
            "weld_symbols_count": int(layout_out.get("weld_symbols_count", 0)),
            "dim_values_count": int(layout_out.get("dim_values_count", 0)),
            "bom_tag_count": int(layout_out.get("bom_tag_count", 0)),
            "bom_material_count": int(layout_out.get("bom_material_count", 0)),
            "bom_qty_count": int(layout_out.get("bom_qty_count", 0)),
        }
    except Exception as e:
        errs.append(f"layoutlm_err: {e.__class__.__name__}: {e}")
        layout_out = {
            "weld_symbols_present": False,
            "weld_symbols_count": 0,
            "dim_values_count": 0,
            "bom_tag_count": 0,
            "bom_material_count": 0,
            "bom_qty_count": 0,
        }

    final = validate_with_openai_requests(
        donut_raw=donut_raw or "",
        layout_json=layout_out,
        textract_json={},  # pipe a richer textract summary later
        model=OPENAI_MODEL,
    )

    return {
        "donut_raw_head": (donut_raw or "")[:200],
        "layout_pred": layout_out,
        "final": final,
        "errors": errs,
    }

@app.post("/parse")
async def parse_upload(file: UploadFile = File(...)):
    try:
        data = await file.read()
        im = Image.open(io.BytesIO(data)).convert("RGB")
        # Save to tmp for adapters that prefer path-based IO
        tmp_path = f"/tmp/{file.filename or 'upload'}.png"
        result = run_pipeline(im, tmp_path=tmp_path)
        return JSONResponse(result)
    except Exception as e:
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/healthz")
def healthz():
    return {"ok": True}

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
