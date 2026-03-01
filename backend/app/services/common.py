from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.family import Family


def get_default_family(session: Session) -> Family:
    family = session.scalar(select(Family).order_by(Family.id.asc()).limit(1))
    if family is None:
        family = Family(name="我的家庭")
        session.add(family)
        session.flush()
    return family
