from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.core.exceptions import NOT_FOUND_ERROR
from app.core.exceptions import SCOPED_NOT_FOUND_ERROR
from app.models.family import Family
from app.models.holding_item import HoldingItem
from app.models.import_log import ImportLog
from app.models.member import Member


_DEFAULT_FAMILY_CACHE_KEY = "_default_family_id"


def get_default_family(session: Session) -> Family:
    """获取默认 family，复用 Session.info 做请求生命周期内缓存。

    `Session.info` 是 SQLAlchemy 官方的「per-session 附加数据」入口，
    会随 Session close 自动丢弃，不会跨请求泄漏。原实现被几乎所有 service
    调用且每次都查一次 SELECT；缓存后单个请求里只查一次。
    """
    family_id = session.info.get(_DEFAULT_FAMILY_CACHE_KEY)
    if family_id is not None:
        cached = session.get(Family, family_id)
        if cached is not None:
            return cached
        # 缓存的 id 在当前 session 取不到（不太可能，防御性清理）
        session.info.pop(_DEFAULT_FAMILY_CACHE_KEY, None)

    family = session.scalar(select(Family).order_by(Family.id.asc()).limit(1))
    if family is None:
        family = Family(name="我的家庭")
        session.add(family)
        session.flush()
    session.info[_DEFAULT_FAMILY_CACHE_KEY] = family.id
    return family


def get_scoped_member(session: Session, member_id: int) -> Member:
    family = get_default_family(session)
    member = session.scalar(
        select(Member).where(Member.id == member_id, Member.family_id == family.id).limit(1)
    )
    if member is None:
        if session.get(Member, member_id) is not None:
            raise AppError(SCOPED_NOT_FOUND_ERROR, "成员不属于当前家庭")
        raise AppError(NOT_FOUND_ERROR, "成员不存在")
    return member


def get_scoped_holding(session: Session, holding_id: int) -> HoldingItem:
    family = get_default_family(session)
    row = session.scalar(
        select(HoldingItem)
        .where(HoldingItem.id == holding_id, HoldingItem.family_id == family.id)
        .limit(1)
    )
    if row is None:
        if session.get(HoldingItem, holding_id) is not None:
            raise AppError(SCOPED_NOT_FOUND_ERROR, "资产/负债不属于当前家庭")
        raise AppError(NOT_FOUND_ERROR, "资产/负债不存在")
    if row.is_deleted:
        raise AppError(NOT_FOUND_ERROR, "资产/负债不存在")
    return row


def get_scoped_import_log(session: Session, import_id: int) -> ImportLog:
    family = get_default_family(session)
    row = session.scalar(
        select(ImportLog)
        .where(ImportLog.id == import_id, ImportLog.family_id == family.id)
        .limit(1)
    )
    if row is None:
        if session.get(ImportLog, import_id) is not None:
            raise AppError(SCOPED_NOT_FOUND_ERROR, "错误报告不属于当前家庭")
        raise AppError(NOT_FOUND_ERROR, "错误报告不存在")
    return row
