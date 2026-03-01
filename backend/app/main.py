from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import router as api_router
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.response import err
from app.jobs.scheduler import start_scheduler
from app.jobs.scheduler import stop_scheduler
from app.services.bootstrap import init_database
from app.services.snapshot_service import SnapshotService
from app.core.database import SessionLocal

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
    init_database()
    with SessionLocal() as session:
        SnapshotService.create_daily_snapshot(session)
        session.commit()
    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def app_error_handler(request, exc: AppError):  # type: ignore[no-untyped-def]
    return JSONResponse(status_code=400, content=err(exc.code, exc.message))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router)
