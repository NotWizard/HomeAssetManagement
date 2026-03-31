import csv
from dataclasses import dataclass
from decimal import Decimal
from io import StringIO
from pathlib import Path

from sqlalchemy import and_
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.holding_item import HoldingItem
from app.models.import_log import ImportLog
from app.models.member import Member
from app.services.category_service import CategoryService
from app.services.common import get_default_family
from app.services.common import get_scoped_import_log
from app.services.holding_service import HoldingService
from app.core.clock import utc_now_naive
from app.services.snapshot_service import SnapshotService


REQUIRED_COLUMNS = {
    "name",
    "type",
    "member",
    "category_l1",
    "category_l2",
    "category_l3",
    "currency",
    "amount_original",
}


@dataclass
class ParsedRow:
    index: int
    payload: dict | None
    action: str
    error: str | None


@dataclass
class ImportApplyResult:
    total: int
    inserted: int
    updated: int
    failed: int


class ImportService:
    @staticmethod
    def preview_csv(session: Session, content: bytes) -> dict:
        parsed = _parse_csv(session, content)
        return _to_preview(parsed)

    @staticmethod
    def commit_csv(session: Session, content: bytes, filename: str) -> tuple[dict, list[ParsedRow]]:
        parsed = _parse_csv(session, content)
        family = get_default_family(session)
        apply_result = _apply_parsed_rows(session, parsed)
        import_log = _create_import_log(
            session,
            family_id=family.id,
            filename=filename,
            apply_result=apply_result,
        )
        _record_import_snapshots(session, filename)

        return (
            {
                "import_id": import_log.id,
                "total_rows": apply_result.total,
                "updated_rows": apply_result.updated,
                "inserted_rows": apply_result.inserted,
                "failed_rows": apply_result.failed,
                "error_report_path": None,
            },
            parsed,
        )

    @staticmethod
    def finalize_error_report(session: Session, import_id: int, parsed: list[ParsedRow]) -> str | None:
        failed_rows = [row for row in parsed if row.error is not None]
        if not failed_rows:
            return None

        import_log = get_scoped_import_log(session, import_id)

        path = _write_error_report(import_id, failed_rows)
        import_log.error_report_path = str(path)
        session.flush()
        return import_log.error_report_path

    @staticmethod
    def list_logs(session: Session, limit: int = 100) -> list[ImportLog]:
        family = get_default_family(session)
        return list(
            session.scalars(
                select(ImportLog)
                .where(ImportLog.family_id == family.id)
                .order_by(ImportLog.created_at.desc())
                .limit(max(1, min(500, limit)))
            )
        )



def _parse_csv(session: Session, content: bytes) -> list[ParsedRow]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(StringIO(text))
    if not reader.fieldnames:
        return [ParsedRow(index=1, payload=None, action="invalid", error="CSV 为空")]

    normalized_headers = {h.strip() for h in reader.fieldnames if h}
    missing = REQUIRED_COLUMNS - normalized_headers
    if missing:
        return [
            ParsedRow(
                index=1,
                payload=None,
                action="invalid",
                error=f"缺少字段: {', '.join(sorted(missing))}",
            )
        ]

    parsed_rows: list[ParsedRow] = []
    for idx, raw in enumerate(reader, start=2):
        try:
            payload = _build_payload(session, raw)
            action = _resolve_action(session, payload)
            parsed_rows.append(ParsedRow(index=idx, payload=payload, action=action, error=None))
        except Exception as exc:  # noqa: BLE001
            parsed_rows.append(ParsedRow(index=idx, payload=None, action="invalid", error=str(exc)))

    return parsed_rows



