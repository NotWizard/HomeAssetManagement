import io
import shutil
from fastapi import APIRouter
from fastapi import Depends
from fastapi import UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.core.database import get_db
from app.core.exceptions import AppError
from app.core.response import ok
from app.services.migration_service import MigrationService

router = APIRouter()

# 迁移包上限：256MB 已远超正常家庭历年快照与持仓数据；超过即视为误传或滥用。
MAX_MIGRATION_UPLOAD_BYTES = 256 * 1024 * 1024


async def _read_upload_within_limit(file: UploadFile, limit: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise AppError(4001, f"迁移包过大（限制 {limit // (1024 * 1024)}MB）")
        chunks.append(chunk)
    return b"".join(chunks)


@router.post('/export')
def export_migration(db: Session = Depends(get_db)):
    filename, archive_path, export_dir = MigrationService.export_package(db)
    return FileResponse(
        path=archive_path,
        media_type='application/zip',
        filename=filename,
        background=BackgroundTask(shutil.rmtree, export_dir, ignore_errors=True),
    )


@router.post('/import')
async def import_migration(file: UploadFile, db: Session = Depends(get_db)):
    content = await _read_upload_within_limit(file, MAX_MIGRATION_UPLOAD_BYTES)
    data = MigrationService.import_package(db, io.BytesIO(content), file.filename or 'migration.zip')
    db.commit()
    return ok(data)
