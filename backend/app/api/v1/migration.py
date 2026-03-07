import shutil
from fastapi import APIRouter
from fastapi import Depends
from fastapi import UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.core.database import get_db
from app.core.response import ok
from app.services.migration_service import MigrationService

router = APIRouter()


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
def import_migration(file: UploadFile, db: Session = Depends(get_db)):
    data = MigrationService.import_package(db, file.file, file.filename or 'migration.zip')
    db.commit()
    return ok(data)
