from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.core.timezone import business_today
from app.models.holding_item import HoldingItem
from app.services.category_service import CategoryService
from app.services.common import get_default_family
from app.services.common import get_scoped_holding
from app.services.common import get_scoped_member
from app.services.fx_service import FXService
from app.services.settings_service import SettingsService
from app.services.snapshot_service import SnapshotService
from app.utils.fx import convert_to_base_amount


class HoldingService:
    @staticmethod
    def list_holdings(
        session: Session,
        member_id: int | None = None,
        holding_type: str | None = None,
        keyword: str | None = None,
    ) -> list[HoldingItem]:
        family = get_default_family(session)
        stmt = select(HoldingItem).where(
            HoldingItem.family_id == family.id,
            HoldingItem.is_deleted.is_(False),
        )
        if member_id is not None:
            stmt = stmt.where(HoldingItem.member_id == member_id)
        if holding_type:
            stmt = stmt.where(HoldingItem.type == holding_type)
        if keyword:
            stmt = stmt.where(HoldingItem.name.ilike(f"%{keyword}%"))
        stmt = stmt.order_by(HoldingItem.updated_at.desc(), HoldingItem.id.desc())
        return list(session.scalars(stmt))

    @staticmethod
    def create_holding(
        session: Session,
        payload: dict,
        source: str = "manual",
        refresh_snapshots: bool = True,
    ) -> HoldingItem:
        family = get_default_family(session)
        _validate_member(session, payload["member_id"])
        _validate_holding_payload(session, payload)

        settings = SettingsService.get_settings(session)
        rate, _estimated = FXService.resolve_rate(
            session=session,
            quote_currency=payload["currency"],
            base_currency=settings.base_currency,
            as_of=business_today(session),
        )

        amount_original = Decimal(str(payload["amount_original"]))
        amount_base = convert_to_base_amount(amount_original, rate)

        row = HoldingItem(
            family_id=family.id,
            member_id=payload["member_id"],
            type=payload["type"],
            name=payload["name"].strip(),
            category_l1_id=payload["category_l1_id"],
            category_l2_id=payload["category_l2_id"],
            category_l3_id=payload["category_l3_id"],
            currency=payload["currency"].upper(),
            amount_original=amount_original,
            amount_base=amount_base,
            target_ratio=payload.get("target_ratio"),
            source=source,
        )
        session.add(row)
        session.flush()
        if refresh_snapshots:
            _refresh_snapshots(session, trigger_type="create", note=f"holding:{row.id}")
        return row

    @staticmethod
    def update_holding(
        session: Session,
        holding_id: int,
        payload: dict,
        refresh_snapshots: bool = True,
    ) -> HoldingItem:
        row = get_scoped_holding(session, holding_id)

        _validate_member(session, payload["member_id"])
        _validate_holding_payload(session, payload)

        settings = SettingsService.get_settings(session)
        rate, _estimated = FXService.resolve_rate(
            session=session,
            quote_currency=payload["currency"],
            base_currency=settings.base_currency,
            as_of=business_today(session),
        )

        amount_original = Decimal(str(payload["amount_original"]))
        amount_base = convert_to_base_amount(amount_original, rate)

        row.member_id = payload["member_id"]
        row.type = payload["type"]
        row.name = payload["name"].strip()
        row.category_l1_id = payload["category_l1_id"]
        row.category_l2_id = payload["category_l2_id"]
        row.category_l3_id = payload["category_l3_id"]
        row.currency = payload["currency"].upper()
        row.amount_original = amount_original
        row.amount_base = amount_base
        row.target_ratio = payload.get("target_ratio")
        row.source = payload.get("source", row.source)

        session.flush()
        if refresh_snapshots:
            _refresh_snapshots(session, trigger_type="update", note=f"holding:{row.id}")
        return row

    @staticmethod
    def soft_delete_holding(session: Session, holding_id: int) -> None:
        row = get_scoped_holding(session, holding_id)
        row.is_deleted = True
        session.flush()
        _refresh_snapshots(session, trigger_type="update", note=f"delete:{row.id}")

    @staticmethod
    def bulk_soft_delete(session: Session, payload: dict) -> dict:
        mode = str(payload.get("mode") or "").strip()
        family = get_default_family(session)

        if mode == "ids":
            raw_ids = payload.get("holding_ids") or []
            holding_ids = sorted({int(item) for item in raw_ids if int(item) > 0})
            if not holding_ids:
                raise AppError(4001, "请至少选择一条资产/负债")
            stmt = (
                select(HoldingItem)
                .where(
                    HoldingItem.family_id == family.id,
                    HoldingItem.is_deleted.is_(False),
                    HoldingItem.id.in_(holding_ids),
                )
                .order_by(HoldingItem.id.asc())
            )
            rows = list(session.scalars(stmt))
            if not rows:
                raise AppError(4040, "未找到可删除的资产/负债")
            deleted_ids = [row.id for row in rows]
            for row in rows:
                row.is_deleted = True
            session.flush()
            _refresh_snapshots(session, trigger_type="update", note=f"bulk-delete:ids:{len(deleted_ids)}")
            return {
                "deleted_count": len(deleted_ids),
                "deleted_ids": deleted_ids,
                "member_id": None,
                "snapshot_refreshed": True,
            }

        if mode == "member":
            member_id = payload.get("member_id")
            if member_id is None:
                raise AppError(4001, "请选择成员")
            member_id = int(member_id)
            _validate_member(session, member_id)
            stmt = (
                select(HoldingItem)
                .where(
                    HoldingItem.family_id == family.id,
                    HoldingItem.member_id == member_id,
                    HoldingItem.is_deleted.is_(False),
                )
                .order_by(HoldingItem.id.asc())
            )
            rows = list(session.scalars(stmt))
            if not rows:
                raise AppError(4040, "该成员暂无可删除的资产/负债")
            deleted_ids = [row.id for row in rows]
            for row in rows:
                row.is_deleted = True
            session.flush()
            _refresh_snapshots(session, trigger_type="update", note=f"bulk-delete:member:{member_id}:{len(deleted_ids)}")
            return {
                "deleted_count": len(deleted_ids),
                "deleted_ids": deleted_ids,
                "member_id": member_id,
                "snapshot_refreshed": True,
            }

        raise AppError(4001, "批量删除模式无效")


