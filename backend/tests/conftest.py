import os
import sys
from pathlib import Path

# Ensure backend/app is importable as top-level package "app".
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

test_db = ROOT / "data" / "test.db"
os.environ.setdefault("HBS_DATABASE_URL", f"sqlite:///{test_db}")
os.environ.setdefault("HBS_ENABLE_SCHEDULER", "false")
os.environ.setdefault("HBS_ENABLE_BOOTSTRAP_SNAPSHOT", "false")

if test_db.exists():
    test_db.unlink()
