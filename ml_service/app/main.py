# ml_service/app/main.py
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pathlib import Path
import shutil
from .router import route_extract

app = FastAPI(title="7M Quote Parser")

@app.post("/parse")
async def parse_endpoint(
    file_path: str = Form(default=""),
    file: UploadFile = File(default=None),
):
    """
    Either send a local file path (file_path) OR upload a file (file).
    """
    if file_path:
        p = Path(file_path)
        if not p.exists():
            return JSONResponse({"error": f"file not found: {file_path}"}, status_code=400)
        doc = route_extract(str(p))
        return doc

    if file:
        tmp = Path("./_uploads"); tmp.mkdir(exist_ok=True)
        dest = tmp / file.filename
        with dest.open("wb") as f:
            shutil.copyfileobj(file.file, f)
        doc = route_extract(str(dest))
        return doc

    return JSONResponse({"error": "provide file_path or file"}, status_code=400)