def _build_payload(session: Session, raw: dict[str, str]) -> dict:
    htype = raw["type"].strip().lower()
    if htype not in ("asset", "liability"):
        raise ValueError("type 只能是 asset 或 liability")

    family = get_default_family(session)
    member_name = raw["member"].strip()
    members = list(
        session.scalars(
            select(Member).where(Member.family_id == family.id, Member.name == member_name).limit(2)
        )
    )
    if not members:
        raise ValueError(f"成员不存在: {member_name}")
    if len(members) > 1:
        raise ValueError(f"成员名称不唯一: {member_name}")
    member = members[0]

    l1, l2, l3 = CategoryService.resolve_path_by_name(
        session,
        htype,
        raw["category_l1"].strip(),
        raw["category_l2"].strip(),
        raw["category_l3"].strip(),
    )

    target_ratio: Decimal | None = None
    raw_target = (raw.get("target_ratio") or "").strip()
    if htype == "asset":
        if not raw_target:
            raise ValueError("资产必须提供 target_ratio")
        target_ratio = Decimal(raw_target)

    return {
        "member_id": member.id,
        "type": htype,
        "name": raw["name"].strip(),
        "category_l1_id": l1.id,
        "category_l2_id": l2.id,
        "category_l3_id": l3.id,
        "currency": raw["currency"].strip().upper(),
        "amount_original": Decimal(raw["amount_original"].strip()),
        "target_ratio": target_ratio,
    }



def _resolve_action(session: Session, payload: dict) -> str:
    family = get_default_family(session)
    existing = session.scalar(
        select(HoldingItem).where(
            and_(
                HoldingItem.family_id == family.id,
                HoldingItem.is_deleted.is_(False),
                HoldingItem.type == payload["type"],
                HoldingItem.name == payload["name"],
                HoldingItem.member_id == payload["member_id"],
                HoldingItem.category_l3_id == payload["category_l3_id"],
            )
        )
    )
    return "update" if existing else "insert"



def _update_existing(session: Session, payload: dict) -> None:
    family = get_default_family(session)
    existing = session.scalar(
        select(HoldingItem).where(
            and_(
                HoldingItem.family_id == family.id,
                HoldingItem.is_deleted.is_(False),
                HoldingItem.type == payload["type"],
                HoldingItem.name == payload["name"],
                HoldingItem.member_id == payload["member_id"],
                HoldingItem.category_l3_id == payload["category_l3_id"],
            )
        )
    )
    if existing is None:
        HoldingService.create_holding(session, payload, source="csv", refresh_snapshots=False)
    else:
        HoldingService.update_holding(session, existing.id, payload, refresh_snapshots=False)



def _apply_parsed_rows(session: Session, parsed: list[ParsedRow]) -> ImportApplyResult:
    inserted = 0
    updated = 0
    failed = 0

    for row in parsed:
        if row.error:
            failed += 1
            continue

        try:
            assert row.payload is not None
            if row.action == "update":
                _update_existing(session, row.payload)
                updated += 1
            else:
                HoldingService.create_holding(
                    session,
                    row.payload,
                    source="csv",
                    refresh_snapshots=False,
                )
                inserted += 1
        except Exception as exc:  # noqa: BLE001
            row.error = str(exc)
            failed += 1

    return ImportApplyResult(
        total=len(parsed),
        inserted=inserted,
        updated=updated,
        failed=failed,
    )



def _create_import_log(
    session: Session,
    *,
    family_id: int,
    filename: str,
    apply_result: ImportApplyResult,
) -> ImportLog:
    import_log = ImportLog(
        family_id=family_id,
        file_name=filename,
        total_rows=apply_result.total,
        updated_rows=apply_result.updated,
        inserted_rows=apply_result.inserted,
        failed_rows=apply_result.failed,
        error_report_path=None,
        created_at=utc_now_naive(),
    )
    session.add(import_log)
    session.flush()
    return import_log



def _record_import_snapshots(session: Session, filename: str) -> None:
    SnapshotService.create_event_snapshot(session, trigger_type="import", note=filename)
    SnapshotService.create_daily_snapshot(session)



def _to_preview(parsed: list[ParsedRow]) -> dict:
    inserted = sum(1 for row in parsed if row.action == "insert" and row.error is None)
    updated = sum(1 for row in parsed if row.action == "update" and row.error is None)
    failed = sum(1 for row in parsed if row.error is not None)

    return {
        "total_rows": len(parsed),
        "inserted_rows": inserted,
        "updated_rows": updated,
        "failed_rows": failed,
        "rows": [
            {
                "row": row.index,
                "action": row.action,
                "error": row.error,
            }
            for row in parsed
        ],
    }



def _write_error_report(import_id: int, parsed: list[ParsedRow]) -> Path:
    settings = get_settings()
    path = Path(settings.storage_dir) / "import_errors" / f"import-{import_id}-errors.csv"
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["row", "action", "error"])
        for row in parsed:
            if row.error is not None:
                writer.writerow([row.index, row.action, row.error])
    return path
