from fastapi import APIRouter

from app.api.v1.analytics import router as analytics_router
from app.api.v1.categories import router as categories_router
from app.api.v1.fx import router as fx_router
from app.api.v1.holdings import router as holdings_router
from app.api.v1.imports import router as imports_router
from app.api.v1.members import router as members_router
from app.api.v1.migration import router as migration_router
from app.api.v1.settings import router as settings_router
from app.api.v1.snapshots import router as snapshots_router

router = APIRouter(prefix="/api/v1")
router.include_router(members_router, prefix="/members", tags=["members"])
router.include_router(categories_router, prefix="/categories", tags=["categories"])
router.include_router(holdings_router, prefix="/holdings", tags=["holdings"])
router.include_router(imports_router, prefix="/imports", tags=["imports"])
router.include_router(settings_router, prefix="/settings", tags=["settings"])
router.include_router(fx_router, prefix="/fx", tags=["fx"])
router.include_router(snapshots_router, prefix="/snapshots", tags=["snapshots"])
router.include_router(analytics_router, prefix="/analytics", tags=["analytics"])

router.include_router(migration_router, prefix="/migration", tags=["migration"])
