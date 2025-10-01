PDF to Image Conversion (Windows-friendly)
==========================================

Why convert PDFs to page images?
- Many vision models (e.g., Donut) operate directly on images.
- Fixed DPI ensures consistent scale for OCR & layout models.
- 200–300 DPI keeps text readable without too-large files.

What is DPI?
- Dots Per Inch: the pixel density of the rendered page.
- At 200 DPI, an 8.5x11" page becomes roughly 1700x2200 pixels.
- At 300 DPI, the same page is ~2550x3300 pixels (sharper, heavier).

Prereqs
-------
1) Install Poppler for Windows
   - Download: https://github.com/oschwartz10612/poppler-windows/releases/
   - Extract e.g. to: C:\poppler
   - Inside, you should see: C:\poppler\Library\bin

2) Add Poppler bin to PATH
   - Press Win+R, type sysdm.cpl, Enter
   - Advanced tab → Environment Variables
   - Under "System variables", select "Path" → Edit
   - Click New → paste: C:\poppler\Library\bin
   - OK to save. Restart PowerShell/VS Code.
   - Verify: run `pdftoppm -h` in a new terminal; should print help.

3) Install Python dependencies
   - python -m pip install pdf2image pillow tqdm

How to run
----------
Example (PowerShell):
  cd C:\path\to\tools
  python convert_pdfs_to_images.py --input "C:\data\pdfs" --output "C:\data\images" --dpi 300 --format png --max-workers 4

Notes
-----
- Use PNG for lossless (best for ML); JPEG if you need smaller files.
- Start with DPI=300 for small datasets; drop to 200 for speed/space.
- Output grouped by PDF name: images/<pdf_stem>/<pdf_stem>_p0001.png
- If Poppler isn't on PATH, add: --poppler-path "C:\poppler\Library\bin"
