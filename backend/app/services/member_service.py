from sqlalchemy import delete
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.models.holding_item import HoldingItem
from app.models.member import Member
from app.services.common import get_default_family


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
        member = Member(family_id=family.id, name=name.strip())
        session.add(member)
        session.flush()
        return member

    @staticmethod
    def update_member(session: Session, member_id: int, name: str) -> Member:
        member = session.get(Member, member_id)
        if member is None:
            raise AppError(4040, "成员不存在")
        member.name = name.strip()
        session.flush()
        return member

    @staticmethod
    def delete_member(session: Session, member_id: int) -> None:
        member = session.get(Member, member_id)
        if member is None:
            raise AppError(4040, "成员不存在")

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
