import os
from dotenv import load_dotenv

load_dotenv()

API_BASE_URL = os.environ["API_BASE_URL"].rstrip("/")
API_WORKER_KEY = os.environ.get("OCR_WORKER_KEY", "")
WATCH_FOLDER = os.environ.get("WATCH_FOLDER", "C:/Scans/Incoming")
DEFAULT_BRANCH_CODE = os.environ.get("DEFAULT_BRANCH_CODE", "")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "10"))
SUPPORTED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".tif"}
