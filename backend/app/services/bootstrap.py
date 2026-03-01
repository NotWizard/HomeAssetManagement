from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import Base
from app.core.database import engine
from app.models.category import Category
from app.models.family import Family
from app.models.settings import SettingsModel


def init_database() -> None:
    Base.metadata.create_all(bind=engine)
    with Session(engine) as session:
        _ensure_default_family(session)
        _ensure_default_settings(session)
        _ensure_default_categories(session)
        session.commit()


def _ensure_default_family(session: Session) -> Family:
    family = session.scalar(select(Family).limit(1))
    if family:
        return family
    family = Family(name="我的家庭")
    session.add(family)
    session.flush()
    return family


def _ensure_default_settings(session: Session) -> None:
    settings = get_settings()
    family = _ensure_default_family(session)
    exists = session.scalar(
        select(SettingsModel).where(SettingsModel.family_id == family.id).limit(1)
    )
    if exists:
        return
    session.add(
        SettingsModel(
            family_id=family.id,
            base_currency=settings.base_currency,
            timezone=settings.timezone,
            rebalance_threshold_pct=settings.rebalance_threshold_pct,
            fx_provider="frankfurter",
        )
    )


def _ensure_default_categories(session: Session) -> None:
    existing = session.scalar(select(Category.id).limit(1))
    if existing is not None:
        return

    for ctype in ("asset", "liability"):
        l1 = Category(type=ctype, level=1, parent_id=None, name="默认一级", sort_order=1)
        session.add(l1)
        session.flush()
        l2 = Category(type=ctype, level=2, parent_id=l1.id, name="默认二级", sort_order=1)
        session.add(l2)
        session.flush()
        l3 = Category(type=ctype, level=3, parent_id=l2.id, name="默认三级", sort_order=1)
        session.add(l3)
