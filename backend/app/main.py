from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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
frontend_dist_dir = Path(settings.frontend_dist_dir).resolve() if settings.frontend_dist_dir else None
frontend_index_file = frontend_dist_dir / "index.html" if frontend_dist_dir else None


def _status_code_for_app_error(code: int) -> int:
    if code == 4040:
        return 404
    if code == 4090:
        return 409
    if code == 5000:
        return 500
    return 400


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
    return JSONResponse(
        status_code=_status_code_for_app_error(exc.code),
        content=err(exc.code, exc.message),
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router)


def _resolve_frontend_file(full_path: str) -> Path:
    if frontend_dist_dir is None or frontend_index_file is None or not frontend_index_file.exists():
        raise HTTPException(status_code=404, detail="Not Found")

    requested_path = full_path.strip("/")
    if not requested_path:
        return frontend_index_file

    candidate = (frontend_dist_dir / requested_path).resolve()
    try:
        candidate.relative_to(frontend_dist_dir)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Not Found") from exc

    if candidate.is_file():
        return candidate
    if Path(requested_path).suffix:
        raise HTTPException(status_code=404, detail="Not Found")
    return frontend_index_file


@app.get("/", include_in_schema=False)
def serve_frontend_root() -> FileResponse:
    return FileResponse(_resolve_frontend_file(""))


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend_app(full_path: str) -> FileResponse:
    return FileResponse(_resolve_frontend_file(full_path))
