"""
OCR wrapper: PaddleOCR for Thai/English mixed text + pyzbar for barcodes.
"""
import numpy as np
from PIL import Image
from paddleocr import PaddleOCR
from pyzbar.pyzbar import decode as decode_barcodes

_ocr = None


def _get_ocr() -> PaddleOCR:
    global _ocr
    if _ocr is None:
        # lang='en' covers Latin; add Thai model when PaddleOCR Thai is stable.
        # For now, use 'en' + manual Thai fallback if needed.
        _ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return _ocr


def read_image(pil_image: Image.Image) -> list[dict]:
    """
    Returns list of { text, confidence, box } dicts for each detected text block.
    """
    arr = np.array(pil_image)
    ocr = _get_ocr()
    result = ocr.ocr(arr, cls=True)

    blocks = []
    if result and result[0]:
        for line in result[0]:
            box, (text, confidence) = line
            blocks.append({"text": text, "confidence": round(confidence, 4), "box": box})

    return blocks


def read_barcodes(pil_image: Image.Image) -> list[str]:
    """Returns list of decoded barcode/QR values found in the image."""
    arr = np.array(pil_image)
    decoded = decode_barcodes(arr)
    return [d.data.decode("utf-8", errors="ignore") for d in decoded]
