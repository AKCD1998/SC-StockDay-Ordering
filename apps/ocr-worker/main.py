"""
OCR Worker — entry point.
Watches WATCH_FOLDER for new scan files, processes them, and POSTs results
to the Render API for human review.

Run:
    python main.py
"""
import sys
import time
import hashlib
import logging
from pathlib import Path

import requests
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from config import API_BASE_URL, API_WORKER_KEY, WATCH_FOLDER, DEFAULT_BRANCH_CODE, \
    POLL_INTERVAL, SUPPORTED_EXTENSIONS
from preprocess import preprocess_file
from ocr_engine import read_image, read_barcodes
from parser import parse_invoice_header, parse_line_items
from matcher import load_product_index, match_line

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

_HEADERS = {"x-worker-key": API_WORKER_KEY, "Content-Type": "application/json"}
_PROCESSED_HASHES: set[str] = set()  # avoid double-processing within one session


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def process_file(path: Path):
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        return

    fhash = file_hash(path)
    if fhash in _PROCESSED_HASHES:
        log.info("Skipping already-processed file: %s", path.name)
        return
    _PROCESSED_HASHES.add(fhash)

    log.info("Processing: %s", path.name)

    try:
        pages = preprocess_file(str(path))
    except Exception as e:
        log.error("Preprocessing failed for %s: %s", path.name, e)
        return

    all_blocks = []
    all_barcodes = []
    for pil_img in pages:
        all_blocks.extend(read_image(pil_img))
        all_barcodes.extend(read_barcodes(pil_img))

    header = parse_invoice_header(all_blocks)
    lines = parse_line_items(all_blocks)

    # Attach barcodes to lines that don't have one yet (first barcode → first unmatched line)
    barcode_queue = list(all_barcodes)
    for line in lines:
        if not line.get("parsedBarcode") and barcode_queue:
            line["parsedBarcode"] = barcode_queue.pop(0)

    # Match each line
    matched_lines = [match_line(line) for line in lines]

    # Add line index
    for i, line in enumerate(matched_lines):
        line["lineIndex"] = i

    payload = {
        "filename": path.name,
        "filePath": str(path),
        "branchCode": DEFAULT_BRANCH_CODE or None,
        "supplierName": None,
        "invoiceNumber": header.get("invoiceNumber"),
        "invoiceDate": header.get("invoiceDate"),
        "ocrEngine": "paddleocr",
        "lines": matched_lines,
    }

    try:
        resp = requests.post(
            f"{API_BASE_URL}/api/ocr/documents",
            json=payload,
            headers=_HEADERS,
            timeout=30,
        )
        resp.raise_for_status()
        doc = resp.json()
        log.info("Submitted document %s → %s (%d lines)",
                 path.name, doc.get("documentId"), len(matched_lines))
    except Exception as e:
        log.error("Failed to submit %s: %s", path.name, e)


class ScanHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        # Small delay so the scanner finishes writing the file
        time.sleep(2)
        process_file(path)

    def on_moved(self, event):
        if event.is_directory:
            return
        process_file(Path(event.dest_path))


def main():
    watch_path = Path(WATCH_FOLDER)
    if not watch_path.exists():
        log.error("WATCH_FOLDER does not exist: %s", WATCH_FOLDER)
        sys.exit(1)

    log.info("Loading product index from %s ...", API_BASE_URL)
    try:
        load_product_index()
    except Exception as e:
        log.error("Could not load product index: %s", e)
        sys.exit(1)

    log.info("Watching folder: %s", WATCH_FOLDER)

    observer = Observer()
    observer.schedule(ScanHandler(), str(watch_path), recursive=False)
    observer.start()

    try:
        while True:
            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        log.info("Shutting down.")
        observer.stop()

    observer.join()


if __name__ == "__main__":
    main()
