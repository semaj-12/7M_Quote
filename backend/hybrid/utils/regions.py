import os, uuid
from typing import List, Dict, Any
from PIL import Image

def crop_regions(image_path: str, regions: List[Dict[str, Any]], out_dir: str = "/tmp/region_crops") -> List[str]:
    """
    regions: [{ "page": 0, "bbox": [x0,y0,x1,y1] }, ...]
    For single-page PNGs we ignore 'page'.
    Returns a list of file paths to cropped images.
    """
    os.makedirs(out_dir, exist_ok=True)
    img = Image.open(image_path).convert("RGB")
    outs = []
    for r in regions:
        x0, y0, x1, y1 = [int(v) for v in (r.get("bbox") or [0,0,0,0])]
        crop = img.crop((x0, y0, x1, y1))
        path = os.path.join(out_dir, f"crop_{uuid.uuid4().hex[:8]}.png")
        crop.save(path)
        outs.append(path)
    return outs
