import os
import sys
from pathlib import Path

# Ensure backend/app is importable as top-level package "app".
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# 必须在任何 app.* import 之前设好 env：让 app.core.config / database 拿到 in-memory URL，
# 同时关掉 scheduler 与 boot snapshot（测试套件不需要它们）。
os.environ["HBS_DATABASE_URL"] = "sqlite:///:memory:"
os.environ.setdefault("HBS_ENABLE_SCHEDULER", "false")
os.environ.setdefault("HBS_ENABLE_BOOTSTRAP_SNAPSHOT", "false")

from app.core.config import get_settings  # noqa: E402

# settings 是 lru_cache，确保新 env 生效
get_settings.cache_clear()

import pytest  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy import event  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.core.database as _db_module  # noqa: E402

# 重建 engine 为 in-memory + StaticPool：所有 connection 共享同一 in-memory db,
# 多个 SessionLocal() 看到同一份数据。原 `app.core.database` 在 import 时已经
# 用文件 URL 建过 engine，这里直接覆盖模块属性 + 重新 configure SessionLocal。
_db_module.engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    future=True,
)


@event.listens_for(_db_module.engine, "connect")
def _set_test_pragma(dbapi_connection, _record):  # type: ignore[no-untyped-def]
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON;")
    cursor.close()


_db_module.SessionLocal.configure(bind=_db_module.engine)


def _create_schema_and_seed() -> None:
    """跨过 alembic 直接建表 + bootstrap seed。

    alembic 的 `run_database_migrations` 会自己 `create_engine(url)`，对
    `sqlite:///:memory:` 而言那是另一个独立 in-memory db、与我们 StaticPool
    持有的 connection 不通；所以测试套件直接 `Base.metadata.create_all`
    + `ensure_seed_data` 起 schema，与 alembic 等价但能落到同一 db。
    """
    from app.core.database import Base

    # 触发所有 model 模块 import，注册到 Base.metadata
    import app.models.family  # noqa: F401
    import app.models.member  # noqa: F401
    import app.models.category  # noqa: F401
    import app.models.holding_item  # noqa: F401
    import app.models.settings  # noqa: F401
    import app.models.snapshot_daily  # noqa: F401
    import app.models.snapshot_event  # noqa: F401
    import app.models.fx_rate_daily  # noqa: F401
    import app.models.daily_total  # noqa: F401
    import app.models.import_log  # noqa: F401

    Base.metadata.create_all(bind=_db_module.engine)

    from app.services.bootstrap import ensure_seed_data

    with Session(_db_module.engine) as session:
        ensure_seed_data(session)
        session.commit()


# 覆写 `init_database`：测试里多处显式调它来「重置到 seed 状态」，原实现走
# alembic（在 in-memory + 独立 engine 下拿不到我们的 db）。改为同样的
# `Base.metadata.create_all` + `ensure_seed_data`（idempotent 仅补缺）。
def _stub_init_database() -> None:
    _create_schema_and_seed()


import app.services.bootstrap as _bootstrap_module  # noqa: E402

_bootstrap_module.init_database = _stub_init_database


@pytest.fixture(scope="session", autouse=True)
def _bootstrap_schema_once():
    _create_schema_and_seed()
    yield


@pytest.fixture(autouse=True)
def _per_test_savepoint():
    """每个 test 独享一个 outer transaction + nested SAVEPOINT。

    SessionLocal 在 fixture 内重新绑定到本次 connection，service 自己开的
    `SessionLocal()` 都会加入同一外层事务；test 结束统一 rollback，把当次
    所有 mutate 全部抹掉，session-scoped 建好的 schema + seed 数据保留。
    """
    connection = _db_module.engine.connect()
    transaction = connection.begin()
    _db_module.SessionLocal.configure(bind=connection)

    nested = connection.begin_nested()

    def _restart_savepoint(_session, trans):
        nonlocal nested
        # service 调用 session.commit() 会释放当前 SAVEPOINT；为了让 outer
        # transaction 仍能在 test 结尾被 rollback，每次 SAVEPOINT 结束就重新
        # 起一个，下一次 service 写入仍落在 nested SAVEPOINT 内。
        if trans.nested and not trans._parent.nested:
            if connection.in_transaction():
                nested = connection.begin_nested()

    event.listen(_db_module.SessionLocal, "after_transaction_end", _restart_savepoint)

    try:
        yield
    finally:
        event.remove(_db_module.SessionLocal, "after_transaction_end", _restart_savepoint)
        _db_module.SessionLocal.configure(bind=_db_module.engine)
        if transaction.is_active:
            transaction.rollback()
        connection.close()
