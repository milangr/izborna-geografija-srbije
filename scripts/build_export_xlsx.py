"""Compatibility command: delegate XLSX generation to the maintained JS builder."""

import subprocess
from pathlib import Path

if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    subprocess.run(["node", str(root / "scripts" / "build_export_xlsx.mjs")], check=True)
