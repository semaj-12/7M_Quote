"""
Helper: check which Label Studio tasks are missing OCR cache files.

Usage:
  python tools/find_missing_cache.py \
    --ls-json C:\7M_ls_exports\first_ls_iteration.json \
    --ocr-cache C:\7M-ocr-cache
"""

import argparse
import json
from pathlib import Path


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--ls-json", required=True, help="Exported LS annotations JSON")
    p.add_argument("--ocr-cache", required=True, help="Folder with textract-lines.json files")
    args = p.parse_args()

    ls_json = Path(args.ls_json)
    ocr_cache = Path(args.ocr_cache)

    data = json.loads(ls_json.read_text(encoding="utf-8"))
    missing = []

    for task in data:
        img_path = task["data"]["image"]
        # Example: /data/local-files/?d=data/images/Foo/Bar_p0013.png
        stem = Path(img_path).stem  # e.g. "Bar_p0013"
        cache_file = next(ocr_cache.rglob(f"{stem}.textract-lines.json"), None)
        if not cache_file:
            missing.append(stem)

    if missing:
        print(f"{len(missing)} tasks missing OCR cache:")
        for s in missing:
            print("  ", s)
    else:
        print("All tasks have matching OCR cache files.")


if __name__ == "__main__":
    main()
