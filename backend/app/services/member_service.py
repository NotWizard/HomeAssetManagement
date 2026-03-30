from sqlalchemy import delete
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.models.holding_item import HoldingItem
from app.models.member import Member
from app.services.common import get_default_family
from app.services.common import get_scoped_member


class MemberService:
    @staticmethod
    def list_members(session: Session) -> list[Member]:
        family = get_default_family(session)
        return list(
            session.scalars(
                select(Member)
                .where(Member.family_id == family.id)
                .order_by(Member.created_at.asc())
            )
        )

    @staticmethod
    def create_member(session: Session, name: str) -> Member:
        family = get_default_family(session)
        normalized_name = _normalize_member_name(name)
        _ensure_member_name_available(session, family.id, normalized_name)
        member = Member(family_id=family.id, name=normalized_name)
        session.add(member)
        session.flush()
        return member

    @staticmethod
    def update_member(session: Session, member_id: int, name: str) -> Member:
        member = get_scoped_member(session, member_id)
        normalized_name = _normalize_member_name(name)
        _ensure_member_name_available(
            session,
            member.family_id,
            normalized_name,
            exclude_member_id=member.id,
        )
        member.name = normalized_name
        session.flush()
        return member

    @staticmethod
    def delete_member(session: Session, member_id: int) -> None:
        member = get_scoped_member(session, member_id)

        holding = session.scalar(
            select(HoldingItem.id)
            .where(HoldingItem.member_id == member_id, HoldingItem.is_deleted.is_(False))
            .limit(1)
        )
        if holding is not None:
            raise AppError(4002, "成员存在关联资产或负债，无法删除")

        session.execute(
            delete(HoldingItem).where(
                HoldingItem.member_id == member_id,
                HoldingItem.is_deleted.is_(True),
            )
        )
        session.delete(member)
        session.flush()


def _normalize_member_name(name: str) -> str:
    normalized_name = name.strip()
    if not normalized_name:
        raise AppError(4001, "成员名称不能为空")
    return normalized_name


def _ensure_member_name_available(
    session: Session,
    family_id: int,
    normalized_name: str,
    exclude_member_id: int | None = None,
) -> None:
    stmt = select(Member).where(
        Member.family_id == family_id,
        Member.name == normalized_name,
    )
    if exclude_member_id is not None:
        stmt = stmt.where(Member.id != exclude_member_id)

    existing = session.scalar(stmt.limit(1))
    if existing is not None:
        raise AppError(4090, "成员名称已存在")
