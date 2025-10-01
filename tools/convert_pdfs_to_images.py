#!/usr/bin/env python3
"""
convert_pdfs_to_images.py
-------------------------
Batch-convert PDFs into per-page images at a specified DPI using pdf2image.

Requirements:
  - Python 3.9+
  - pip install pdf2image pillow tqdm
  - Poppler installed and on PATH (or pass --poppler-path)

Examples:
  python convert_pdfs_to_images.py --input "C:\data\pdfs" --output "C:\data\images" --dpi 300 --format png
  python convert_pdfs_to_images.py --input ./pdfs --output ./images --dpi 200 --format jpeg --max-workers 4

Output structure:
  output_dir/
    myfile/
      myfile_p0001.png
      myfile_p0002.png
    anotherfile/
      anotherfile_p0001.png
"""
import argparse
import os
import sys
from pathlib import Path
from typing import Optional, List
from tqdm import tqdm

def _import_pdf2image():
    try:
        from pdf2image import convert_from_path
    except Exception:
        print("ERROR: pdf2image is not installed. Run: pip install pdf2image pillow tqdm", file=sys.stderr)
        raise
    return convert_from_path

def convert_pdf(
    pdf_path: Path,
    out_dir: Path,
    dpi: int = 300,
    fmt: str = "png",
    poppler_path: Optional[str] = None,
) -> List[Path]:
    convert_from_path = _import_pdf2image()
    out_dir.mkdir(parents=True, exist_ok=True)
    images = convert_from_path(
        str(pdf_path),
        dpi=dpi,
        fmt=fmt,
        poppler_path=poppler_path,
        output_folder=str(out_dir),
        paths_only=True
    )

    final_paths = []
    stem = pdf_path.stem
    for i, img_path in enumerate(images, start=1):
        p = Path(img_path)
        new_name = f"{stem}_p{i:04d}.{fmt.lower()}"
        new_path = out_dir / new_name
        p.replace(new_path)
        final_paths.append(new_path)
    return final_paths

def is_pdf(p: Path) -> bool:
    return p.suffix.lower() == ".pdf"

def main():
    ap = argparse.ArgumentParser(description="Batch convert PDFs to per-page images at a given DPI.")
    ap.add_argument("--input", "-i", required=True, help="Folder containing PDFs (recursively scanned).")
    ap.add_argument("--output", "-o", required=True, help="Folder to write images into.")
    ap.add_argument("--dpi", type=int, default=300, help="Dots Per Inch (200–300 recommended). Default: 300")
    ap.add_argument("--format", choices=["png", "jpeg", "jpg"], default="png", help="Output image format. Default: png")
    ap.add_argument("--poppler-path", default=None, help="Path to Poppler bin folder (if not on PATH).")
    ap.add_argument("--max-workers", type=int, default=0, help="Parallel workers (0=auto up to CPU cores).")
    args = ap.parse_args()

    in_dir = Path(args.input).expanduser().resolve()
    out_root = Path(args.output).expanduser().resolve()
    fmt = "jpg" if args.format == "jpeg" else args.format

    if not in_dir.exists():
        print(f"ERROR: input folder not found: {in_dir}", file=sys.stderr)
        sys.exit(1)
    out_root.mkdir(parents=True, exist_ok=True)

    pdfs = [p for p in in_dir.rglob("*.pdf")]
    if not pdfs:
        print("No PDFs found.", file=sys.stderr)
        sys.exit(1)

    def worker(pdf: Path):
        rel = pdf.relative_to(in_dir)
        out_dir = out_root / rel.parent / pdf.stem
        try:
            return convert_pdf(pdf, out_dir, dpi=args.dpi, fmt=fmt, poppler_path=args.poppler_path)
        except Exception as e:
            return f"ERROR: {pdf} -> {e}"

    results = []
    if args.max_workers != 1:
        from concurrent.futures import ProcessPoolExecutor, as_completed
        maxw = None if args.max_workers == 0 else args.max_workers
        with ProcessPoolExecutor(max_workers=maxw) as ex:
            futs = {ex.submit(worker, pdf): pdf for pdf in pdfs}
            for fut in tqdm(as_completed(futs), total=len(futs), desc="Converting PDFs"):
                results.append(fut.result())
    else:
        for pdf in tqdm(pdfs, desc="Converting PDFs"):
            results.append(worker(pdf))

    errs = [r for r in results if isinstance(r, str) and r.startswith("ERROR")]
    converted_pages = sum(len(r) for r in results if isinstance(r, list))
    print(f"\nDone. PDFs: {len(pdfs)}, pages: {converted_pages}, errors: {len(errs)}")
    if errs:
        print("\nErrors:")
        for e in errs[:10]:
            print("  ", e)
        if len(errs) > 10:
            print(f"  ... and {len(errs)-10} more")

if __name__ == "__main__":
    main()