def _refresh_snapshots(session: Session, trigger_type: str, note: str | None = None) -> None:
    SnapshotService.create_event_snapshot(session, trigger_type=trigger_type, note=note)
    SnapshotService.create_daily_snapshot(session)



def _validate_member(session: Session, member_id: int) -> None:
    get_scoped_member(session, member_id)



def _validate_holding_payload(session: Session, payload: dict) -> None:
    htype = payload.get("type")
    if htype not in ("asset", "liability"):
        raise AppError(4001, "type 必须是 asset 或 liability")

    amount = Decimal(str(payload.get("amount_original", "0")))
    if amount <= 0:
        raise AppError(4001, "金额必须大于 0")

    target_ratio = payload.get("target_ratio")
    if htype == "asset":
        if target_ratio is None:
            raise AppError(4001, "资产必须填写期望占比")
        target_dec = Decimal(str(target_ratio))
        if target_dec < 0 or target_dec > 100:
            raise AppError(4001, "期望占比必须在 0 到 100 之间")
        payload["target_ratio"] = target_dec
    else:
        payload["target_ratio"] = None

    try:
        CategoryService.resolve_path(
            session,
            payload["category_l1_id"],
            payload["category_l2_id"],
            payload["category_l3_id"],
            htype,
        )
    except ValueError as exc:
        raise AppError(4002, str(exc)) from exc

    currency = str(payload.get("currency", "")).strip().upper()
    if len(currency) < 3:
        raise AppError(4001, "币种格式不正确")
    payload["currency"] = currency

    name = str(payload.get("name", "")).strip()
    if not name:
        raise AppError(4001, "名称不能为空")
    payload["name"] = name
