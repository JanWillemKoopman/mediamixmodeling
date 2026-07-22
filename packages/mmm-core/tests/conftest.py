import sys
from pathlib import Path

# Make the local `synthetic` helper importable and ensure the src package resolves
# even when the package isn't installed (e.g. a bare `pytest` from the package root).
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
