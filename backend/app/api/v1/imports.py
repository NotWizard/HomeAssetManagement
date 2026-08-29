from pathlib import Path

from fastapi import APIRouter
from fastapi import Depends
from fastapi import Query
from fastapi import UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core.database import get_db
from app.core.exceptions import AppError
from app.core.response import ok
from app.services.common import get_scoped_import_log
from app.services.import_service import ImportService

router = APIRouter()

# CSV 上传上限：32MB 已经足够覆盖正常家庭账本，超过则视作误传或滥用。
MAX_CSV_UPLOAD_BYTES = 32 * 1024 * 1024


async def _read_upload_within_limit(file: UploadFile, limit: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise AppError(4001, f"上传文件过大（限制 {limit // (1024 * 1024)}MB）")
        chunks.append(chunk)
    return b"".join(chunks)


def _commit_csv_work(db: Session, content: bytes, filename: str) -> dict:
    """commit 全链路（解析 + 逐行写库 + 提交 + 错误报告）打包成一个同步单元，
    供 run_in_threadpool 调用：事务边界完整落在同一 worker 线程。"""
    data, parsed = ImportService.commit_csv(db, content, filename)
    db.commit()

    if data["failed_rows"] > 0:
        error_report_path = ImportService.finalize_error_report(db, data["import_id"], parsed)
        db.commit()
        data["error_report_path"] = error_report_path

    return data


@router.post("/preview")
async def preview_import(file: UploadFile, db: Session = Depends(get_db)):
    content = await _read_upload_within_limit(file, MAX_CSV_UPLOAD_BYTES)
    # 大 CSV 解析是 CPU/DB 密集操作，async handler 里直接跑会阻塞事件循环
    # （期间连 /health 都不响应），卸载到 threadpool。
    return ok(await run_in_threadpool(ImportService.preview_csv, db, content))


@router.post("/commit")
async def commit_import(file: UploadFile, db: Session = Depends(get_db)):
    content = await _read_upload_within_limit(file, MAX_CSV_UPLOAD_BYTES)
    data = await run_in_threadpool(
        _commit_csv_work, db, content, file.filename or "import.csv"
    )
    return ok(data)


@router.get("/logs")
def list_import_logs(limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db)):
    rows = ImportService.list_logs(db, limit=limit)
    return ok(
        [
            {
                "id": row.id,
                "file_name": row.file_name,
                "total_rows": row.total_rows,
                "updated_rows": row.updated_rows,
                "inserted_rows": row.inserted_rows,
                "failed_rows": row.failed_rows,
                "error_report_path": row.error_report_path,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    )


@router.get("/{import_id}/errors")
def download_import_errors(import_id: int, db: Session = Depends(get_db)):
    row = get_scoped_import_log(db, import_id)
    if row is None or not row.error_report_path:
        raise AppError(4040, "错误报告不存在")

    file_path = Path(row.error_report_path)
    if not file_path.exists():
        raise AppError(4040, "错误报告文件不存在")

    return FileResponse(path=file_path, filename=file_path.name, media_type="text/csv")
