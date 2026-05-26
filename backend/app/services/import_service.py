import csv
from dataclasses import dataclass
from dataclasses import field
from decimal import Decimal
from io import StringIO
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.timezone import business_today
from app.models.category import Category
from app.models.holding_item import HoldingItem
from app.models.import_log import ImportLog
from app.models.member import Member
from app.services.common import get_default_family
from app.services.common import get_scoped_import_log
from app.services.fx_service import FXService
from app.services.holding_service import HoldingService
from app.services.settings_service import SettingsService
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


@dataclass
class _ImportPrefetch:
    """CSV 导入入口一次性预取的字典：行内只做 O(1) 查找，替代每行 ~10 次 SELECT。

    - members_by_name: 同名重复记为 None，保留旧"成员名称不唯一"错误语义
    - cat_l1/l2/l3 by (type, parent_id, name)
    - existing_holdings_by_key by (type, name, member_id, l3_id)
    - fx_rate_by_currency: commit 路径才会填，preview 跳过
    """

    family_id: int
    base_currency: str
    members_by_name: dict[str, Member | None]
    cat_l1_by_name: dict[tuple[str, str], Category]
    cat_l2_by_parent_name: dict[tuple[str, int, str], Category]
    cat_l3_by_parent_name: dict[tuple[str, int, str], Category]
    existing_holdings_by_key: dict[tuple[str, str, int, int], HoldingItem]
    fx_rate_by_currency: dict[str, Decimal] = field(default_factory=dict)


@dataclass
class ImportCommitContext:
    family_id: int
    filename: str
    parsed_rows: list[ParsedRow]
    prefetch: _ImportPrefetch


