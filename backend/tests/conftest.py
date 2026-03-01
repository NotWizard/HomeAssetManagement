import os
import sys
from pathlib import Path

# Ensure backend/app is importable as top-level package "app".
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("HAM_DATABASE_URL", "sqlite:///./backend/data/test.db")
os.environ.setdefault("HAM_ENABLE_SCHEDULER", "false")

test_db = ROOT / "data" / "test.db"
if test_db.exists():
    test_db.unlink()
