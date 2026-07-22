import sys
from pathlib import Path

# Make the flat mmm_worker package importable without installing.
sys.path.insert(0, str(Path(__file__).parent.parent))
