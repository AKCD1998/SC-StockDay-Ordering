"""
Image preprocessing pipeline.
Input: file path (PDF or image)
Output: list of preprocessed PIL Images, one per page
"""
import cv2
import numpy as np
from pathlib import Path
from PIL import Image


def _deskew(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.bitwise_not(gray)
    coords = np.column_stack(np.where(gray > 0))
    if len(coords) == 0:
        return image
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = 90 + angle
    if abs(angle) < 0.5:
        return image
    h, w = image.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def _denoise(image: np.ndarray) -> np.ndarray:
    return cv2.fastNlMeansDenoisingColored(image, None, 10, 10, 7, 21)


def _threshold(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)


def preprocess_file(file_path: str) -> list[Image.Image]:
    path = Path(file_path)
    ext = path.suffix.lower()

    if ext == ".pdf":
        from pdf2image import convert_from_path
        pil_pages = convert_from_path(str(path), dpi=300)
    else:
        pil_pages = [Image.open(str(path)).convert("RGB")]

    result = []
    for pil_img in pil_pages:
        arr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        arr = _deskew(arr)
        arr = _denoise(arr)
        arr = _threshold(arr)
        result.append(Image.fromarray(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB)))

    return result
