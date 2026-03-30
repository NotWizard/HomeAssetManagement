from pathlib import Path

from fastapi import APIRouter
from fastapi import Depends
from fastapi import Query
from fastapi import UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import AppError
from app.core.response import ok
from app.models.import_log import ImportLog
from app.services.import_service import ImportService

router = APIRouter()


@router.post("/preview")
async def preview_import(file: UploadFile, db: Session = Depends(get_db)):
    content = await file.read()
    return ok(ImportService.preview_csv(db, content))


@router.post("/commit")
async def commit_import(file: UploadFile, db: Session = Depends(get_db)):
    content = await file.read()
    data, parsed = ImportService.commit_csv(db, content, file.filename or "import.csv")
    db.commit()

    if data["failed_rows"] > 0:
        error_report_path = ImportService.finalize_error_report(db, data["import_id"], parsed)
        db.commit()
        data["error_report_path"] = error_report_path

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
    row = db.get(ImportLog, import_id)
    if row is None or not row.error_report_path:
        raise AppError(4040, "错误报告不存在")

    file_path = Path(row.error_report_path)
    if not file_path.exists():
        raise AppError(4040, "错误报告文件不存在")

    return FileResponse(path=file_path, filename=file_path.name, media_type="text/csv")
