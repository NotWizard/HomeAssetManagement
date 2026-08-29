import io
import shutil
from fastapi import APIRouter
from fastapi import Depends
from fastapi import UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

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


def _import_migration_work(db: Session, content: bytes, filename: str) -> dict:
    """迁移导入全链路（解压校验 + 清表重建 + 提交）打包成一个同步单元，
    供 run_in_threadpool 调用：事务边界完整落在同一 worker 线程。"""
    data = MigrationService.import_package(db, io.BytesIO(content), filename)
    db.commit()
    return data


@router.post('/import')
async def import_migration(file: UploadFile, db: Session = Depends(get_db)):
    content = await _read_upload_within_limit(file, MAX_MIGRATION_UPLOAD_BYTES)
    # 迁移包上限 256MB，解压 + 逐行重建是重操作；async handler 里直接跑会阻塞
    # 事件循环（期间连 /health 都不响应），卸载到 threadpool。
    return ok(
        await run_in_threadpool(
            _import_migration_work, db, content, file.filename or 'migration.zip'
        )
    )
