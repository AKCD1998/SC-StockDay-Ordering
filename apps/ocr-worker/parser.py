"""
Parses raw OCR text blocks into structured invoice fields.
Rule-based: regex + heuristics. No ML here — keep it auditable.
"""
import re
from datetime import datetime


# ── Unit normalisation ────────────────────────────────────────────────────────

_UNIT_MAP = {
    r"\btab(?:let)?s?\b": "TAB",
    r"\bcap(?:sule)?s?\b": "CAP",
    r"\bbox(?:es)?\b": "BOX",
    r"\bpcs?\b": "PCS",
    r"\bbot(?:tle)?s?\b": "BTL",
    r"\bstrip?s?\b": "STRIP",
    r"\bsachet?s?\b": "SACHET",
    r"\bvial?s?\b": "VIAL",
    r"\bamp(?:oule)?s?\b": "AMP",
    r"\btube?s?\b": "TUBE",
    r"\bpack?s?\b": "PACK",
}


def normalize_unit(raw: str) -> str:
    if not raw:
        return ""
    s = raw.strip().lower()
    for pattern, normalized in _UNIT_MAP.items():
        if re.search(pattern, s, re.IGNORECASE):
            return normalized
    return raw.strip().upper()


# ── Date parsing ──────────────────────────────────────────────────────────────

_DATE_FORMATS = [
    "%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d-%m-%y",
    "%Y-%m-%d", "%m/%Y", "%m-%Y",
]


def parse_date(raw: str) -> str | None:
    if not raw:
        return None
    raw = raw.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


# ── Product name cleaning ─────────────────────────────────────────────────────

def clean_product_name(raw: str) -> str:
    if not raw:
        return ""
    # Remove leading product codes like "A001 " or "12345 "
    s = re.sub(r"^\w{1,8}\s+", "", raw.strip())
    # Collapse whitespace
    s = re.sub(r"\s+", " ", s)
    return s.strip()


# ── Invoice line parser ───────────────────────────────────────────────────────

_QTY_RE = re.compile(r"(\d+(?:\.\d+)?)\s*([A-Za-z]+)?")
_COST_RE = re.compile(r"(?:฿|THB|บาท)?\s*(\d[\d,]*(?:\.\d{1,2})?)")
_LOT_RE = re.compile(r"(?:lot|batch|ล็อต)[:\s#]*([A-Z0-9\-]+)", re.IGNORECASE)
_EXP_RE = re.compile(
    r"(?:exp(?:iry)?|expd?|หมดอายุ)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}|\d{1,2}[\/\-]\d{4})",
    re.IGNORECASE,
)
_INV_NO_RE = re.compile(r"(?:invoice|inv|เลขที่)[:\s#]*([A-Z0-9\-\/]+)", re.IGNORECASE)
_INV_DATE_RE = re.compile(
    r"(?:date|วันที่)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})", re.IGNORECASE,
)


def parse_invoice_header(text_blocks: list[dict]) -> dict:
    full_text = "\n".join(b["text"] for b in text_blocks)

    invoice_number = None
    m = _INV_NO_RE.search(full_text)
    if m:
        invoice_number = m.group(1).strip()

    invoice_date = None
    m = _INV_DATE_RE.search(full_text)
    if m:
        invoice_date = parse_date(m.group(1))

    return {"invoiceNumber": invoice_number, "invoiceDate": invoice_date}


def parse_line_items(text_blocks: list[dict]) -> list[dict]:
    """
    Very basic line-item extractor.
    Each text block that looks like a product line gets parsed.
    Real-world invoices will need supplier-specific tuning here.
    """
    items = []
    lines = [b["text"] for b in text_blocks]

    for i, line in enumerate(lines):
        line = line.strip()
        if len(line) < 3:
            continue

        # Skip obvious header/footer lines
        if re.search(r"(?:invoice|supplier|date|total|subtotal|vat|หน้า|รวม)", line, re.IGNORECASE):
            continue

        lot = None
        m = _LOT_RE.search(line)
        if m:
            lot = m.group(1)

        expiry = None
        m = _EXP_RE.search(line)
        if m:
            expiry = parse_date(m.group(1))

        cost = None
        m = _COST_RE.search(line)
        if m:
            cost = float(m.group(1).replace(",", ""))

        qty = None
        unit = None
        m = _QTY_RE.search(line)
        if m:
            qty = float(m.group(1))
            unit = normalize_unit(m.group(2) or "")

        product_name = clean_product_name(line)

        if product_name:
            items.append({
                "rawText": line,
                "parsedProductName": product_name,
                "parsedBarcode": None,  # filled by barcode scanner results
                "parsedQty": qty,
                "parsedUnit": unit,
                "parsedCost": cost,
                "parsedLot": lot,
                "parsedExpiry": expiry,
            })

    return items
