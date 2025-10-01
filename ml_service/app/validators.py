# ml_service/app/validators.py
import re
from typing import Optional

DATE_PATTERNS = [
    re.compile(r"^\d{4}-\d{2}-\d{2}$"),           # YYYY-MM-DD
    re.compile(r"^\d{1,2}/\d{1,2}/\d{2,4}$"),     # MM/DD/YYYY or M/D/YY
]
SHEET_PATTERN = re.compile(r"^[A-Z]\d+(?:\.\d+)?$")  # e.g., A2.01
SCALE_PATTERN = re.compile(r'^\s*\d+\s*/\s*\d+\s*=\s*1[\'′]')  # e.g., 1/4" = 1'-0"

def validate_date(v: Optional[str]) -> bool:
    if not v: return False
    v = v.strip()
    return any(p.match(v) for p in DATE_PATTERNS)

def validate_sheet(v: Optional[str]) -> bool:
    if not v: return False
    return bool(SHEET_PATTERN.match(v.strip()))

def validate_scale(v: Optional[str]) -> bool:
    if not v: return False
    return bool(SCALE_PATTERN.search(v.strip()))

def validate_field(field: str, value: Optional[str]) -> bool:
    if field == "date": return validate_date(value)
    if field == "sheet_number": return validate_sheet(value)
    if field == "scale": return validate_scale(value)
    # basic truthy check for others
    return bool(value and value.strip())
