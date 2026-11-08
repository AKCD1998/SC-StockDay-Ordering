"""Compatibility entrypoint for the current registered-device/PIN harness.
R1 web-session evidence is preserved at commit 5aed5e6.
"""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name("ui-registered-access.py")),run_name="__main__")
