from collections.abc import Generator

from sqlalchemy import event
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.orm import Session
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
connect_args: dict[str, bool] = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(settings.database_url, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)


if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        # WAL：允许读写并发，写不阻塞读
        cursor.execute("PRAGMA journal_mode=WAL;")
        # 5 秒 busy timeout：缓解 scheduler + http 并发写引起的 SQLITE_BUSY；
        # 仍需要业务层在更高竞态情况下做重试，但 5s 已经覆盖绝大多数本地场景
        cursor.execute("PRAGMA busy_timeout=5000;")
        # synchronous=NORMAL 在 WAL 模式下是推荐组合：保留崩溃安全的同时减少 fsync 频次
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