class ImportService:
    @staticmethod
    def preview_csv(session: Session, content: bytes) -> dict:
        prefetch = _build_import_prefetch(session)
        parsed = _parse_csv(content, prefetch)
        return _to_preview(parsed)

    @staticmethod
    def commit_csv(session: Session, content: bytes, filename: str) -> tuple[dict, list[ParsedRow]]:
        context = _prepare_import_commit(session, content, filename)
        apply_result = _apply_import_commit_rows(session, context)
        import_log = _finalize_import_commit(
            session,
            context,
            apply_result=apply_result,
        )

        return (
            {
                "import_id": import_log.id,
                "total_rows": apply_result.total,
                "updated_rows": apply_result.updated,
                "inserted_rows": apply_result.inserted,
                "failed_rows": apply_result.failed,
                "error_report_path": None,
            },
            context.parsed_rows,
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



_CSV_DECODE_FALLBACKS: tuple[str, ...] = ("utf-8-sig", "gb18030", "gbk", "latin-1")


def _decode_csv_bytes(content: bytes) -> str:
    """按编码兜底列表逐个尝试解码 CSV 字节流。

    用户常用的两类来源：UTF-8（含 BOM）+ Excel 中文导出（GBK / GB18030）；
    `latin-1` 作为最终兜底（永不抛错）以确保用户能看到友好错误而不是 500。
    """
    last_error: UnicodeDecodeError | None = None
    for encoding in _CSV_DECODE_FALLBACKS:
        try:
            return content.decode(encoding)
        except UnicodeDecodeError as exc:
            last_error = exc
    if last_error is not None:
        raise AppError(
            4001,
            f"CSV 文件编码无法识别（已尝试 {', '.join(_CSV_DECODE_FALLBACKS)}）",
        ) from last_error
    return content.decode("utf-8-sig", errors="replace")


def _build_import_prefetch(session: Session) -> _ImportPrefetch:
    """一次性 SELECT 全部 members/categories/existing holdings + settings 入字典。

    替代每行 ~10 次 SELECT；预取的 ORM 对象同时进入 session identity map，
    后续 HoldingService 内 `CategoryService.resolve_path` 的 `session.get(Category, id)`
    自动命中缓存（不再发 SQL）。
    """
    family = get_default_family(session)
    settings = SettingsService.get_settings(session)
    base_currency = settings.base_currency.upper()

    members_by_name: dict[str, Member | None] = {}
    for member in session.scalars(
        select(Member).where(Member.family_id == family.id)
    ):
        if member.name in members_by_name:
            members_by_name[member.name] = None  # 重名歧义
        else:
            members_by_name[member.name] = member

    cat_l1_by_name: dict[tuple[str, str], Category] = {}
    cat_l2_by_parent_name: dict[tuple[str, int, str], Category] = {}
    cat_l3_by_parent_name: dict[tuple[str, int, str], Category] = {}
    for cat in session.scalars(select(Category).order_by(Category.id.asc())):
        if cat.level == 1:
            cat_l1_by_name.setdefault((cat.type, cat.name), cat)
        elif cat.level == 2 and cat.parent_id is not None:
            cat_l2_by_parent_name.setdefault((cat.type, cat.parent_id, cat.name), cat)
        elif cat.level == 3 and cat.parent_id is not None:
            cat_l3_by_parent_name.setdefault((cat.type, cat.parent_id, cat.name), cat)

    existing_holdings_by_key: dict[tuple[str, str, int, int], HoldingItem] = {}
    for holding in session.scalars(
        select(HoldingItem).where(
            HoldingItem.family_id == family.id,
            HoldingItem.is_deleted.is_(False),
        )
    ):
        key = (holding.type, holding.name, holding.member_id, holding.category_l3_id)
        existing_holdings_by_key.setdefault(key, holding)

    return _ImportPrefetch(
        family_id=family.id,
        base_currency=base_currency,
        members_by_name=members_by_name,
        cat_l1_by_name=cat_l1_by_name,
        cat_l2_by_parent_name=cat_l2_by_parent_name,
        cat_l3_by_parent_name=cat_l3_by_parent_name,
        existing_holdings_by_key=existing_holdings_by_key,
    )


def _populate_fx_cache(
    session: Session,
    prefetch: _ImportPrefetch,
    currencies: set[str],
) -> None:
    """commit 路径专用：为本批 CSV 出现过的币种集合一次性 resolve FX rate。

    个别币种 resolve 失败（如新币种 + 网络异常）不在此处抛错，让对应行在
    HoldingService 内自然走原 FX 路径重试一次并以 row.error 收尾。
    """
    today = business_today(session)
    for currency in currencies:
        upper = currency.upper()
        if upper in prefetch.fx_rate_by_currency:
            continue
        try:
            rate, _estimated = FXService.resolve_rate(
                session=session,
                quote_currency=upper,
                base_currency=prefetch.base_currency,
                as_of=today,
            )
            prefetch.fx_rate_by_currency[upper] = rate
        except Exception:  # noqa: BLE001
            # 该币种行在 apply 阶段 fallback 走原 HoldingService FX 路径
            pass


def _parse_csv(content: bytes, prefetch: _ImportPrefetch) -> list[ParsedRow]:
    text = _decode_csv_bytes(content)
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
            payload = _build_payload(raw, prefetch)
            action = _resolve_action(payload, prefetch)
            parsed_rows.append(ParsedRow(index=idx, payload=payload, action=action, error=None))
        except Exception as exc:  # noqa: BLE001
            parsed_rows.append(ParsedRow(index=idx, payload=None, action="invalid", error=str(exc)))

    return parsed_rows


def _prepare_import_commit(
    session: Session,
    content: bytes,
    filename: str,
) -> ImportCommitContext:
    prefetch = _build_import_prefetch(session)
    parsed_rows = _parse_csv(content, prefetch)
    currencies = {
        row.payload["currency"]
        for row in parsed_rows
        if row.error is None and row.payload is not None
    }
    if currencies:
        _populate_fx_cache(session, prefetch, currencies)
    return ImportCommitContext(
        family_id=prefetch.family_id,
        filename=filename,
        parsed_rows=parsed_rows,
        prefetch=prefetch,
    )


def _build_payload(raw: dict[str, str], prefetch: _ImportPrefetch) -> dict:
    htype = raw["type"].strip().lower()
    if htype not in ("asset", "liability"):
        raise ValueError("type 只能是 asset 或 liability")

    member_name = raw["member"].strip()
    if member_name not in prefetch.members_by_name:
        raise ValueError(f"成员不存在: {member_name}")
    member = prefetch.members_by_name[member_name]
    if member is None:
        raise ValueError(f"成员名称不唯一: {member_name}")

    l1_name = raw["category_l1"].strip()
    l2_name = raw["category_l2"].strip()
    l3_name = raw["category_l3"].strip()

    l1 = prefetch.cat_l1_by_name.get((htype, l1_name))
    if l1 is None:
        raise ValueError(f"找不到一级分类: {l1_name}")
    l2 = prefetch.cat_l2_by_parent_name.get((htype, l1.id, l2_name))
    if l2 is None:
        raise ValueError(f"找不到二级分类: {l2_name}")
    l3 = prefetch.cat_l3_by_parent_name.get((htype, l2.id, l3_name))
    if l3 is None:
        raise ValueError(f"找不到三级分类: {l3_name}")

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



def _resolve_action(payload: dict, prefetch: _ImportPrefetch) -> str:
    key = (
        payload["type"],
        payload["name"],
        payload["member_id"],
        payload["category_l3_id"],
    )
    return "update" if key in prefetch.existing_holdings_by_key else "insert"



def _apply_parsed_rows(
    session: Session,
    parsed: list[ParsedRow],
    prefetch: _ImportPrefetch,
) -> ImportApplyResult:
    inserted = 0
    updated = 0
    failed = 0

    for row in parsed:
        if row.error:
            failed += 1
            continue

        try:
            assert row.payload is not None
            currency = row.payload["currency"]
            fx_rate = prefetch.fx_rate_by_currency.get(currency)
            if row.action == "update":
                key = (
                    row.payload["type"],
                    row.payload["name"],
                    row.payload["member_id"],
                    row.payload["category_l3_id"],
                )
                existing = prefetch.existing_holdings_by_key.get(key)
                if existing is None:
                    HoldingService.create_holding(
                        session,
                        row.payload,
                        source="csv",
                        refresh_snapshots=False,
                        prefetched_family_id=prefetch.family_id,
                        prefetched_base_currency=prefetch.base_currency,
                        prefetched_fx_rate=fx_rate,
                        skip_member_db_check=True,
                    )
                    inserted += 1
                else:
                    HoldingService.update_holding(
                        session,
                        existing.id,
                        row.payload,
                        refresh_snapshots=False,
                        prefetched_row=existing,
                        prefetched_base_currency=prefetch.base_currency,
                        prefetched_fx_rate=fx_rate,
                        skip_member_db_check=True,
                    )
                    updated += 1
            else:
                HoldingService.create_holding(
                    session,
                    row.payload,
                    source="csv",
                    refresh_snapshots=False,
                    prefetched_family_id=prefetch.family_id,
                    prefetched_base_currency=prefetch.base_currency,
                    prefetched_fx_rate=fx_rate,
                    skip_member_db_check=True,
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


def _apply_import_commit_rows(
    session: Session,
    context: ImportCommitContext,
) -> ImportApplyResult:
    return _apply_parsed_rows(session, context.parsed_rows, context.prefetch)


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


def _finalize_import_commit(
    session: Session,
    context: ImportCommitContext,
    *,
    apply_result: ImportApplyResult,
) -> ImportLog:
    import_log = _create_import_log(
        session,
        family_id=context.family_id,
        filename=context.filename,
        apply_result=apply_result,
    )
    _record_import_snapshots(session, context.filename)
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
