"""
Matches parsed product names/barcodes against the product list fetched from the API.
Strategy (in order):
  1. Exact barcode match
  2. Fuzzy product name match (RapidFuzz)
Returns match_method and match_confidence for each line.
"""
import requests
from rapidfuzz import process, fuzz
from config import API_BASE_URL, API_WORKER_KEY

_HEADERS = {"x-worker-key": API_WORKER_KEY, "Content-Type": "application/json"}

# Simple in-process cache: {barcode -> product, name -> product}
_barcode_index: dict[str, dict] = {}
_name_index: dict[str, dict] = {}  # lowercased name -> product


def load_product_index():
    """Fetch all products from the API and build lookup indexes."""
    global _barcode_index, _name_index
    _barcode_index = {}
    _name_index = {}

    resp = requests.get(f"{API_BASE_URL}/api/products/search", params={"q": ""},
                        headers=_HEADERS, timeout=30)
    resp.raise_for_status()
    products = resp.json()

    for p in products:
        for field in ("barcode_1", "barcode_2", "barcode_3"):
            if p.get(field):
                _barcode_index[p[field].strip()] = p
        if p.get("product_name"):
            _name_index[p["product_name"].strip().lower()] = p

    print(f"[matcher] loaded {len(products)} products, "
          f"{len(_barcode_index)} barcodes indexed")


def match_line(line: dict) -> dict:
    """
    Returns the line dict augmented with:
      matchedProductCode, matchedProductName, matchMethod, matchConfidence
    """
    barcode = (line.get("parsedBarcode") or "").strip()
    name = (line.get("parsedProductName") or "").strip().lower()

    # 1. Exact barcode
    if barcode and barcode in _barcode_index:
        p = _barcode_index[barcode]
        return {**line,
                "matchedProductCode": p["product_code"],
                "matchedProductName": p["product_name"],
                "matchMethod": "exact_barcode",
                "matchConfidence": 100.0}

    # 2. Fuzzy name
    if name and _name_index:
        result = process.extractOne(
            name, list(_name_index.keys()),
            scorer=fuzz.token_sort_ratio,
            score_cutoff=50,
        )
        if result:
            matched_name, score, _ = result
            p = _name_index[matched_name]
            return {**line,
                    "matchedProductCode": p["product_code"],
                    "matchedProductName": p["product_name"],
                    "matchMethod": "fuzzy_name",
                    "matchConfidence": round(score, 2)}

    return {**line,
            "matchedProductCode": None,
            "matchedProductName": None,
            "matchMethod": "unmatched",
            "matchConfidence": 0.0}
